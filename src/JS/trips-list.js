/* trips-list.js — Trips list with pagination + Sort + Search + Date & Duration filters + i18n */

(() => {
  ("use strict");
  // i18n helper (reuses your existing getLang)
  const tr = (k) =>
    typeof window.t === "function"
      ? window.t(k)
      : window.translations?.[getLang()]?.[k] ?? k;

  // ----------- Config / DOM -----------
  const PAGE_SIZE = 10;

  const listEl = document.getElementById("tripsContainer");
  const pagerEl = document.getElementById("pagination");
  const summaryEl = document.getElementById("resultsSummary");
  if (!listEl || !pagerEl) {
    console.warn("[trips-list] Missing #tripsContainer or #pagination");
    return;
  }

  // Ensure toolbar controls exist (search + sort) if HTML didn't include them
  function ensureToolbarControls() {
    const toolbar =
      summaryEl?.parentElement || document.querySelector(".mb-4, .toolbar");
    if (!toolbar) return;

    // Search
    let searchInput = document.getElementById("tripSearchInput");
    if (!searchInput) {
      const wrap = document.createElement("div");
      wrap.id = "tripSearchWrap";
      wrap.className = "relative w-full sm:w-80";
      wrap.innerHTML = `
        <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
        <input id="tripSearchInput" type="search"
          class="w-full pl-9 pr-9 py-2 rounded-md border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder="Search trips" aria-label="Search trips" />
        <button id="clearSearchBtn" type="button"
          class="hidden absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          aria-label="Clear search" title="Clear">
          <i class="fa-solid fa-xmark"></i>
        </button>`;
      toolbar.insertBefore(wrap, toolbar.firstChild?.nextSibling || null);
    }

    // Sort
    let sortSelect = document.getElementById("sortSelect");
    if (!sortSelect) {
      const wrap = document.createElement("div");
      wrap.className = "flex items-center gap-2";
      const lbl = document.createElement("label");
      lbl.id = "sortLabel";
      lbl.className = "text-sm text-gray-600";
      lbl.setAttribute("for", "sortSelect");
      lbl.textContent = "Sort by";
      sortSelect = document.createElement("select");
      sortSelect.id = "sortSelect";
      sortSelect.className =
        "border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500";
      wrap.appendChild(lbl);
      wrap.appendChild(sortSelect);
      toolbar.appendChild(wrap);
    }
  }
  ensureToolbarControls();

  // ----------- State -----------
  let currentPage = 1;
  let totalPages = 1;
  let totalCount = 0;

  // ----------- Helpers -----------
  const getLang = () => localStorage.getItem("lang") || "en";
  const getLangId = () => (getLang() === "deu" ? 1 : 2);
  const getLocale = () => (getLang() === "deu" ? "de-DE" : "en-US");

  const getQS = () => new URLSearchParams(location.search);

  const getCategoryIdFromQS = () => getQS().get("categoryId");
  const getSortFromQS = () => getQS().get("sort") || "";

  const setSortInQS = (value) => {
    const url = new URL(location.href);
    if (value) url.searchParams.set("sort", value);
    else url.searchParams.delete("sort");
    history.replaceState(null, "", url);
  };

  // Search term in URL
  const getSearchFromQS = () =>
    getQS().get("search") || getQS().get("Search") || "";
  const setSearchInQS = (value) => {
    const url = new URL(location.href);
    if (value) url.searchParams.set("search", value);
    else url.searchParams.delete("search");
    url.searchParams.delete("PageNumber");
    history.replaceState(null, "", url);
  };

  let currentSort = getSortFromQS();
  let currentSearch = getSearchFromQS();

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

  // Inline fallback image (no DNS)
  const FALLBACK_DATA_IMG =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360'>
       <rect width='100%' height='100%' fill='#e5e7eb'/>
       <text x='50%' y='50%' text-anchor='middle' dominant-baseline='middle'
             font-size='22' fill='#9ca3af' font-family='system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif'>
         No Image
       </text>
     </svg>`
    );

  // Safer image URL normalizer (matches includes.js behavior)
  const safeImg = (u) =>
    !u
      ? FALLBACK_DATA_IMG
      : /^data:/i.test(u)
      ? u
      : /^https?:\/\//i.test(u)
      ? u
      : u.startsWith("//")
      ? window.location.protocol + u
      : u.startsWith("/")
      ? u
      : `/${u}`;

  // Attach one-time error fallbacks to any <img> inside root
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

  const minutesToLabel = (mins) => {
    const m = Number(mins) || 0;
    const h = Math.floor(m / 60);
    const r = m % 60;
    if (h && r) return `${h} h ${r} min`;
    if (h) return `${h} h`;
    return `${m} min`;
  };

  const formatPrice = (value) => {
    const locale = getLang() === "deu" ? "de-DE" : "en-EG";
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      return `${value} EUR`;
    }
  };

  const starsHTML = (r) => {
    const v = Math.max(0, Math.min(5, Number(r) || 0));
    let html = "";
    for (let i = 1; i <= 5; i++) {
      html += `<i class="fa-solid fa-star ${
        i <= v ? "text-yellow-400" : "text-gray-300"
      }"></i>`;
    }
    return html;
  };

  const skeletons = (n = 6) =>
    Array.from({ length: n })
      .map(
        () => `
      <div class="bg-white rounded-lg shadow overflow-hidden animate-pulse">
        <div class="h-40 bg-gray-200"></div>
        <div class="p-4 space-y-2">
          <div class="h-4 bg-gray-200 w-3/4 rounded"></div>
          <div class="h-4 bg-gray-200 w-1/2 rounded"></div>
          <div class="h-4 bg-gray-200 w-1/3 rounded"></div>
        </div>
      </div>`
      )
      .join("");

  // ----------- Availability (tripDates rendering) -----------
  const DAY_MS = 24 * 60 * 60 * 1000;

  function parseApiDate(str) {
    if (!str) return null;
    const d1 = new Date(str);
    if (!isNaN(d1.getTime())) return d1;

    const parts = String(str)
      .split(/[\/\-\.]/)
      .map((p) => p.trim());
    if (parts.length === 3) {
      let [m, d, y] = parts.map((p) => parseInt(p, 10));
      if (y < 100) y += 2000;
      const d2 = new Date(y, (m || 1) - 1, d || 1);
      if (!isNaN(d2.getTime())) return d2;
    }
    return null;
  }

  function normalizeTripDates(arr) {
    const dates =
      (arr || [])
        .map(parseApiDate)
        .filter((d) => d && !isNaN(d.getTime()))
        .map((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())) || [];
    const uniq = Array.from(
      new Map(dates.map((d) => [d.getTime(), d])).values()
    );
    uniq.sort((a, b) => a - b);
    return uniq;
  }

  function groupConsecutiveRanges(dates) {
    if (!dates.length) return [];
    const ranges = [];
    let start = dates[0];
    let prev = dates[0];

    for (let i = 1; i < dates.length; i++) {
      const cur = dates[i];
      const diff = (cur - prev) / DAY_MS;
      if (diff === 1) {
        prev = cur;
      } else {
        ranges.push({ start, end: prev });
        start = cur;
        prev = cur;
      }
    }
    ranges.push({ start, end: prev });
    return ranges;
  }

  function formatDateRange(start, end, locale) {
    const sameDay =
      start.getFullYear() === end.getFullYear() &&
      start.getMonth() === end.getMonth() &&
      start.getDate() === end.getDate();

    const mdy = new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    if (sameDay) return mdy.format(start);
    return `${mdy.format(start)} & ${mdy.format(end)}`;
  }

  function availabilityHTML(trip) {
    const dates = normalizeTripDates(trip?.tripDates);
    if (!dates.length) return "";
    const ranges = groupConsecutiveRanges(dates);
    const locale = getLocale();
    const shown = ranges
      .slice(0, 2)
      .map((r) => formatDateRange(r.start, r.end, locale));
    const extra = Math.max(0, ranges.length - 2);

    return `
    <span class="flex items-center gap-2">
      <i class="fa-solid fa-calendar-days"></i>
      <span class="truncate">
        <span class="font-medium">${tr("trips.available")}:</span>
        ${esc(shown.join(" • "))}${
      extra
        ? ` <span class="text-gray-500">+${extra} ${tr("trips.more")}</span>`
        : ""
    }
      </span>
    </span>
  `;
  }

  function setSearchCount(n) {
    const el = document.getElementById("tripSearchCount");
    if (!el) return;
    if (Number.isFinite(n)) {
      try {
        el.textContent = new Intl.NumberFormat(getLocale()).format(n);
      } catch {
        el.textContent = String(n);
      }
      el.classList.remove("hidden");
    } else {
      el.textContent = "";
      el.classList.add("hidden");
    }
  }

  // ----------- Date filter (URL + API) -----------
  const getStartDateFromQS = () => {
    const lower = getQS().get("start");
    if (lower) return lower; // already YYYY-MM-DD
    const upper = getQS().get("StartDate"); // may be ISO
    return upper && upper.length >= 10 ? upper.slice(0, 10) : "";
  };

  const getEndDateFromQS = () => {
    const lower = getQS().get("end");
    if (lower) return lower;
    const upper = getQS().get("EndDate");
    return upper && upper.length >= 10 ? upper.slice(0, 10) : "";
  };

  function setDateRangeInQS(startDateStr, endDateStr) {
    const url = new URL(location.href);
    if (startDateStr) url.searchParams.set("start", startDateStr);
    else url.searchParams.delete("start");
    if (endDateStr) url.searchParams.set("end", endDateStr);
    else url.searchParams.delete("end");
    url.searchParams.delete("PageNumber");
    history.replaceState(null, "", url);
  }

  // Convert YYYY-MM-DD -> ISO at start/end of day (UTC)
  function dateOnlyToISO(dateStr, endOfDay = false) {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
    if (!y || !m || !d) return "";
    const utc = endOfDay
      ? Date.UTC(y, m - 1, d, 23, 59, 59, 999)
      : Date.UTC(y, m - 1, d, 0, 0, 0, 0);
    return new Date(utc).toISOString();
  }

  function prettyDate(dateStr) {
    try {
      const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
      const dt = new Date(y, m - 1, d);
      return new Intl.DateTimeFormat(getLocale(), {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(dt);
    } catch {
      return dateStr;
    }
  }

  function summarizeDateFilter(startStr, endStr) {
    if (!startStr && !endStr) return "";
    if (startStr && endStr)
      return `${prettyDate(startStr)} → ${prettyDate(endStr)}`;
    if (startStr) return `${tr("common.from")} ${prettyDate(startStr)}`;
    return `${tr("common.until")} ${prettyDate(endStr)}`;
  }

  function initDateFilterUI() {
    const startInput = document.getElementById("filterStartDate");
    const endInput = document.getElementById("filterEndDate");
    const applyBtn = document.getElementById("applyDateFilter");
    const clearBtn = document.getElementById("clearDateFilter");
    const hintEl = document.getElementById("dateFilterHint");

    if (!startInput || !endInput || !applyBtn) return;

    const startQS = getStartDateFromQS();
    const endQS = getEndDateFromQS();
    if (startQS) startInput.value = startQS;
    if (endQS) endInput.value = endQS;

    if (hintEl) hintEl.textContent = summarizeDateFilter(startQS, endQS);

    function apply() {
      let s = startInput.value || "";
      let e = endInput.value || "";
      if (s && e && s > e) [s, e] = [e, s];
      setDateRangeInQS(s, e);
      if (hintEl) hintEl.textContent = summarizeDateFilter(s, e);
      load(1);
    }

    applyBtn.onclick = apply;

    [startInput, endInput].forEach((el) =>
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          apply();
        }
      })
    );

    if (clearBtn) {
      clearBtn.onclick = () => {
        startInput.value = "";
        endInput.value = "";
        setDateRangeInQS("", "");
        if (hintEl) hintEl.textContent = "";
        load(1);
      };
    }
  }

  // ----------- Duration filter (URL + API) -----------
  const getStartDurationFromQS = () => {
    const v = getQS().get("durStart");
    return v !== null && v !== "" ? parseInt(v, 10) : "";
  };
  const getEndDurationFromQS = () => {
    const v = getQS().get("durEnd");
    return v !== null && v !== "" ? parseInt(v, 10) : "";
  };

  function setDurationInQS(minStr, maxStr) {
    const url = new URL(location.href);
    if (minStr !== "" && minStr != null)
      url.searchParams.set("durStart", String(minStr));
    else url.searchParams.delete("durStart");
    if (maxStr !== "" && maxStr != null)
      url.searchParams.set("durEnd", String(maxStr));
    else url.searchParams.delete("durEnd");
    url.searchParams.delete("PageNumber");
    history.replaceState(null, "", url);
  }

  function summarizeDuration(min, max) {
    if (min === "" && max === "") return "";
    if (min !== "" && max !== "")
      return `${tr("trips.filters.duration.title")} ${min}–${max} ${tr(
        "trips.filters.duration.minUnit"
      )}`;
    if (min !== "")
      return `${tr("trips.filters.duration.title")} ≥ ${min} ${tr(
        "trips.filters.duration.minUnit"
      )}`;
    return `${tr("trips.filters.duration.title")} ≤ ${max} ${tr(
      "trips.filters.duration.minUnit"
    )}`;
  }

  function initDurationFilterUI() {
    const minInput = document.getElementById("filterMinDuration");
    const maxInput = document.getElementById("filterMaxDuration");
    const applyBtn = document.getElementById("applyDurationFilter");
    const clearBtn = document.getElementById("clearDurationFilter");
    const hintEl = document.getElementById("durationFilterHint");
    const buckets = Array.from(document.querySelectorAll(".durationBucket"));

    if (!minInput || !maxInput || !applyBtn) return;

    const qsMin = getStartDurationFromQS();
    const qsMax = getEndDurationFromQS();
    if (qsMin !== "") minInput.value = Number(qsMin);
    if (qsMax !== "") maxInput.value = Number(qsMax);
    if (hintEl) hintEl.textContent = summarizeDuration(qsMin, qsMax);

    function syncInputsFromBuckets() {
      const selected = buckets.filter((b) => b.checked);
      if (!selected.length) return;
      const min = Math.min(...selected.map((b) => parseInt(b.dataset.min, 10)));
      const max = Math.max(...selected.map((b) => parseInt(b.dataset.max, 10)));
      minInput.value = min;
      maxInput.value = max;
    }

    function syncBucketsFromInputs() {
      const min = minInput.value === "" ? "" : parseInt(minInput.value, 10);
      const max = maxInput.value === "" ? "" : parseInt(maxInput.value, 10);
      buckets.forEach((b) => {
        const bmin = parseInt(b.dataset.min, 10);
        const bmax = parseInt(b.dataset.max, 10);
        const coveredMin = min === "" || min <= bmin;
        const coveredMax = max === "" || max >= bmax;
        b.checked = coveredMin && coveredMax && (min !== "" || max !== "");
      });
    }

    buckets.forEach((b) => {
      b.addEventListener("change", () => {
        if (buckets.some((x) => x.checked)) syncInputsFromBuckets();
      });
    });

    minInput.addEventListener("input", syncBucketsFromInputs);
    maxInput.addEventListener("input", syncBucketsFromInputs);

    function apply() {
      let min =
        minInput.value === "" ? "" : Math.max(0, parseInt(minInput.value, 10));
      let max =
        maxInput.value === "" ? "" : Math.max(0, parseInt(maxInput.value, 10));
      if (min !== "" && max !== "" && min > max) [min, max] = [max, min];
      setDurationInQS(min === "" ? "" : min, max === "" ? "" : max);
      if (hintEl) hintEl.textContent = summarizeDuration(min, max);
      load(1);
    }

    applyBtn.onclick = apply;
    [minInput, maxInput].forEach((el) =>
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          apply();
        }
      })
    );

    if (clearBtn) {
      clearBtn.onclick = () => {
        minInput.value = "";
        maxInput.value = "";
        buckets.forEach((b) => (b.checked = false));
        setDurationInQS("", "");
        if (hintEl) hintEl.textContent = "";
        load(1);
      };
    }
  }

  // ----------- Row template -----------
  const rowHTML = (t) => `
  <a href="/pages/trip-details.html?id=${t.id}"
     class="block bg-white rounded-lg shadow hover:scale-105 hover:shadow-lg transition overflow-hidden">
    <div class="flex flex-col sm:flex-row">
      <img src="${esc(safeImg(t.mainImageURL))}" alt="${esc(t.name)}"
           class="w-full sm:w-56 h-44 object-cover" loading="lazy" decoding="async"
           onerror="this.onerror=null;this.src='${FALLBACK_DATA_IMG}'">

      <div class="flex-1 p-4">
        <div class="flex items-center gap-2 text-xs">
          <span class="px-2 py-0.5 rounded bg-teal-50 text-teal-700 font-semibold">
            ${esc(t.category || tr("trips.category.default"))}
          </span>
          ${
            t.isBestSeller
              ? `<span class="px-2 py-0.5 rounded bg-yellow-50 text-yellow-700 font-semibold">${tr(
                  "trips.badge.bestSeller"
                )}</span>`
              : ""
          }
          ${
            t.isAvailable
              ? `<span class="px-2 py-0.5 rounded bg-green-50 text-green-700 font-semibold">${tr(
                  "trips.available"
                )}</span>`
              : `<span class="px-2 py-0.5 rounded bg-gray-100 text-gray-500">${tr(
                  "trips.unavailable"
                )}</span>`
          }
        </div>

        <h3 class="mt-2 text-lg font-semibold truncate">${esc(t.name)}</h3>

        <div class="mt-1 flex items-center gap-2 text-sm">
          <div class="flex items-center gap-1" aria-label="${tr(
            "trips.rating.aria"
          )}">
            ${starsHTML(t.rating)}
            <span class="ml-1 text-gray-600">${(Number(t.rating) || 0).toFixed(
              1
            )}</span>
          </div>
          <span class="text-gray-400">•</span>
          <span class="text-gray-600">${t.reviews ?? 0} ${tr(
    "trips.summary.tripsReviews"
  )}</span>
        </div>

        <div class="mt-2 text-sm text-gray-700">
          ${availabilityHTML(t)}
        </div>

        <div class="mt-3 flex items-center gap-6 text-sm text-gray-600">
          <span class="flex items-center gap-2">
            <i class="fa-solid fa-clock"></i> ${minutesToLabel(t.duration)}
          </span>
          <span class="flex items-center gap-2">
            <i class="fa-solid fa-people-group"></i> ${tr("trips.familyPlan")}
          </span>
        </div>
      </div>

      <div class="px-4 pb-4 sm:p-4 sm:w-56 flex sm:flex-col items-end justify-between">
        <div class="text-right">
          <div class="text-xl font-bold">
            ${t.price != null ? formatPrice(t.price) : ""}
          </div>
          <div class="text-xs text-gray-500">${tr("trips.perPerson")}</div>
        </div>
        <span class="mt-2 inline-flex items-center gap-2 text-emerald-600 hover:text-emerald-700 font-semibold">
          ${tr(
            "trips.viewDetails"
          )} <i class="fa-solid fa-chevron-right text-xs"></i>
        </span>
      </div>
    </div>
  </a>
`;

  // ----------- Labels (i18n) -----------
  const sortLabels = () => ({
    title: tr("trips.sort.title"),
    recommended: tr("trips.sort.recommended"),
    bestseller: tr("trips.sort.bestseller"),
    priceLow: tr("trips.sort.priceLow"),
    priceHigh: tr("trips.sort.priceHigh"),
    ratingHigh: tr("trips.sort.ratingHigh"),
    ratingLow: tr("trips.sort.ratingLow"),
  });

  const searchLabels = () => ({
    placeholder: tr("trips.search.placeholder"),
    aria: tr("trips.search.aria"),
    clear: tr("common.clear"),
  });

  function initSortUI() {
    const sel = document.getElementById("sortSelect");
    const lbl = document.getElementById("sortLabel");
    if (!sel) return;

    const t = sortLabels();
    if (lbl) lbl.textContent = t.title;

    sel.innerHTML = `
      <option value="">${t.recommended}</option>
      <option value="bestseller">${t.bestseller}</option>
      <option value="price:asc">${t.priceLow}</option>
      <option value="price:desc">${t.priceHigh}</option>
      <option value="rating:desc">${t.ratingHigh}</option>
      <option value="rating:asc">${t.ratingLow}</option>
    `;

    currentSort = getSortFromQS();
    sel.value = currentSort;

    sel.onchange = () => {
      currentSort = sel.value;
      setSortInQS(currentSort);
      load(1);
    };
  }

  // ----------- Search UI wiring -----------
  let searchDebounceId = null;
  function initSearchUI() {
    const input = document.getElementById("tripSearchInput");
    const clearBtn = document.getElementById("clearSearchBtn");
    if (!input) return;

    const t = searchLabels();
    input.placeholder = t.placeholder;
    input.setAttribute("aria-label", t.aria);
    if (clearBtn) clearBtn.title = t.clear;

    currentSearch = getSearchFromQS();
    input.value = currentSearch;
    if (clearBtn) clearBtn.classList.toggle("hidden", !input.value);

    input.addEventListener("input", () => {
      if (clearBtn) clearBtn.classList.toggle("hidden", !input.value);
      clearTimeout(searchDebounceId);
      searchDebounceId = setTimeout(() => {
        currentSearch = input.value.trim();
        setSearchInQS(currentSearch);
        load(1);
      }, 400);
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        clearTimeout(searchDebounceId);
        currentSearch = input.value.trim();
        setSearchInQS(currentSearch);
        load(1);
      }
    });

    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        input.value = "";
        clearBtn.classList.add("hidden");
        currentSearch = "";
        setSearchInQS("");
        load(1);
        input.focus();
      });
    }
  }

  function updateResultsSummary({ count, page = 1, totalPages = 1 }) {
    if (!summaryEl) return;

    const isDE = getLang() === "deu";
    const fmt = (n) => {
      try {
        return new Intl.NumberFormat(getLocale()).format(n);
      } catch {
        return String(n);
      }
    };
    const words = {
      trip: tr("trips.summary.trip"),
      trips: tr("trips.summary.trips"),
      none: tr("trips.summary.none"),
      for: tr("trips.summary.for"),
      page: tr("trips.summary.page"),
      of: tr("trips.summary.of"),
      searching: tr("trips.summary.searching"),
    };

    const srch = getSearchFromQS();
    const start = getStartDateFromQS();
    const end = getEndDateFromQS();
    const dMin = getStartDurationFromQS();
    const dMax = getEndDurationFromQS();

    const dateBadge = summarizeDateFilter(start, end);
    const durBadge = summarizeDuration(dMin, dMax);

    let text;
    if (count == null) text = words.searching;
    else if (count === 0) text = words.none;
    else {
      const noun = count === 1 ? words.trip : words.trips;
      text = `${fmt(count)} ${noun}`;
    }

    if (srch) text += ` • ${words.for} "${srch}"`;
    if (dateBadge) text += ` • ${dateBadge}`;
    if (durBadge) text += ` • ${durBadge}`;
    if (count != null)
      text += ` • ${words.page} ${page} ${words.of} ${totalPages}`;

    summaryEl.textContent = text;
  }

  // ----------- Fetch + Render -----------
  async function load(page = 1) {
    currentPage = page;

    listEl.innerHTML = skeletons(6);
    pagerEl.innerHTML = "";
    updateResultsSummary({ count: null }); // show “Searching…” while loading

    const params = new URLSearchParams({
      PageNumber: page,
      PageSize: PAGE_SIZE,
      TranslationLanguageId: getLangId(),
    });

    const cat = getCategoryIdFromQS();
    if (cat) params.append("CategoryId", cat);

    const sort = getSortFromQS();
    if (sort) params.append("Sort", sort);

    const searchTerm = getSearchFromQS();
    if (searchTerm) params.append("Search", searchTerm);

    // Date range (ISO, full-day inclusive)
    const startDateOnly = getStartDateFromQS(); // yyyy-mm-dd
    const endDateOnly = getEndDateFromQS(); // yyyy-mm-dd
    let isoStart = "";
    let isoEnd = "";
    if (startDateOnly) isoStart = dateOnlyToISO(startDateOnly, false);
    if (endDateOnly) isoEnd = dateOnlyToISO(endDateOnly, true);
    if (isoStart && isoEnd && new Date(isoStart) > new Date(isoEnd)) {
      const tmp = isoStart;
      isoStart = isoEnd;
      isoEnd = tmp;
    }
    if (isoStart) params.append("StartDate", isoStart);
    if (isoEnd) params.append("EndDate", isoEnd);

    // Duration range (minutes)
    const durMin = getStartDurationFromQS();
    const durMax = getEndDurationFromQS();
    if (durMin !== "") params.append("StartDuration", String(durMin));
    if (durMax !== "") params.append("EndDuration", String(durMax));

    try {
      const res = await fetch(`/api/Trip/GetAllTrips?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();

      const payload = json?.data;
      const items = payload?.data ?? [];
      totalCount = Number(payload?.count ?? 0);

      // Detect if any filters are active (search/date/duration/category/sort)
      const filtersActive = !!(
        getSearchFromQS() ||
        getStartDateFromQS() ||
        getEndDateFromQS() ||
        getStartDurationFromQS() !== "" ||
        getEndDurationFromQS() !== "" ||
        getCategoryIdFromQS() ||
        getSortFromQS()
      );

      // Prefer server count only when no filters OR when it looks reasonable
      const serverCount = Number(payload?.count);
      let effectiveCount;

      if (filtersActive) {
        // Backend often doesn't return filtered totals; use what we actually got
        effectiveCount = items.length;
      } else {
        effectiveCount = Number.isFinite(serverCount)
          ? serverCount
          : items.length;
      }

      totalPages = Math.max(1, Math.ceil(effectiveCount / PAGE_SIZE));

      updateResultsSummary({
        count: effectiveCount,
        page: currentPage,
        totalPages,
      });

      if (!items.length) {
        const srch = getSearchFromQS();
        const startQS = getStartDateFromQS();
        const endQS = getEndDateFromQS();
        const hasDate = startQS || endQS;

        const dMin = getStartDurationFromQS();
        const dMax = getEndDurationFromQS();
        const hasDur = dMin !== "" || dMax !== "";
        const durText = summarizeDuration(dMin, dMax);

        listEl.innerHTML = `
          <div class="bg-white rounded p-10 text-center text-gray-500">
            ${
              srch || hasDate || hasDur
                ? `${tr("trips.noResults")}${
                    srch
                      ? ` ${tr(
                          "trips.summary.for"
                        )} "<span class="font-semibold">${esc(srch)}</span>"`
                      : ""
                  }${
                    hasDate
                      ? ` ${tr("common.in")} ${esc(
                          summarizeDateFilter(startQS, endQS)
                        )}`
                      : ""
                  }${hasDur ? ` • ${esc(durText)}` : ""}.`
                : tr("trips.noResults")
            }
          </div>`;
      } else {
        listEl.innerHTML = items.map(rowHTML).join("");

        // --- Robust image fallback (inline SVG, no DNS) ---
        const FALLBACK_DATA_IMG =
          "data:image/svg+xml;utf8," +
          encodeURIComponent(
            `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360'>
             <rect width='100%' height='100%' fill='#e5e7eb'/>
             <text x='50%' y='50%' text-anchor='middle' dominant-baseline='middle'
                   font-size='22' fill='#9ca3af'
                   font-family='system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif'>
               No Image
             </text>
           </svg>`
          );

        // Replace external placeholder host and attach onerror fallbacks
        listEl.querySelectorAll("img").forEach((img) => {
          // Ensure progressive image decoding + lazy loading
          try {
            img.loading = "lazy";
            img.decoding = "async";
          } catch {}

          // If the src is an external placeholder, swap to inline SVG immediately
          try {
            const u = new URL(img.src, window.location.href);
            if (u.hostname.includes("via.placeholder.com")) {
              img.src = FALLBACK_DATA_IMG;
            }
          } catch {
            // ignore URL parsing issues; onerror below will still catch failures
          }

          // Guarantee a graceful fallback on any load error
          img.addEventListener(
            "error",
            () => {
              if (img.src !== FALLBACK_DATA_IMG) img.src = FALLBACK_DATA_IMG;
            },
            { once: true }
          );
        });
      }

      renderPagination();
    } catch (err) {
      console.error("Failed to load trips:", err);
      setSearchCount(null);
      listEl.innerHTML =
        '<div class="bg-white rounded p-10 text-center text-red-500">' +
        tr("common.errorGeneric") +
        "</div>";
    }
  }

  // ----------- Pagination -----------
  function renderPagination() {
    const mkBtn = (label, page, { active = false, disabled = false } = {}) => `
      <button data-page="${page}" ${disabled ? "disabled" : ""} 
        class="min-w-9 h-9 px-3 rounded border text-sm ${
          active
            ? "bg-emerald-600 text-white border-emerald-600"
            : "bg-white hover:bg-gray-50 border-gray-200"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}">
        ${label}
      </button>`;

    let html = `<div class="inline-flex items-center gap-2">`;
    html += mkBtn(`‹ ${tr("common.prev")}`, currentPage - 1, {
      disabled: currentPage === 1,
    });

    const windowSize = 2;
    const start = Math.max(1, currentPage - windowSize);
    const end = Math.min(totalPages, currentPage + windowSize);

    if (start > 1) {
      html += mkBtn("1", 1, { active: currentPage === 1 });
      if (start > 2) html += `<span class="px-1">…</span>`;
    }

    for (let p = start; p <= end; p++) {
      html += mkBtn(String(p), p, { active: p === currentPage });
    }

    if (end < totalPages) {
      if (end < totalPages - 1) html += `<span class="px-1">…</span>`;
      html += mkBtn(String(totalPages), totalPages, {
        active: currentPage === totalPages,
      });
    }

    html += mkBtn(`${tr("common.next")} ›`, currentPage + 1, {
      disabled: currentPage === totalPages,
    });

    html += `</div>`;

    pagerEl.innerHTML = html;
  }

  pagerEl.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-page]");
    if (!btn) return;
    const page = Number(btn.dataset.page);
    if (page >= 1 && page <= totalPages && page !== currentPage) {
      load(page);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });

  // ----------- Public hook -----------
  window.reloadTripsPage = (page = 1) => load(page);

  // ----------- Init -----------
  document.addEventListener("DOMContentLoaded", () => {
    ensureToolbarControls();
    initSortUI();
    initSearchUI();
    initDateFilterUI();
    initDurationFilterUI();
    load(1);
  });

  document.addEventListener("i18n:change", () => {
    initSortUI();
    initSearchUI();
    initDateFilterUI();
    initDurationFilterUI();
    load(1);
  });

  // Re-init on language change
  const oldRefresh = window.refreshLangData;
  window.refreshLangData = async function () {
    try {
      if (typeof oldRefresh === "function") await oldRefresh();
    } finally {
      initSortUI();
      initSearchUI();
      initDateFilterUI();
      initDurationFilterUI();
      load(1);
    }
  };
})();

// === Mobile Filters Drawer: also move Sort controls ===
(function () {
  const modalEl = document.getElementById("filtersModal");
  const overlayEl = document.getElementById("filtersModalOverlay");
  const openBtn = document.getElementById("openFiltersBtn");
  const closeBtn = document.getElementById("closeFiltersBtn");

  const hostSidebar = document.getElementById("filtersHostSidebar");
  const hostModal = document.getElementById("filtersHostModal");
  const filtersContent = document.getElementById("filtersContent");

  // NEW: sort hosts + controls
  const sortHostToolbar = document.getElementById("sortHostToolbar");
  const sortHostModal = document.getElementById("sortHostModal");
  const sortControls = document.getElementById("sortControls");

  const applyAllBtn = document.getElementById("filtersApplyBtn");
  const resetAllBtn = document.getElementById("filtersResetBtn");

  if (
    !modalEl ||
    !openBtn ||
    !hostSidebar ||
    !hostModal ||
    !filtersContent ||
    !sortControls
  )
    return;

  function openFilters() {
    // Move filters into modal
    if (filtersContent.parentElement !== hostModal)
      hostModal.appendChild(filtersContent);
    // Move sort into modal
    if (sortControls.parentElement !== sortHostModal)
      sortHostModal.appendChild(sortControls);

    modalEl.classList.remove("hidden");
    document.body.classList.add("overflow-hidden");
  }

  function closeFilters() {
    // Return filters to sidebar
    if (filtersContent.parentElement !== hostSidebar)
      hostSidebar.appendChild(filtersContent);
    // Return sort to toolbar (desktop spot)
    if (sortControls.parentElement !== sortHostToolbar) {
      // Ensure wrapper exists even if hidden on mobile
      sortHostToolbar.appendChild(sortControls);
    }

    modalEl.classList.add("hidden");
    document.body.classList.remove("overflow-hidden");
  }

  openBtn.addEventListener("click", openFilters);
  closeBtn?.addEventListener("click", closeFilters);
  overlayEl?.addEventListener("click", closeFilters);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modalEl.classList.contains("hidden"))
      closeFilters();
  });

  // Apply & Reset in drawer
  applyAllBtn?.addEventListener("click", () => {
    // apply existing sections
    document.getElementById("applyDateFilter")?.click();
    document.getElementById("applyDurationFilter")?.click();
    // if user changed sort, the onchange handler you already have will fire automatically
    closeFilters();
  });

  resetAllBtn?.addEventListener("click", () => {
    document.getElementById("clearDateFilter")?.click();
    document.getElementById("clearDurationFilter")?.click();

    // Reset sort to default (Recommended) and trigger change
    const sel = document.getElementById("sortSelect");
    if (sel) {
      sel.value = "";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });

  // If user resizes to desktop, put everything back and close
  const mq = window.matchMedia("(min-width: 1024px)");
  mq.addEventListener("change", (e) => {
    if (e.matches) closeFilters();
  });
})();
