// ../JS/trip-details.js
(function () {
  const $ = (id) => document.getElementById(id);

  // ---------- Image fallbacks (no external DNS needed) ----------
  const FALLBACK_DATA_IMG =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='800'>
         <rect width='100%' height='100%' fill='#e5e7eb'/>
         <text x='50%' y='50%' text-anchor='middle' dominant-baseline='middle'
               font-size='36' fill='#9ca3af' font-family='system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif'>
           No Image
         </text>
       </svg>`
    );

  function safeImg(u) {
    if (!u) return FALLBACK_DATA_IMG;
    if (/^data:/i.test(u)) return u;
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith("//")) return window.location.protocol + u;
    return u.startsWith("/") ? u : `/${u}`;
  }

  function attachImgFallbacks(root = document) {
    root.querySelectorAll("img").forEach((img) => {
      img.addEventListener(
        "error",
        () => {
          if (img.src !== FALLBACK_DATA_IMG) img.src = FALLBACK_DATA_IMG;
        },
        { once: true }
      );
    });
  }

  // ---------- Utils ----------
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

  const minsToLabel = (mins) => {
    const m = Number(mins) || 0;
    const h = Math.floor(m / 60);
    const r = m % 60;
    if (h && r) return `${h} h ${r} min`;
    if (h) return `${h} h`;
    return `${m} min`;
  };

  const stars = (r) => {
    const v = Math.max(0, Math.min(5, Number(r) || 0));
    const full = Math.floor(v);
    const half = v - full >= 0.5 ? 1 : 0;
    return "★".repeat(full + half) + "☆".repeat(5 - full - half);
  };

  const formatPrice = (value, currency = "EUR") => {
    const lang = localStorage.getItem("lang") || "en";
    const locale = lang === "deu" ? "de-DE" : "en-EG";
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

  const getLangId = () => (localStorage.getItem("lang") === "deu" ? 1 : 2);
  const getTripIdFromUrl = () =>
    new URL(window.location.href).searchParams.get("id");

  const setUnavailableUI = (isAvailable) => {
    const btn = $("bookBtn");
    if (!btn) return;
    if (isAvailable) {
      btn.disabled = false;
      btn.classList.remove("opacity-50", "cursor-not-allowed");
      btn.textContent = "Confirm Booking";
    } else {
      btn.disabled = true;
      btn.classList.add("opacity-50", "cursor-not-allowed");
      btn.textContent = "Currently Unavailable";
    }
  };

  // ---------------- Toasts (Tailwind-ish) ----------------
  function ensureToastRoot() {
    let root = document.getElementById("toast-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "toast-root";
      root.className =
        "fixed z-[70] top-4 right-4 w-[92vw] max-w-sm space-y-3 pointer-events-none";
      document.body.appendChild(root);
    }
    return root;
  }
  function toast(type, title, message, ms = 4200) {
    const root = ensureToastRoot();
    const wrap = document.createElement("div");
    wrap.className =
      "pointer-events-auto rounded-xl shadow-lg border overflow-hidden bg-white";
    const color =
      type === "success"
        ? "bg-green-600"
        : type === "error"
        ? "bg-red-600"
        : type === "warning"
        ? "bg-yellow-500"
        : "bg-blue-600";
    wrap.innerHTML = `
      <div class="${color} text-white px-4 py-2 text-sm font-semibold">${esc(
      title || ""
    )}</div>
      <div class="px-4 py-3 text-sm text-gray-700">${esc(message || "")}</div>
    `;
    root.appendChild(wrap);
    const timer = setTimeout(() => {
      wrap.style.opacity = "0";
      wrap.style.transform = "translateY(-6px)";
      setTimeout(() => wrap.remove(), 200);
    }, ms);
    wrap.addEventListener("click", () => {
      clearTimeout(timer);
      wrap.remove();
    });
  }

  // ---------------- Auth helpers ----------------
  const LOGIN_URL = "sign-in.html"; // change if different

  const parseMaybeTextJSON = async (res) => {
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("application/json")) return res.json();
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  };

  function redirectToLogin() {
    const returnUrl = encodeURIComponent(
      location.pathname + location.search + location.hash
    );
    location.href = `${LOGIN_URL}?returnUrl=${returnUrl}`;
  }

  async function getFreshAccessToken() {
    const res = await fetch("/api/Auth/GetToken", {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json, text/plain" },
    });

    if (!res.ok) {
      const err = new Error("Auth token refresh failed");
      err.status = res.status;
      throw err;
    }

    const data = await parseMaybeTextJSON(res);
    if (data?.succeeded && data?.data?.accessToken) {
      try {
        localStorage.setItem("accessToken", data.data.accessToken);
      } catch {}
      window.currentUser = data.data;
      return data.data.accessToken;
    }
    const err = new Error(data?.message || "Not authenticated");
    err.code = "AUTH";
    throw err;
  }

  async function ensureLoggedInOrRedirect() {
    try {
      await getFreshAccessToken();
      return true;
    } catch (e) {
      toast("info", "Sign in required", "Please sign in to continue.");
      redirectToLogin();
      return false;
    }
  }

  async function addBooking({ tripId, tripDateISO, adults, children }) {
    const token = await getFreshAccessToken();

    const res = await fetch("/api/Booking/AddBooking", {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json, text/plain",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        adults: Number(adults) || 0,
        children: Number(children) || 0,
        tripDate: String(tripDateISO),
        tripId: Number(tripId),
      }),
    });

    const payload = await parseMaybeTextJSON(res);

    if (!res.ok || payload?.succeeded === false) {
      const msg =
        payload?.message ||
        (Array.isArray(payload?.errors) && payload.errors[0]) ||
        `Booking failed (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      err.details = payload;
      throw err;
    }

    return payload;
  }

  // ---------------- Availability (dates + times) ----------------
  const fmtDateKey = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };

  const timeLabel = (d) => {
    const lang = localStorage.getItem("lang") === "deu" ? "de-DE" : "en-EG";
    return d.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" });
  };

  const buildAvailability = (dateStrings = []) => {
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    const timesByDay = {};
    const days = [];

    const slots = dateStrings
      .map((s) => ({ raw: s, d: new Date(s) }))
      .filter(({ d }) => !isNaN(d) && d >= todayStart)
      .sort((a, b) => a.d - b.d);

    for (const { raw, d } of slots) {
      const key = fmtDateKey(d);
      if (!timesByDay[key]) {
        timesByDay[key] = [];
        days.push(key);
      }
      timesByDay[key].push({ label: timeLabel(d), value: raw, date: d });
    }

    for (const k of days) {
      timesByDay[k].sort((a, b) => a.date - b.date);
    }

    return { days, timesByDay };
  };

  let datePickerInstance = null;
  let availability = { days: [], timesByDay: {} };

  const syncTimeOptions = (dayKey) => {
    const sel = $("tripTimeSelect");
    if (!sel) return;

    const now = new Date();
    let options = availability.timesByDay[dayKey] || [];
    if (dayKey === fmtDateKey(now))
      options = options.filter((o) => o.date > now);

    if (!options.length) {
      sel.innerHTML = `<option value="">No times available</option>`;
      sel.disabled = true;
    } else {
      sel.disabled = false;
      sel.innerHTML = options
        .map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`)
        .join("");
    }
  };

  const setupAvailability = (tripDates = []) => {
    const dateInput = $("tripDateInput");
    const timeSelect = $("tripTimeSelect");
    if (!dateInput || !timeSelect) return;

    availability = buildAvailability(tripDates);

    if (!availability.days.length) {
      try {
        datePickerInstance?.destroy?.();
      } catch {}
      dateInput.value = "";
      dateInput.placeholder = "No available dates";
      dateInput.disabled = true;
      timeSelect.innerHTML = `<option value="">No times available</option>`;
      timeSelect.disabled = true;
      return;
    }

    if (window.flatpickr) {
      try {
        datePickerInstance?.destroy?.();
      } catch {}
      datePickerInstance = flatpickr(dateInput, {
        dateFormat: "Y-m-d",
        minDate: availability.days[0],
        enable: availability.days,
        defaultDate: availability.days[0],
        disableMobile: true,
        onChange: (selectedDates) => {
          const d = selectedDates && selectedDates[0];
          if (d) syncTimeOptions(fmtDateKey(d));
        },
      });

      syncTimeOptions(availability.days[0]);
    } else {
      dateInput.type = "date";
      dateInput.min = availability.days[0];
      dateInput.value = availability.days[0];
      dateInput.disabled = false;

      dateInput.addEventListener("change", () => {
        const val = dateInput.value;
        if (!availability.days.includes(val)) {
          dateInput.value = availability.days[0];
          syncTimeOptions(availability.days[0]);
        } else {
          syncTimeOptions(val);
        }
      });

      syncTimeOptions(availability.days[0]);
    }
  };

  // ---------------- Ensure Related DOM IDs exist ----------------
  function ensureRelatedDOM() {
    if (
      document.getElementById("relatedGrid") &&
      document.getElementById("relatedPrevBtn") &&
      document.getElementById("relatedNextBtn")
    )
      return;

    const sections = Array.from(document.querySelectorAll("section"));
    const sec = sections.find((s) => {
      const h2 = s.querySelector("h2");
      return h2 && /related tours/i.test(h2.textContent || "");
    });
    if (!sec) return;

    const headerBtns = sec.querySelectorAll("button");
    if (headerBtns[0] && !headerBtns[0].id) headerBtns[0].id = "relatedPrevBtn";
    if (headerBtns[1] && !headerBtns[1].id) headerBtns[1].id = "relatedNextBtn";

    const grid = sec.querySelector("div.grid");
    if (grid && !grid.id) grid.id = "relatedGrid";
  }

  // ---------------- Related trips (2 on small, 3 on ≥md) ----------------
  const relatedState = {
    trips: [],
    page: 0,
    windowSize: getRelatedWindowSize(),
  };

  function getRelatedWindowSize() {
    return window.matchMedia("(min-width: 768px)").matches ? 3 : 2;
  }

  function clampPage(total, win) {
    const pages = Math.max(1, Math.ceil(total / win));
    if (relatedState.page >= pages) relatedState.page = pages - 1;
    if (relatedState.page < 0) relatedState.page = 0;
    return pages;
  }

  function applyGridColumns(grid, cols) {
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = `repeat(${Math.max(
      cols,
      1
    )}, minmax(0, 1fr))`;
    grid.style.gap = "1.5rem"; // gap-6
  }

  function renderRelatedPage() {
    const grid = $("relatedGrid");
    if (!grid) return;

    const total = relatedState.trips.length;
    const win = relatedState.windowSize || 2;
    const pages = clampPage(total, win);

    applyGridColumns(grid, Math.min(win, total || win));

    if (!total) {
      grid.innerHTML = `<div class="col-span-full text-center text-gray-500 py-8">No related trips found.</div>`;
    } else {
      const start = relatedState.page * win;
      const slice = relatedState.trips.slice(start, start + win);

      // Use global tripCardHTML if available
      if (typeof tripCardHTML === "function") {
        grid.innerHTML = slice.map((t) => tripCardHTML(t)).join("");
      } else {
        grid.innerHTML = slice
          .map(
            (t) => `
            <a href="/pages/trip-details.html?id=${t.id ?? ""}"
               class="block bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition"
               data-animate="card">
              <img class="w-full h-40 object-cover"
                   src="${esc(safeImg(t.mainImageURL))}"
                   alt="${esc(t.name || "Trip")}" />
              <div class="p-4">
                <h3 class="text-sm font-semibold mb-2">${esc(
                  t.name || "Trip"
                )}</h3>
                <ul class="text-xs text-gray-600 space-y-1 mb-3">
                  <li><i class="fas fa-clock mr-1"></i> ${esc(
                    minsToLabel(t.duration)
                  )}</li>
                  <li><i class="fas fa-users mr-1"></i> ${
                    Number(t.reviews) || 0
                  } reviews</li>
                </ul>
                <div class="flex justify-between items-center text-sm">
                  <div class="text-yellow-500">${esc(stars(t.rating))}</div>
                  <div class="text-green-600 font-semibold">
                    ${t.price != null ? esc(formatPrice(t.price, "EUR")) : ""}
                    <span class="text-gray-400 text-xs">per person</span>
                  </div>
                </div>
              </div>
            </a>`
          )
          .join("");
      }
    }

    // attach image fallbacks for the freshly injected cards
    attachImgFallbacks(grid);

    // Enable/disable arrows
    const prev = $("relatedPrevBtn");
    const next = $("relatedNextBtn");
    const disabled = pages <= 1;
    if (prev) prev.disabled = disabled;
    if (next) next.disabled = disabled;
    if (prev) prev.classList.toggle("opacity-40", disabled);
    if (next) next.classList.toggle("opacity-40", disabled);
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), ms);
    };
  }

  function wireRelatedNav() {
    const prev = $("relatedPrevBtn");
    const next = $("relatedNextBtn");

    prev?.addEventListener("click", () => {
      const total = relatedState.trips.length;
      const win = relatedState.windowSize;
      const pages = Math.max(1, Math.ceil(total / win));
      if (pages <= 1) return;
      relatedState.page = (relatedState.page - 1 + pages) % pages;
      renderRelatedPage();
    });
    next?.addEventListener("click", () => {
      const total = relatedState.trips.length;
      const win = relatedState.windowSize;
      const pages = Math.max(1, Math.ceil(total / win));
      if (pages <= 1) return;
      relatedState.page = (relatedState.page + 1) % pages;
      renderRelatedPage();
    });

    // Recalc window size on resize
    const onResize = () => {
      const newWin = getRelatedWindowSize();
      if (newWin !== relatedState.windowSize) {
        relatedState.windowSize = newWin;
        renderRelatedPage();
      }
    };
    window.addEventListener("resize", debounce(onResize, 120));
  }

  async function resolveCategoryIdFromTrip(trip) {
    if (trip?.categoryId) return trip.categoryId;
    if (trip?.category?.id) return trip.category.id;

    const langId = getLangId();
    try {
      const res = await fetch(`/api/Category/GetAllCategories/${langId}`);
      const json = await res.json();
      const cats = json?.data?.data || [];
      const wanted = ((trip?.categoryName ?? trip?.category) || "")
        .toString()
        .trim()
        .toLowerCase();
      const match = cats.find(
        (c) => (c?.name || "").toString().trim().toLowerCase() === wanted
      );
      return match?.id ?? null;
    } catch {
      return null;
    }
  }

  async function loadRelatedTripsForTrip(trip, { noCache = false } = {}) {
    const grid = $("relatedGrid");
    if (!grid) return;

    // skeletons
    grid.innerHTML = `
      <div class="animate-pulse bg-white rounded-lg shadow-md overflow-hidden">
        <div class="w-full h-40 bg-gray-200"></div>
        <div class="p-4 space-y-3">
          <div class="h-5 bg-gray-200 rounded w-3/4"></div>
          <div class="h-4 bg-gray-200 rounded w-1/2"></div>
          <div class="h-4 bg-gray-200 rounded w-2/3"></div>
        </div>
      </div>`.repeat(relatedState.windowSize);

    const categoryId = await resolveCategoryIdFromTrip(trip);
    if (!categoryId) {
      grid.innerHTML = `<div class="col-span-full text-center text-gray-500 py-8">No category found for this trip.</div>`;
      return;
    }

    const langId = getLangId();
    const params = new URLSearchParams({
      CategoryId: String(categoryId),
      TranslationLanguageId: String(langId),
      PageSize: "50",
      PageNumber: "1",
    });
    params.append("Sort", "rand");
    if (noCache) params.append("_ts", Date.now());

    let trips = [];
    try {
      const res = await fetch(`/api/Trip/GetAllTrips?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      trips = json?.data?.data ?? [];
    } catch (e) {
      console.error("Related trips load error:", e);
      grid.innerHTML = `<div class="col-span-full text-center text-red-500 py-8">Couldn't load related trips.</div>`;
      return;
    }

    // Exclude current trip
    const currentId = getTripIdFromUrl();
    relatedState.trips = trips.filter(
      (t) => String(t.id) !== String(currentId)
    );
    relatedState.page = 0;

    renderRelatedPage();
  }

  // ---------------- Image modal ----------------
  let imageList = [];
  let currentIndex = 0;

  const modal = $("imageModal");
  const modalImg = $("modalImage");
  const modalPrevBtn = $("modalPrevBtn");
  const modalNextBtn = $("modalNextBtn");
  const modalCloseBtn = $("modalCloseBtn");
  const modalBackdrop = $("imageModalBackdrop");

  const isModalOpen = () =>
    modal &&
    modal.classList.contains("opacity-100") &&
    !modal.classList.contains("pointer-events-none");

  const openModalAt = (idx = 0) => {
    if (!modal || !modalImg || !imageList.length) return;

    currentIndex = Math.max(0, Math.min(idx, imageList.length - 1));
    modalImg.src = safeImg(imageList[currentIndex]);

    modal.classList.remove("opacity-0", "pointer-events-none");
    modal.classList.add("opacity-100", "pointer-events-auto");

    requestAnimationFrame(() => {
      modalImg.classList.remove("opacity-0", "scale-90");
      modalImg.classList.add("opacity-100", "scale-100");
    });
  };

  const closeModal = () => {
    if (!modal || !modalImg) return;
    modalImg.classList.remove("opacity-100", "scale-100");
    modalImg.classList.add("opacity-0", "scale-90");
    modal.classList.remove("opacity-100");
    modal.classList.add("opacity-0", "pointer-events-none");

    const main = $("tripMainImage");
    if (main && imageList[currentIndex]) {
      main.src = safeImg(imageList[currentIndex]);
    }
  };

  const transitionImage = (newSrc) => {
    if (!modalImg) return;
    modalImg.classList.remove("opacity-100", "scale-100");
    modalImg.classList.add("opacity-0", "scale-90");
    setTimeout(() => {
      modalImg.src = safeImg(newSrc);
      modalImg.classList.remove("opacity-0", "scale-90");
      modalImg.classList.add("opacity-100", "scale-100");
    }, 150);
  };

  const showNext = () => {
    if (!imageList.length) return;
    currentIndex = (currentIndex + 1) % imageList.length;
    transitionImage(imageList[currentIndex]);
  };

  const showPrev = () => {
    if (!imageList.length) return;
    currentIndex = (currentIndex - 1 + imageList.length) % imageList.length;
    transitionImage(imageList[currentIndex]);
  };

  document.addEventListener("keydown", (e) => {
    if (!isModalOpen()) return;
    if (e.key === "ArrowRight") showNext();
    else if (e.key === "ArrowLeft") showPrev();
    else if (e.key === "Escape") closeModal();
  });

  modalPrevBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    showPrev();
  });
  modalNextBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    showNext();
  });
  modalCloseBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    closeModal();
  });
  modalBackdrop?.addEventListener("click", closeModal);

  const renderGallery = (urls) => {
    const main = $("tripMainImage");
    const gal = $("tripGallery");

    imageList = (urls && urls.length ? urls : [""]).map(safeImg);

    if (main) {
      main.src = imageList[0];
      main.addEventListener("click", () => openModalAt(currentIndex));
      // main image fallback
      main.addEventListener(
        "error",
        () => {
          main.src = FALLBACK_DATA_IMG;
        },
        { once: true }
      );
    }

    if (!gal) return;
    gal.innerHTML = imageList
      .map(
        (u, idx) => `
        <img
          alt="Thumbnail ${idx + 1}"
          class="rounded-md w-full h-24 sm:h-28 object-cover cursor-pointer ring-0 hover:ring-2 hover:ring-yellow-400 transition"
          src="${esc(u)}"
          data-index="${idx}"
        />`
      )
      .join("");

    // attach fallbacks for thumbnails
    attachImgFallbacks(gal);

    gal.querySelectorAll("img").forEach((thumb) => {
      thumb.addEventListener("click", () => {
        const idx = Number(thumb.getAttribute("data-index")) || 0;
        currentIndex = idx;
        openModalAt(idx);
      });
    });
  };

  // ---------------- Render trip ----------------
  let currentTrip = null;

  const renderTrip = (t) => {
    currentTrip = t || {};

    $("tripTitle") && ($("tripTitle").textContent = t.name || "Trip");

    const ratingVal = Number(t.rating) || 0;
    $("tripRatingStars") &&
      ($("tripRatingStars").textContent = stars(ratingVal));
    $("tripRatingText") &&
      ($("tripRatingText").textContent = ratingVal
        ? `(${ratingVal.toFixed(1)})`
        : "");

    const galleryUrls = [];
    if (t.mainImage?.imageURL) galleryUrls.push(t.mainImage.imageURL);
    (t.images || []).forEach(
      (img) => img?.imageURL && galleryUrls.push(img.imageURL)
    );
    // if API only gives mainImageURL (string), include it
    if (t.mainImageURL && !galleryUrls.length) galleryUrls.push(t.mainImageURL);
    renderGallery(galleryUrls.length ? galleryUrls : [""]);

    $("tripDurationLabel") &&
      ($("tripDurationLabel").textContent = `Duration ${minsToLabel(
        t.duration
      )}`);

    if ($("tripLanguages")) {
      const langs = (t.languages || []).filter(Boolean).join(", ");
      $("tripLanguages").textContent = langs || "—";
    }

    $("tripDescription") &&
      ($("tripDescription").innerText = `${t.description}` || "");

    if ($("tripActivities")) {
      $("tripActivities").innerHTML = (t.activities || [])
        .map((a) => `<li>${esc(a)}</li>`)
        .join("");
    }

    if ($("tripIncluded")) {
      $("tripIncluded").innerHTML = (t.includes || [])
        .map((i) => `<li>${esc(i)}</li>`)
        .join("");
    }
    if ($("tripExcluded")) {
      $("tripExcluded").innerHTML = (t.notIncludes || [])
        .map((i) => `<li>${esc(i)}</li>`)
        .join("");
    }

    $("tripPrice") &&
      ($("tripPrice").innerHTML =
        t.price != null ? `${formatPrice(t.price, "EUR")}` : "");

    setUnavailableUI(!!t.isAvailable);

    setupAvailability(t.tripDates || []);

    // Load related trips for this category
    loadRelatedTripsForTrip(t);
  };

  // ---------------- Load trip ----------------
  async function loadTrip({ noCache = false } = {}) {
    const id = getTripIdFromUrl();
    if (!id) {
      console.warn("No ?id= in URL");
      return;
    }

    const langId = getLangId();
    const params = new URLSearchParams({
      TranslationLanguageId: String(langId),
    });
    if (noCache) params.append("_ts", Date.now());

    try {
      const res = await fetch(
        `/api/Trip/GetTripById/${encodeURIComponent(id)}?` + params.toString(),
        { cache: "no-store" }
      );
      const json = await res.json();

      if (!json?.succeeded)
        throw new Error(json?.message || "Failed to fetch trip");

      renderTrip(json.data || {});
    } catch (err) {
      console.error("Trip load error:", err);
      $("tripTitle") && ($("tripTitle").textContent = "Trip not available");
      $("tripDescription") &&
        ($("tripDescription").textContent =
          "We couldn't load this trip right now. Please try again later.");
      setUnavailableUI(false);
      renderGallery([""]);
      setupAvailability([]);
      const grid = $("relatedGrid");
      if (grid)
        grid.innerHTML = `<div class="col-span-full text-center text-gray-500 py-8">No related trips.</div>`;
    }
  }

  window.refreshTripDetailsLang = () => loadTrip({ noCache: true });

  // ---------------- Booking Confirmation Modal ----------------
  const bModal = $("bookingModal");
  const bBackdrop = $("bookingBackdrop");
  const bClose = $("bookingCloseBtn");
  const bEdit = $("bookingEditBtn");
  const bConfirm = $("bookingConfirmBtn");

  const bmTripName = $("bmTripName");
  const bmDate = $("bmDate");
  const bmTime = $("bmTime");
  const bmAdults = $("bmAdults");
  const bmChildren = $("bmChildren");
  const bmPriceAdult = $("bmPriceAdult");
  const bmPriceChild = $("bmPriceChild");
  const bmTotal = $("bmTotal");

  const openBookingModal = () => {
    if (!bModal) return;
    bModal.classList.remove("opacity-0", "pointer-events-none");
    bModal.classList.add("opacity-100", "pointer-events-auto");
    bModal.setAttribute("aria-hidden", "false");
  };

  const closeBookingModal = () => {
    if (!bModal) return;
    bModal.classList.remove("opacity-100");
    bModal.classList.add("opacity-0", "pointer-events-none");
    bModal.setAttribute("aria-hidden", "true");
  };

  bBackdrop?.addEventListener("click", closeBookingModal);
  bClose?.addEventListener("click", closeBookingModal);
  bEdit?.addEventListener("click", closeBookingModal);

  $("bookBtn")?.addEventListener("click", async () => {
    const dateVal =
      (datePickerInstance?.selectedDates?.[0] &&
        fmtDateKey(datePickerInstance.selectedDates[0])) ||
      $("tripDateInput")?.value ||
      "";

    const timeISO = $("tripTimeSelect")?.value || "";
    const adultCount = Math.max(1, parseInt($("adultCount")?.value || "1", 10));
    const childCount = Math.max(0, parseInt($("childCount")?.value || "0", 10));

    if (!dateVal || !timeISO) {
      toast(
        "warning",
        "Select date & time",
        "Please choose an available date and time."
      );
      return;
    }

    const logged = await ensureLoggedInOrRedirect();
    if (!logged) return;

    const perAdult = Number(currentTrip?.price) || 0;
    const perChild = perAdult * 0.5;
    const total = perAdult * adultCount + perChild * childCount;

    bmTripName && (bmTripName.textContent = currentTrip?.name || "Trip");
    bmDate && (bmDate.textContent = dateVal);

    const t = new Date(timeISO);
    const lang = localStorage.getItem("lang") === "deu" ? "de-DE" : "en-EG";
    bmTime &&
      (bmTime.textContent = isNaN(t)
        ? ""
        : t.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" }));

    bmAdults && (bmAdults.textContent = String(adultCount));
    bmChildren && (bmChildren.textContent = String(childCount));
    bmPriceAdult && (bmPriceAdult.textContent = formatPrice(perAdult, "EUR"));
    bmPriceChild && (bmPriceChild.textContent = formatPrice(perChild, "EUR"));
    bmTotal && (bmTotal.textContent = formatPrice(total, "EUR"));

    bConfirm.dataset.payload = JSON.stringify({
      tripId: getTripIdFromUrl(),
      tripName: currentTrip?.name || "",
      date: dateVal,
      timeISO,
      adults: adultCount,
      children: childCount,
      perAdult,
      perChild,
      total,
    });

    openBookingModal();
  });

  bConfirm?.addEventListener("click", async () => {
    if (!bConfirm) return;

    let payload;
    try {
      payload = JSON.parse(bConfirm.dataset.payload || "{}");
    } catch {
      toast("error", "Missing details", "Please review your booking details.");
      return;
    }

    const originalText = bConfirm.textContent;
    bConfirm.disabled = true;
    bConfirm.textContent = "Booking…";

    try {
      await addBooking({
        tripId: payload.tripId,
        tripDateISO: payload.timeISO,
        adults: payload.adults,
        children: payload.children,
      });

      closeBookingModal();

      const timeTxt =
        new Date(payload.timeISO).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }) || "";
      toast(
        "success",
        "Booking confirmed",
        `Trip: ${payload.tripName} • ${
          payload.date
        } ${timeTxt}\nTotal: ${formatPrice(payload.total, "EUR")}`
      );
    } catch (e) {
      console.error("Booking error:", e);
      if (e?.status === 401 || e?.status === 403 || e?.code === "AUTH") {
        toast(
          "info",
          "Sign in required",
          "Please sign in to complete your booking."
        );
        redirectToLogin();
      } else {
        toast("error", "Booking failed", e.message || "Please try again.");
      }
    } finally {
      bConfirm.disabled = false;
      bConfirm.textContent = originalText;
    }
  });

  // ---------------- Init ----------------
  window.addEventListener("DOMContentLoaded", () => {
    ensureRelatedDOM(); // ensure IDs exist even if HTML lacked them
    wireRelatedNav(); // wire Next/Prev
    loadTrip(); // fetch trip + related
  });
})();
