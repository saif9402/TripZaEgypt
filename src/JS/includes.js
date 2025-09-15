// simple i18n accessor (works even if translation.js loads earlier/later)
const _t = (k, params) =>
  typeof window.t === "function" ? window.t(k, params) : k;

// ------- Utilities to include HTML fragments -------
function includeHTML(id, file, onDone) {
  // Determine base path depending on current file location
  const currentPath = window.location.pathname;
  const isInPagesFolder = currentPath.includes("/pages/");
  const fullPath = isInPagesFolder ? `../${file}` : file;

  fetch(fullPath)
    .then((res) => res.text())
    .then((html) => {
      document.getElementById(id).innerHTML = html;
      onDone?.();
    })
    .catch((err) => console.error(`Error loading ${file}:`, err));
}

// Keep this near the top so callbacks always see an initialized counter
let loadedCount = 0;
function checkAllIncludesLoaded() {
  loadedCount++;
  if (loadedCount === 2) afterIncludesLoaded(); // header + footer
}

// ------- Randomize helper (used by trending & category) -------
function _shuffleInPlace(arr) {
  // Fisher–Yates
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
// --- Global logout (works for desktop & mobile header) ---
if (!window.logout) {
  window.logout = async function logout({ redirect = "/index.html" } = {}) {
    try {
      // Call server to invalidate refresh token / session cookie
      await fetch("/api/Auth/LogOut", {
        method: "POST",
        credentials: "include", // send cookies!
        // Don't force Content-Type; many backends expect an empty body here
        headers: {
          Accept: "application/json, text/plain, */*",
        },
      }).catch((e) => {
        // Network issues shouldn't block client-side cleanup
        console.error("Logout request failed:", e);
      });
    } finally {
      // Always clear client state so header re-renders as logged-out
      try {
        localStorage.removeItem("accessToken");
      } catch {}
      window.currentUser = undefined;

      // Redirect to a neutral page (or just reload if you prefer)
      if (redirect) window.location.href = redirect;
      else window.location.reload();
    }
  };
}

// ------- Auth-aware header include (no race, single include) -------
function checkAuthAndIncludeHeader() {
  const bootTrendingIfNeeded = () => {
    // Start trending ASAP (don’t wait for footer). Guard to avoid double-boot.
    const tr = document.getElementById("trending-root");
    if (tr && !tr.__cleanup) initTopRatedSlider();
    checkAllIncludesLoaded(); // counts as the "header" load
  };

  // Optional tiny skeleton so layout doesn't jump while we check auth
  const ph = document.getElementById("header-placeholder");
  if (ph && !ph.dataset.skeleton) {
    ph.dataset.skeleton = "1";
    ph.innerHTML = `
      <header class="w-full border-b bg-white">
        <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div class="h-6 w-28 bg-gray-200 rounded"></div>
          <div class="flex items-center gap-3">
            <div class="h-8 w-20 bg-gray-200 rounded"></div>
            <div class="h-8 w-8 bg-gray-200 rounded-full"></div>
          </div>
        </div>
      </header>`;
  }

  // Always ask the server: cookie tells the truth about auth state
  fetch("/api/Auth/GetToken", {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json, text/plain" },
  })
    .then(async (res) => {
      // Some backends return text/plain; parse robustly
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      const data = ct.includes("application/json")
        ? await res.json()
        : JSON.parse(await res.text());
      console.log(data);

      if (res.ok && data?.succeeded && data?.data?.accessToken) {
        // Logged in
        window.currentUser = data.data;
        try {
          localStorage.setItem("accessToken", data.data.accessToken);
        } catch {}
        includeHTML(
          "header-placeholder",
          "pages/header-auth.html",
          bootTrendingIfNeeded
        );
      } else {
        // Not logged in
        try {
          localStorage.removeItem("accessToken");
        } catch {}
        includeHTML(
          "header-placeholder",
          "pages/header.html",
          bootTrendingIfNeeded
        );
      }
    })
    .catch((err) => {
      console.error("Auth check failed:", err);
      try {
        localStorage.removeItem("accessToken");
      } catch {}
      includeHTML(
        "header-placeholder",
        "pages/header.html",
        bootTrendingIfNeeded
      );
    });
}

window.addEventListener("DOMContentLoaded", () => {
  checkAuthAndIncludeHeader();
  includeHTML(
    "footer-placeholder",
    "pages/footer.html",
    checkAllIncludesLoaded
  );
});

// --- Top Rated (Trending) Slider with Next/Prev buttons — randomized ---
async function initTopRatedSlider(noCache = false) {
  const root = document.getElementById("trending-root");
  if (!root) return;

  // prevent duplicate timers/handlers if re-initialized (e.g., after language change)
  if (root.__cleanup) root.__cleanup();
  root.innerHTML = "";

  const langCode = localStorage.getItem("lang") || "en";
  const langId = langCode === "deu" ? 1 : 2;

  const params = new URLSearchParams({
    IsTopRated: true,
    TranslationLanguageId: langId,
    Sort: "rand", // ask the API for random
  });
  if (noCache) params.append("_ts", Date.now());

  let trips = [];
  try {
    const res = await fetch(`/api/Trip/GetAllTrips?${params.toString()}`, {
      cache: "no-store",
    });
    const json = await res.json();
    trips = json?.data?.data ?? [];
  } catch (err) {
    console.error("Failed to load top rated trips:", err);
  }

  if (!trips.length) {
    root.innerHTML = `
    <div class="max-w-7xl mx-auto p-8 text-center text-white/90">
       ${_t("empty.noTopRated")}
     </div>`;
    return;
  }

  // Force randomness even if backend ignores Sort=rand
  _shuffleInPlace(trips);

  const i18n = {
    mins: _t("trending.mins"),
    available: _t("trending.available"),
    unavailable: _t("trending.unavailable"),
    trending: _t("trending.trending"),
    book: _t("trending.book"),
    reviews: _t("trending.reviews"),
    prev: _t("trending.prev"),
    next: _t("trending.next"),
  };

  const formatPrice = (
    value,
    currency = "EUR",
    locale = langCode === "deu" ? "de-DE" : "en-EG"
  ) => {
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      return `${value} ${currency}`;
    }
  };

  const stars = (r) => {
    const v = Math.max(0, Math.min(5, Number(r) || 0));
    const full = Math.floor(v);
    return "★".repeat(full) + "☆".repeat(5 - full);
  };

  const safeImgUrl = (u) => {
    if (!u) return "img/trending.png";
    if (u.startsWith("http")) return u;
    return u.startsWith("/") ? u : `/${u}`;
  };

  const esc = (s) =>
    (s ?? "").toString().replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[c])
    );

  const activitiesToDescription = (arr, maxChars = 260) => {
    const cleaned = (arr || [])
      .map((t) => t.replace(/^[•\-\s]+/, "").trim())
      .filter(Boolean);
    const joined = cleaned.join(" • ");
    if (joined.length <= maxChars) return joined;
    return joined.slice(0, maxChars).replace(/\s+\S*$/, "") + "…";
  };

  // Viewport + slides
  const viewport = document.createElement("div");
  viewport.className = "relative max-w-7xl mx-auto h-full";
  root.appendChild(viewport);

  const makeSlide = () => {
    const div = document.createElement("div");
    div.className =
      "absolute inset-0 flex flex-col md:flex-row justify-center items-center gap-10 px-6 py-16 transition-transform duration-700 ease-out will-change-transform";
    div.style.transform = "translateX(100%)";
    return div;
  };

  const slideA = makeSlide();
  const slideB = makeSlide();
  viewport.append(slideA, slideB);

  let currentIndex = 0;
  let active = slideA;
  let next = slideB;

  const uid = () => "blobClipTrending_" + Math.random().toString(36).slice(2);

  const slideHTML = (t) => {
    const clipId = uid();
    return `
<div class="blob relative aspect-square !w-[45vw] max-w-none md:!w-[400px]">
      <svg viewBox="0 0 200 200" class="absolute w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <clipPath id="${clipId}" clipPathUnits="userSpaceOnUse">
            <path d="M49.7,-63.3C63.6,-56.7,74.2,-42.6,76.5,-27.6C78.8,-12.6,72.7,3.2,65.3,16.4C57.9,29.6,49.1,40.3,38.3,50.1C27.4,60,13.7,68.9,-2.5,72.2C-18.8,75.5,-37.6,73.3,-50.4,62.6C-63.2,51.9,-70.1,32.8,-71.8,14.8C-73.4,-3.2,-69.9,-20.1,-61.5,-34.2C-53.1,-48.3,-39.9,-59.5,-25.2,-66.6C-10.5,-73.6,5.6,-76.5,20.6,-72.3C35.6,-68.2,49.7,-56.3,49.7,-63.3Z" transform="translate(100 100)"/>
          </clipPath>
        </defs>
        <image x="0" y="0" width="200" height="200" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})" href="${esc(
      safeImgUrl(t.mainImageURL)
    )}" />
      </svg>
    </div>

    <div class="trending-text flex-1 space-y-3 md:space-y-4 trending-wrap">
      <span class="trending-pill bg-cyan-200 text-cyan-900 px-4 py-1 rounded-full text-sm font-bold inline-block">
        ${i18n.trending}
      </span>

      <a href="/pages/trip-details.html?id=${t.id || ""}" class="flex">
        <span class="trending-title text-3xl md:text-4xl font-bold text-gray-100 mb-2">
          ${esc(t.name || "Top-rated trip")}
        </span>
      </a>

      <div class="meta text-gray-100">
        <span class="trending-price text-2xl">${
          t.price != null
            ? formatPrice(t.price, "EUR") + "&nbsp;" + _t("card.perPerson")
            : ""
        }</span>
        <span class="meta-sep">|</span>
        <span class="trending-rating inline-flex items-center gap-1">
          <span class="text-yellow-400 text-lg">${stars(t.rating)}</span>
          <span class="font-semibold">${(Number(t.rating) || 0).toFixed(
            1
          )}</span>
          <span class="opacity-90">(${t.reviews ?? 0} ${i18n.reviews})</span>
        </span>
      </div>

      <p class="trending-desc text-gray-200/95 max-w-xl leading-relaxed">
        ${esc(activitiesToDescription(t.activities))}
      </p>

      <div class="trending-actions flex items-center gap-3 md:gap-4 pt-2 md:pt-4">
        <a href="/pages/trip-details.html?id=${t.id || ""}"
           class="trending-cta bg-yellow-400 hover:bg-yellow-300 text-white font-semibold px-6 py-3 shadow-lg transition">
           ${i18n.book}
        </a>
      </div>
    </div>
  `;
  };

  const renderInto = (el, trip) => {
    el.innerHTML = `
      <div class="flex flex-col md:flex-row items-center gap-10 w-full h-full">
        ${slideHTML(trip)}
      </div>`;
  };

  // initial render
  renderInto(active, trips[currentIndex]);

  // PRIME initial state
  const disableTransition = (el) => (el.style.transition = "none");
  const enableTransition = (el) => (el.style.transition = "");

  disableTransition(slideA);
  disableTransition(slideB);

  active.style.transform = "translateX(0)";
  next.style.transform = "translateX(-100%)";

  active.style.zIndex = "1";
  next.style.zIndex = "0";

  void active.offsetWidth; // reflow

  enableTransition(slideA);
  enableTransition(slideB);

  // autoplay
  const AUTOPLAY_MS = 3000;
  const FIRST_DELAY_MS = 800;
  let timer = null;
  let startedOnce = false;

  const stop = () => {
    if (timer) {
      clearTimeout(timer);
      clearInterval(timer);
      timer = null;
    }
  };

  const start = () => {
    stop();
    if (!startedOnce) {
      startedOnce = true;
      timer = setTimeout(() => {
        goNext();
        stop();
        timer = setInterval(goNext, AUTOPLAY_MS);
      }, FIRST_DELAY_MS);
    } else {
      timer = setInterval(goNext, AUTOPLAY_MS);
    }
  };

  const preloadImg = (url) => {
    try {
      const i = new Image();
      i.referrerPolicy = "no-referrer";
      i.src = url;
    } catch {}
  };

  if (trips.length > 1) {
    const n = (currentIndex + 1) % trips.length;
    preloadImg(safeImgUrl(trips[n].mainImageURL));
  }

  const goNext = () => {
    if (trips.length <= 1) return;
    const nextIndex = (currentIndex + 1) % trips.length;
    renderInto(next, trips[nextIndex]);

    next.style.transform = "translateX(100%)";
    next.style.zIndex = "2";
    active.style.zIndex = "1";

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        active.style.transform = "translateX(-100%)";
        next.style.transform = "translateX(0)";
      });
    });

    currentIndex = nextIndex;
    [active, next] = [next, active];
    next.style.zIndex = "0";

    const afterIndex = (currentIndex + 1) % trips.length;
    preloadImg(safeImgUrl(trips[afterIndex].mainImageURL));
  };

  const goPrev = () => {
    if (trips.length <= 1) return;
    const prevIndex = (currentIndex - 1 + trips.length) % trips.length;
    renderInto(next, trips[prevIndex]);

    next.style.transform = "translateX(-100%)";
    next.style.zIndex = "2";
    active.style.zIndex = "1";

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        active.style.transform = "translateX(100%)";
        next.style.transform = "translateX(0)";
      });
    });

    currentIndex = prevIndex;
    [active, next] = [next, active];
    next.style.zIndex = "0";

    const beforeIndex = (currentIndex - 1 + trips.length) % trips.length;
    preloadImg(safeImgUrl(trips[beforeIndex].mainImageURL));
  };

  const mkBtn = (side, aria) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("aria-label", aria);
    btn.className = [
      "absolute z-20 bg-white/20 hover:bg-white/30 text-white p-3 rounded-full backdrop-blur",
      "focus:outline-none focus:ring-2 focus:ring-white/60",
      "bottom-3",
      side === "left" ? "left-3" : "right-3",
      "sm:bottom-auto",
      side === "left" ? "sm:left-4" : "sm:right-4",
      "sm:top-1/2 sm:-translate-y-1/2",
    ].join(" ");
    btn.textContent = side === "left" ? "‹" : "›";
    return btn;
  };

  const prevBtn = mkBtn("left", i18n.prev);
  const nextBtn = mkBtn("right", i18n.next);
  prevBtn.classList.add("trending-nav");
  nextBtn.classList.add("trending-nav");
  prevBtn.addEventListener("click", () => {
    stop();
    goPrev();
    start();
  });
  nextBtn.addEventListener("click", () => {
    stop();
    goNext();
    start();
  });

  viewport.append(prevBtn, nextBtn);

  // swipe + keyboard
  (function enableSwipe() {
    let startX = 0,
      startY = 0,
      startT = 0,
      isDown = false,
      lockedToHorizontal = false;
    const THRESHOLD = 40;
    const MAX_TIME = 700;
    const onDown = (x, y) => {
      isDown = true;
      lockedToHorizontal = false;
      startX = x;
      startY = y;
      startT = Date.now();
    };
    const onMove = (x, y, evt) => {
      if (!isDown) return;
      const dx = x - startX;
      const dy = y - startY;
      if (!lockedToHorizontal) {
        if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
          lockedToHorizontal = Math.abs(dx) > Math.abs(dy);
        }
      }
      if (lockedToHorizontal) evt && evt.preventDefault && evt.preventDefault();
    };
    const onUp = (x, y) => {
      if (!isDown) return;
      const dx = x - startX;
      const dy = y - startY;
      const dt = Date.now() - startT;
      if (
        Math.abs(dx) > Math.abs(dy) &&
        Math.abs(dx) > THRESHOLD &&
        dt < MAX_TIME
      ) {
        if (dx < 0) goNext();
        else goPrev();
      }
      isDown = false;
      if (trips.length > 1) start();
    };

    viewport.addEventListener(
      "pointerdown",
      (e) => {
        if (e.pointerType === "touch") onDown(e.clientX, e.clientY);
      },
      { passive: true }
    );
    viewport.addEventListener(
      "pointermove",
      (e) => {
        if (e.pointerType === "touch") onMove(e.clientX, e.clientY, e);
      },
      { passive: false }
    );
    viewport.addEventListener(
      "pointerup",
      (e) => {
        if (e.pointerType === "touch") onUp(e.clientX, e.clientY);
      },
      { passive: true }
    );
    viewport.addEventListener(
      "pointercancel",
      () => {
        isDown = false;
      },
      { passive: true }
    );

    viewport.addEventListener(
      "touchstart",
      (e) => {
        const t = e.touches[0];
        if (t) onDown(t.clientX, t.clientY);
      },
      { passive: true }
    );
    viewport.addEventListener(
      "touchmove",
      (e) => {
        const t = e.touches[0];
        if (t) onMove(t.clientX, t.clientY, e);
      },
      { passive: false }
    );
    viewport.addEventListener(
      "touchend",
      (e) => {
        const t = e.changedTouches[0];
        if (t) onUp(t.clientX, t.clientY);
      },
      { passive: true }
    );
  })();

  viewport.tabIndex = 0;
  viewport.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") {
      stop();
      goNext();
      start();
    } else if (e.key === "ArrowLeft") {
      stop();
      goPrev();
      start();
    }
  });

  viewport.style.touchAction = "pan-y";

  if (trips.length > 1) start();

  window.nextTrendingSlide = goNext;
  window.prevTrendingSlide = goPrev;

  root.__cleanup = () => {
    stop();
    window.nextTrendingSlide = undefined;
    window.prevTrendingSlide = undefined;
  };
}

