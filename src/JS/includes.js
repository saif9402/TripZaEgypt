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

function checkAuthAndIncludeHeader() {
  const token = localStorage.getItem("accessToken");

  if (!token) {
    // Not logged in
    includeHTML(
      "header-placeholder",
      "pages/header.html",
      checkAllIncludesLoaded
    );
    return;
  }

  fetch("/api/Auth/GetToken", {
    method: "POST",
    credentials: "include",
  })
    .then(async (res) => {
      if (!res.ok) throw new Error("Response not OK");

      const text = await res.text(); // because response is text/plain
      const data = JSON.parse(text); // manually parse JSON string

      if (data?.succeeded && data?.data?.email) {
        window.currentUser = data.data;
        includeHTML(
          "header-placeholder",
          "pages/header-auth.html",
          checkAllIncludesLoaded
        );
      } else {
        localStorage.removeItem("accessToken");
        includeHTML(
          "header-placeholder",
          "pages/header.html",
          checkAllIncludesLoaded
        );
      }
    })
    .catch((err) => {
      console.error("Auth check failed:", err);
      includeHTML(
        "header-placeholder",
        "pages/header.html",
        checkAllIncludesLoaded
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

// --- Top Rated (Trending) Slider with Next/Prev buttons ---
async function initTopRatedSlider(noCache = false) {
  const root = document.getElementById("trending-root");
  if (!root) return console.warn("Missing #trending-root");

  // prevent duplicate timers/handlers if re-initialized (e.g., after language change)
  if (root.__cleanup) root.__cleanup();
  root.innerHTML = "";

  const langCode = localStorage.getItem("lang") || "en";
  const langId = langCode === "deu" ? 1 : 2;

  const params = new URLSearchParams({
    IsTopRated: true,
    TranslationLanguageId: langId,
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
        No top rated trips yet.
      </div>`;
    return;
  }

  trips.sort(
    (a, b) =>
      (b.rating ?? 0) - (a.rating ?? 0) || (b.reviews ?? 0) - (a.reviews ?? 0)
  );

  const i18n =
    langCode === "deu"
      ? {
          mins: "Min.",
          available: "Jetzt verfügbar",
          unavailable: "Derzeit nicht verfügbar",
          trending: "JETZT IM TREND",
          book: "Jetzt buchen",
          reviews: "Bewertungen",
          prev: "Vorheriger",
          next: "Nächster",
        }
      : {
          mins: "min",
          available: "Available now",
          unavailable: "Currently unavailable",
          trending: "TRENDING NOW",
          book: "Book Now",
          reviews: "reviews",
          prev: "Previous",
          next: "Next",
        };

  const formatPrice = (
    value,
    currency = "EGP",
    locale = langCode === "deu" ? "de-DE" : "en-EG"
  ) => {
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
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
      " inset-0 flex flex-col md:flex-row justify-center items-center gap-10 px-6 py-16 transition-transform duration-700 ease-out will-change-transform";
    // Starting off-screen by default; we'll prime it below
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
    <div class="relative w-[300px] h-[300px] md:w-[400px] md:h-[400px]">
      <svg viewBox="0 0 200 200" class="absolute w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <clipPath id="${clipId}" clipPathUnits="userSpaceOnUse">
            <path
              d="M49.7,-63.3C63.6,-56.7,74.2,-42.6,76.5,-27.6C78.8,-12.6,72.7,3.2,65.3,16.4C57.9,29.6,49.1,40.3,38.3,50.1C27.4,60,13.7,68.9,-2.5,72.2C-18.8,75.5,-37.6,73.3,-50.4,62.6C-63.2,51.9,-70.1,32.8,-71.8,14.8C-73.4,-3.2,-69.9,-20.1,-61.5,-34.2C-53.1,-48.3,-39.9,-59.5,-25.2,-66.6C-10.5,-73.6,5.6,-76.5,20.6,-72.3C35.6,-68.2,49.7,-56.3,49.7,-63.3Z"
              transform="translate(100 100)"/>
          </clipPath>
        </defs>
        <image x="0" y="0" width="200" height="200" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})" href="${esc(
      safeImgUrl(t.mainImageURL)
    )}" />
      </svg>
    </div>

    <div class="flex-1 space-y-4">
      <span class="bg-cyan-200 text-cyan-900 px-4 py-1 rounded-full text-sm font-bold inline-block">${
        i18n.trending
      }</span>

      <a href="/pages/trip-details.html?id=${t.id || ""}" class="flex">
        <span class="text-3xl font-bold text-gray-100 mb-2">${esc(
          t.name || "Top-rated trip"
        )}</span>
      </a>

      <div class="flex items-center text-sm space-x-3 text-gray-100">
        <span class="font-semibold text-2xl">${
          t.price != null ? formatPrice(t.price, "EGP") + " / person" : ""
        }</span>
        <span>|</span>
        <span class="flex items-center gap-1">
          <span class="text-yellow-400 text-lg">${stars(t.rating)}</span>
          <span class="font-semibold">${(Number(t.rating) || 0).toFixed(
            1
          )}</span>
          (<span>${t.reviews ?? 0} ${i18n.reviews}</span>)
        </span>
      </div>

      <p class="text-gray-200/95 max-w-xl leading-relaxed">
        ${esc(activitiesToDescription(t.activities))}
      </p>

      <div class="flex items-center gap-4 pt-4">
        <a href="/pages/trip-details.html?id=${t.id || ""}"
           class="bg-yellow-400 hover:bg-yellow-300 text-white font-semibold px-6 py-3 rounded-full shadow-lg transition">
           ${i18n.book}
        </a>
        <button class="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur text-white flex items-center justify-center">🤍</button>
        <button class="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur text-white flex items-center justify-center">🔗</button>
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

  // --- PRIME INITIAL STATE so first transition animates correctly ---
  const disableTransition = (el) => (el.style.transition = "none");
  const enableTransition = (el) => (el.style.transition = "");

  disableTransition(slideA);
  disableTransition(slideB);

  active.style.transform = "translateX(0)"; // on screen
  next.style.transform = "translateX(100%)"; // off right

  // layering
  active.style.zIndex = "1";
  next.style.zIndex = "0";

  // force reflow to commit starting transforms without animating
  void active.offsetWidth;

  enableTransition(slideA);
  enableTransition(slideB);

  const AUTOPLAY_MS = 3000;
  let timer = null;

  const start = () => {
    stop();
    timer = setInterval(goNext, AUTOPLAY_MS);
  };
  const stop = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  // expose a cleanup to callers (e.g., before re-init)
  root.__cleanup = () => {
    stop();
    // optional: remove global handles
    window.nextTrendingSlide = undefined;
    window.prevTrendingSlide = undefined;
  };

  const goNext = () => {
    if (trips.length <= 1) return;
    const nextIndex = (currentIndex + 1) % trips.length;
    renderInto(next, trips[nextIndex]);

    // position incoming to the right and bring it on top
    next.style.transform = "translateX(100%)";
    next.style.zIndex = "2";
    active.style.zIndex = "1";

    // Double rAF to ensure styles are committed before animating
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        active.style.transform = "translateX(-100%)";
        next.style.transform = "translateX(0)";
      });
    });

    currentIndex = nextIndex;
    [active, next] = [next, active];

    // the one that became "next" goes under
    next.style.zIndex = "0";
  };

  const goPrev = () => {
    if (trips.length <= 1) return;
    const prevIndex = (currentIndex - 1 + trips.length) % trips.length;
    renderInto(next, trips[prevIndex]);

    // position incoming to the left and bring it on top
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
  };

  // --- Buttons (injected) ---
  const mkBtn = (side, label, aria) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("aria-label", aria);
    btn.className =
      `absolute top-1/2 ${
        side === "left" ? "left-4" : "right-4"
      } -translate-y-1/2` +
      " bg-white/20 hover:bg-white/30 text-white p-3 rounded-full backdrop-blur z-20 focus:outline-none focus:ring-2 focus:ring-white/60";
    btn.textContent = side === "left" ? "‹" : "›";
    return btn;
  };

  const prevBtn = mkBtn("left", i18n.prev, i18n.prev);
  const nextBtn = mkBtn("right", i18n.next, i18n.next);

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

  // Keyboard support
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

  // start autoplay if more than one slide
  if (trips.length > 1) start();

  // Expose manual controls
  window.nextTrendingSlide = goNext;
  window.prevTrendingSlide = goPrev;
}

// ✅ Make lang switch refetch both categories & the trending slider
async function refreshLanguageDependentContent() {
  await Promise.allSettled([
    initTopRatedSlider(true),
    fetchAndRenderCategories(),
  ]);
}
window.refreshLangData = refreshLanguageDependentContent;

// ✅ After header/footer are included, run once
function afterIncludesLoaded() {
  const savedLang = localStorage.getItem("lang") || "en";
  setLanguage(savedLang);

  fetchAndRenderCategories();
  initTopRatedSlider(); // ← replaced old fetchAndRenderTrendingTrip()

  if (typeof bindPageTransitions === "function") {
    bindPageTransitions();
  }
}

function fetchAndRenderCategories() {
  const langCode = localStorage.getItem("lang") || "en";
  const langId = langCode === "deu" ? 1 : 2;

  fetch(`/api/Category/GetAllCategories/${langId}`)
    .then((res) => res.json())
    .then((data) => {
      if (data.succeeded && data.data?.data) {
        const categories = data.data.data;

        // 1️⃣ Render Header Dropdowns (already existing)
        const desktopDropdown = document.getElementById("tripsDropdown");
        const mobileDropdown = document.getElementById("mobileTripsDropdown");

        if (desktopDropdown) {
          desktopDropdown.innerHTML = `
            <li>
              <a href="/pages/trips-list.html" class="block px-4 py-2 font-semibold text-blue-600 hover:bg-blue-50">All Trips</a>
            </li>
            <li><hr class="border-t border-gray-200 my-1" /></li>
          `;
          categories.forEach((cat) => {
            const li = document.createElement("li");
            li.innerHTML = `<a href="/pages/trips-list.html?categoryId=${cat.id}" class="block px-4 py-2 hover:bg-gray-100">${cat.name}</a>`;
            desktopDropdown.appendChild(li);
          });
        }

        if (mobileDropdown) {
          mobileDropdown.innerHTML = "";
          categories.forEach((cat) => {
            const li = document.createElement("li");
            li.innerHTML = `<a href="/pages/trips-list.html?categoryId=${cat.id}" class="hover:text-blue-500">${cat.name}</a>`;
            mobileDropdown.appendChild(li);
          });
        }

        // 2️⃣ Render Category Filter Buttons
        const categoryButtons = document.getElementById("categoryButtons");
        if (categoryButtons) {
          categoryButtons.innerHTML = "";
          categories.forEach((cat) => {
            const btn = document.createElement("button");
            btn.className =
              "bg-gray-100 px-4 py-1 rounded-full text-sm hover:bg-blue-400 hover:text-white transition";
            btn.textContent = cat.name;
            btn.addEventListener("click", () => loadTripsByCategory(cat.id));
            categoryButtons.appendChild(btn);
          });
        }
      } else {
        console.warn("No categories found in API response");
      }
    })
    .catch((err) => {
      console.error("Error loading categories for header & filter:", err);
    });
}

let loadedCount = 0;
function checkAllIncludesLoaded() {
  loadedCount++;
  if (loadedCount === 2) afterIncludesLoaded(); // header + footer
}