// ✅ Make lang switch refetch both categories & the trending slider
async function refreshLanguageDependentContent(noCache = false) {
  await Promise.allSettled([
    initTopRatedSlider(true), // force refresh
    fetchAndRenderCategories(), // repopulate header menus + category buttons
  ]);

  // ✅ If you're on the trip details page, re-fetch that too
  window.refreshTripDetailsLang?.();
}
window.refreshLangData = refreshLanguageDependentContent;

function afterIncludesLoaded() {
  const savedLang = localStorage.getItem("lang") || "en";
  if (typeof setLanguage === "function") setLanguage(savedLang);

  refreshLanguageDependentContent(); // your existing boot
  setupHomeSearch(); // 🔸 add/keep this line
  if (typeof bindPageTransitions === "function") bindPageTransitions();
}

const _NO_TRANSLATION = /^\s*No Translation data\s*$/i;
const _isMissingName = (s) => !s || _NO_TRANSLATION.test(String(s));

function _resolveCategoryNames(primaryList, fallbackList) {
  const fb = new Map((fallbackList || []).map((c) => [String(c.id), c]));
  return (primaryList || []).map((c) => {
    const primaryName = (c?.name ?? "").trim();
    let name = primaryName;

    if (_isMissingName(primaryName)) {
      const fbName = (fb.get(String(c.id))?.name ?? "").trim();
      if (!_isMissingName(fbName)) name = fbName;
    }

    // If still missing, leave as-is (you could put a generic label here)
    return { ...c, name };
  });
}

// ---- Replace your whole fetchAndRenderCategories with this version ----
async function fetchAndRenderCategories() {
  const langCode = localStorage.getItem("lang") || "en";
  const langId = langCode === "deu" ? 1 : 2;
  const fallbackLangId = langId === 1 ? 2 : 1; // if primary is German, fallback to English, else fallback to German

  const fetchCats = async (lid) => {
    try {
      const res = await fetch(`/api/Category/GetAllCategories/${lid}`, {
        cache: "no-store",
      });
      const data = await res.json();
      return data?.succeeded && data.data?.data ? data.data.data : [];
    } catch {
      return [];
    }
  };

  // Pull primary + fallback in parallel
  const [primaryCats, fallbackCats] = await Promise.all([
    fetchCats(langId),
    fetchCats(fallbackLangId),
  ]);

  if (!primaryCats.length && !fallbackCats.length) {
    console.warn("No categories found in API response");
    return;
  }

  // If primary is empty, just use fallback entirely; otherwise resolve per item
  const categories = primaryCats.length
    ? _resolveCategoryNames(primaryCats, fallbackCats)
    : _resolveCategoryNames(fallbackCats, primaryCats);

  // ---------- Sidebar ----------
  renderSidebarCategoriesList(categories);

  // ---------- Header dropdowns ----------
  const desktopDropdown = document.getElementById("tripsDropdown");
  const mobileDropdown = document.getElementById("mobileTripsDropdown");

  if (desktopDropdown) {
    desktopDropdown.innerHTML = `
      <li>
<a href="/pages/trips-list.html" class="block px-4 py-2 font-semibold text-blue-600 hover:bg-blue-50">${_t(
      "header.allTrips"
    )}</a>      </li>
      <li><hr class="border-t border-gray-200 my-1" /></li>
    `;
    categories.forEach((cat) => {
      const li = document.createElement("li");
      li.innerHTML = `<a href="/pages/trips-list.html?categoryId=${
        cat.id
      }" class="block px-4 py-2 hover:bg-gray-100">${_esc(cat.name)}</a>`;
      desktopDropdown.appendChild(li);
    });
  }

  if (mobileDropdown) {
    mobileDropdown.innerHTML = "";
    categories.forEach((cat) => {
      const li = document.createElement("li");
      li.innerHTML = `<a href="/pages/trips-list.html?categoryId=${
        cat.id
      }" class="hover:text-blue-500">${_esc(cat.name)}</a>`;
      mobileDropdown.appendChild(li);
    });
  }

  // ---------- Category filter buttons ----------
  const categoryButtons = document.getElementById("categoryButtons");
  if (categoryButtons) {
    categoryButtons.innerHTML = "";
    categories.forEach((cat, idx) => {
      const btn = document.createElement("button");
      btn.className =
        "bg-gray-100 px-4 py-1 rounded-full text-sm hover:bg-blue-400 hover:text-white transition";
      btn.textContent = cat.name;
      btn.addEventListener("click", () => {
        setActiveCategoryButton(btn);
        loadTripsByCategory(cat.id, { noCache: true });
      });
      categoryButtons.appendChild(btn);

      // Auto-load the first category once
      if (idx === 0) {
        setActiveCategoryButton(btn);
        loadTripsByCategory(cat.id);
      }
    });
  }
}

// ---------- Helpers for Category Trips ----------
const _esc = (s) =>
  (s ?? "").toString().replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c])
  );

// Inline fallback image (no DNS)
const _fallbackDataImg = () => {
  const label = _t("img.noImage");
  return (
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='450'>
       <rect width='100%' height='100%' fill='#e5e7eb'/>
       <text x='50%' y='50%' text-anchor='middle' dominant-baseline='middle'
             font-size='22' fill='#9ca3af' font-family='system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif'>${label}</text>
     </svg>`
    )
  );
};

const _safeImg = (u) =>
  !u
    ? _fallbackDataImg()
    : /^data:/i.test(u)
    ? u
    : /^https?:\/\//i.test(u)
    ? u
    : u.startsWith("//")
    ? window.location.protocol + u
    : u.startsWith("/")
    ? u
    : `/${u}`;

function _attachImgFallbacks(root = document) {
  root.querySelectorAll("img").forEach((img) => {
    img.addEventListener(
      "error",
      () => {
        if (img.src !== _fallbackDataImg()) img.src = _fallbackDataImg();
      },
      { once: true }
    );
  });
}

const _stars = (r) => {
  const v = Math.max(0, Math.min(5, Number(r) || 0));
  const full = Math.floor(v);
  return "★".repeat(full) + "☆".repeat(5 - full);
};

const _minsToLabel = (mins) => {
  const m = Number(mins) || 0;
  const h = Math.floor(m / 60),
    r = m % 60;
  const H = _t("time.hourShort");
  const M = _t("time.minShort");
  if (h && r) return `${h} ${H} ${r} ${M}`;
  if (h) return `${h} ${H}`;
  return `${m} ${M}`;
};

const _activitiesPreview = (arr, max = 220) => {
  const s = (arr || [])
    .map((t) => t.replace(/^[•\-\s]+/, "").trim())
    .filter(Boolean)
    .join(" • ");
  return s.length <= max ? s : s.slice(0, max).replace(/\s+\S*$/, "") + "…";
};

const _formatPrice = (value, currency = "EUR") => {
  const langCode = localStorage.getItem("lang") || "en";
  const locale = langCode === "deu" ? "de-DE" : "en-EG";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
};

const _skeletonCards = (n = 4) =>
  Array.from({ length: n })
    .map(
      () => `
    <div class="animate-pulse bg-white rounded-lg shadow-md overflow-hidden">
      <div class="w-full h-48 bg-gray-200"></div>
      <div class="p-4 space-y-3">
        <div class="h-5 bg-gray-200 rounded w-3/4"></div>
        <div class="h-4 bg-gray-200 rounded w-1/2"></div>
        <div class="h-4 bg-gray-200 rounded w-2/3"></div>
        <div class="h-6 bg-gray-200 rounded w-1/3"></div>
      </div>
    </div>
  `
    )
    .join("");

const _emptyState = `
  <div class="col-span-full text-center text-gray-500 py-10">
    ${_t("empty.noTripsInCategory")}
  </div>
`;

// Build one trip card
function tripCardHTML(t) {
  return `
  <a href="/pages/trip-details.html?id=${t.id ?? ""}" 
      class=" transform transition duration-300 hover:scale-105 hover:shadow-xl block bg-white rounded-lg shadow-md overflow-hidden"
      data-animate="card">
    <img src="${_esc(_safeImg(t.mainImageURL))}" alt="${_esc(
    t.name || "Trip Image"
  )}" class="trip-card__img" />
    <div class="trip-card__body">
      <h2 class="trip-card__title">${_esc(t.name || "Trip")}</h2>

      <div class="trip-card__meta">
        <div class="trip-card__row"><span class="i">🕒</span><span>${_esc(
          _minsToLabel(t.duration)
        )}</span></div>
        <div class="trip-card__row"><span class="i">🏷️</span><span>${_esc(
          t.category || ""
        )}</span></div>
        <div class="trip-card__row"><span class="i">${
          t.isAvailable ? "✅" : "⛔"
        }</span><span>${
    t.isAvailable ? _t("card.available") : _t("card.unavailable")
  }</span></div>
      </div>

      <div class="trip-card__footer">
        <div>
          <span class="trip-card__ratingStars">${_stars(t.rating)}</span>
          <span class="trip-card__reviews">${t.reviews ?? 0} ${_t(
    "card.reviews"
  )}</span>
        </div>
        <div class="trip-card__price">
          ${t.price != null ? _formatPrice(t.price, "EUR") : ""}
         <span class="trip-card__per">${_t("card.perPerson")}</span>
        </div>
      </div>
    </div>
  </a>`;
}

// ------- Main: fetch trips for a category and render (cards only) -------
async function loadTripsByCategory(categoryId, { noCache = false } = {}) {
  const langCode = localStorage.getItem("lang") || "en";
  const langId = langCode === "deu" ? 1 : 2;

  const grid = document.getElementById("categoryTrips");
  if (!grid) return;

  // skeletons while loading (more columns now that there's no featured)
  grid.innerHTML = _skeletonCards(6);

  const params = new URLSearchParams({
    CategoryId: categoryId,
    TranslationLanguageId: langId,
    PageSize: 50,
    PageNumber: 1,
  });
  params.append("Sort", "rand"); // ask backend for random
  if (noCache) params.append("_ts", Date.now());

  try {
    const res = await fetch(`/api/Trip/GetAllTrips?${params.toString()}`, {
      cache: "no-store",
    });
    const json = await res.json();
    let trips = json?.data?.data ?? [];

    // Force random order even if backend ignores Sort=rand
    _shuffleInPlace(trips);

    if (!trips.length) {
      grid.innerHTML = _emptyState;
      return;
    }

    // Render the first N trips as cards (no featured)
    const VISIBLE = Math.min(trips.length, 6);
    const cards = trips.slice(0, VISIBLE).map(tripCardHTML).join("");
    grid.innerHTML = cards || _emptyState;

    // Ensure broken images show inline fallback
    _attachImgFallbacks(grid);
  } catch (e) {
    console.error("Failed to load trips by category:", e);
    grid.innerHTML = `
      <div class="col-span-full text-center text-red-500 py-10">
        ${_t("error.loadTrips")}
      </div>
    `;
  }
}

// Optional: visually mark the active category button
function setActiveCategoryButton(clickedBtn) {
  const wrap = document.getElementById("categoryButtons");
  if (!wrap) return;
  wrap.querySelectorAll("button").forEach((b) => {
    b.classList.remove("bg-blue-500", "text-white");
    b.classList.add("bg-gray-100");
  });
  clickedBtn.classList.remove("bg-gray-100");
  clickedBtn.classList.add("bg-blue-500", "text-white");
}

// --- Sidebar categories (dynamic, i18n) ---
function i18nSidebar() {
  return { showMore: _t("sidebar.showMore"), showLess: _t("sidebar.showLess") };
}

function renderSidebarCategoriesList(categories) {
  const root = document.getElementById("sidebarCategoryList");
  const toggleBtn = document.getElementById("toggleSidebarCats");
  if (!root) return;

  const esc = (s) =>
    (s ?? "").toString().replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[c])
    );

  // mark current from ?categoryId=
  const qs = new URLSearchParams(location.search);
  const selectedId = qs.get("categoryId");

  root.innerHTML = "";
  categories.forEach((cat, idx) => {
    const id = `cat_${cat.id}`;
    const label = document.createElement("label");
    label.className =
      "inline-flex items-center gap-2" + (idx >= 7 ? " hidden extra-cat" : "");
    label.innerHTML = `
      <input type="checkbox" class="mr-2 sidebar-cat"
             id="${id}" value="${cat.id}" ${
      String(selectedId) === String(cat.id) ? "checked" : ""
    }/>
      <span>${esc(cat.name)}</span>
    `;
    root.appendChild(label);
  });

  // Show more / less if we have extras
  const extras = root.querySelectorAll(".extra-cat");
  if (extras.length) {
    const t = i18nSidebar();
    toggleBtn.textContent = t.showMore;
    toggleBtn.classList.remove("hidden");

    let open = false;
    toggleBtn.onclick = () => {
      open = !open;
      extras.forEach((el) => el.classList.toggle("hidden", !open));
      toggleBtn.textContent = open ? t.showLess : t.showMore;
    };
  } else {
    toggleBtn.classList.add("hidden");
  }

  // Single-select behavior -> update query param and refresh trips
  root.addEventListener("change", (e) => {
    const cb = e.target.closest(".sidebar-cat");
    if (!cb) return;

    // allow only one checked
    root.querySelectorAll(".sidebar-cat").forEach((x) => {
      if (x !== cb) x.checked = false;
    });

    const val = cb.checked ? cb.value : "";
    const url = new URL(location.href);
    if (val) url.searchParams.set("categoryId", val);
    else url.searchParams.delete("categoryId");
    history.replaceState(null, "", url);

    // If your trips list exposes a reload function, call it; else reload page.
    if (window.reloadTripsPage) {
      window.reloadTripsPage(1);
    } else {
      location.reload();
    }
  });
}

function setupHomeSearch() {
  const form = document.getElementById("homeSearchForm");
  if (!form) return; // only runs on the home page

  const qEl = document.getElementById("homeSearchInput");
  const sEl = document.getElementById("homeStartDate");
  const eEl = document.getElementById("homeEndDate");
  const hint = document.getElementById("homeSearchHint");

  // Build local ISO-8601 with timezone offset, e.g. 2025-08-16T00:00:00+03:00
  const toLocalISOWithOffset = (yyyy_mm_dd, endOfDay = false) => {
    if (!yyyy_mm_dd) return "";
    const [y, m, d] = yyyy_mm_dd.split("-").map(Number);

    // Local time (handles DST automatically for Africa/Cairo)
    const dt = endOfDay
      ? new Date(y, m - 1, d, 23, 59, 59, 999)
      : new Date(y, m - 1, d, 0, 0, 0, 0);

    const pad2 = (n) => String(n).padStart(2, "0");
    const year = dt.getFullYear();
    const month = pad2(dt.getMonth() + 1);
    const day = pad2(dt.getDate());
    const hh = pad2(dt.getHours());
    const mm = pad2(dt.getMinutes());
    const ss = pad2(dt.getSeconds());

    const offsetMin = -dt.getTimezoneOffset(); // e.g. +180 for UTC+3
    const sign = offsetMin >= 0 ? "+" : "-";
    const offH = pad2(Math.trunc(Math.abs(offsetMin) / 60));
    const offM = pad2(Math.abs(offsetMin) % 60);

    return `${year}-${month}-${day}T${hh}:${mm}:${ss}${sign}${offH}:${offM}`;
  };

  // ----- Flatpickr: consistent placeholders & UI on phones -----
  let sPicker = null;
  let ePicker = null;
  const hasFP = typeof flatpickr === "function";

  if (hasFP) {
    const langCode = localStorage.getItem("lang") || "en";
    const altFmt = langCode === "deu" ? "d.m.Y" : "d/m/Y"; // visible
    const valueFmt = "Y-m-d"; // stored in the original input (what we submit)

    sPicker = flatpickr("#homeStartDate", {
      altInput: true,
      altFormat: altFmt,
      dateFormat: valueFmt,
      allowInput: true,
      clickOpens: true,
      disableMobile: true,
      onChange: (dates) => {
        if (dates && dates[0]) ePicker?.set("minDate", dates[0]);
        else ePicker?.set("minDate", null);
      },
    });

    ePicker = flatpickr("#homeEndDate", {
      altInput: true,
      altFormat: altFmt,
      dateFormat: valueFmt,
      allowInput: true,
      clickOpens: true,
      disableMobile: true,
      onChange: (dates) => {
        if (dates && dates[0]) sPicker?.set("maxDate", dates[0]);
        else sPicker?.set("maxDate", null);
      },
    });

    // Visible placeholders (these show on mobile because they're regular text inputs)
    sPicker.altInput?.setAttribute("placeholder", _t("date.start"));
    ePicker.altInput?.setAttribute("placeholder", _t("date.end"));
  } else {
    // Fallback: native date inputs (placeholders may not show on some phones)
    sEl?.setAttribute("placeholder", "Start Date");
    eEl?.setAttribute("placeholder", "End Date");
  }

  // Keep EndDate >= StartDate in UI (works for both Flatpickr & native)
  const updateBounds = () => {
    const sVal = hasFP ? sPicker.input.value : sEl?.value || "";
    const eVal = hasFP ? ePicker.input.value : eEl?.value || "";

    if (hasFP) {
      if (sVal) ePicker.set("minDate", sVal);
      else ePicker.set("minDate", null);
      if (eVal) sPicker.set("maxDate", eVal);
      else sPicker.set("maxDate", null);
    } else {
      if (sEl && eEl) {
        if (sVal) eEl.min = sVal;
        else eEl.removeAttribute("min");
        if (eVal) sEl.max = eVal;
        else sEl.removeAttribute("max");
      }
    }
  };

  sEl?.addEventListener("change", updateBounds);
  eEl?.addEventListener("change", updateBounds);
  updateBounds();

  // Submit -> build URL with Search, StartDate, EndDate (ISO with TZ offset)
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();

    const q = (qEl?.value || "").trim();

    // Values from the original inputs (Y-m-d when Flatpickr is used)
    let sd = hasFP ? sPicker.input.value : sEl?.value || "";
    let ed = hasFP ? ePicker.input.value : eEl?.value || "";

    // If only one date provided, treat it as a single day
    if (sd && !ed) ed = sd;
    if (ed && !sd) sd = ed;

    // Swap if reversed
    if (sd && ed && sd > ed) [sd, ed] = [ed, sd];

    // AFTER (lowercase, date-only; trips-list.js expands to full-day ISO)
    const params = new URLSearchParams();
    if (q) params.set("search", q);
    if (sd) params.set("start", sd); // YYYY-MM-DD
    if (ed) params.set("end", ed); // YYYY-MM-DD

    hint && (hint.textContent = ""); // clear any previous hint

    const url = `/pages/trips-list.html${
      params.toString() ? "?" + params : ""
    }`;
    window.location.href = url;
  });
}
