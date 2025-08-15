/* trips-list.js — Trips list with pagination + Sort + Search + i18n
   Adds a toolbar search bar that syncs to ?search=... and calls /api/Trip/GetAllTrips&Search=...
*/

(() => {
  "use strict";

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
    let searchWrap = document.getElementById("tripSearchWrap");
    let searchInput = document.getElementById("tripSearchInput");
    let clearBtn = document.getElementById("clearSearchBtn");
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
      // put it at the beginning of the right side stack
      toolbar.insertBefore(wrap, toolbar.firstChild?.nextSibling || null);
    }

    // Sort (existing behavior)
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

  const getCategoryIdFromQS = () =>
    new URLSearchParams(location.search).get("categoryId");

  const getSortFromQS = () =>
    new URLSearchParams(location.search).get("sort") || "";

  const setSortInQS = (value) => {
    const url = new URL(location.href);
    if (value) url.searchParams.set("sort", value);
    else url.searchParams.delete("sort");
    history.replaceState(null, "", url);
  };

  // NEW: search term in URL (we keep it lowercase in the URL, map to "Search" for API)
  const getSearchFromQS = () =>
    new URLSearchParams(location.search).get("search") || "";

  const setSearchInQS = (value) => {
    const url = new URL(location.href);
    if (value) url.searchParams.set("search", value);
    else url.searchParams.delete("search");
    // Reset to page 1 when search changes
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

  const safeImg = (u) => {
    if (!u) return "https://via.placeholder.com/640x360?text=Trip";
    if (u.startsWith("http")) return u;
    return u.startsWith("/") ? u : `/${u}`;
  };

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
        currency: "EGP",
        maximumFractionDigits: 0,
      }).format(value);
    } catch {
      return `${value} EGP`;
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

  // ----------- Availability (tripDates) -----------
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

    const t =
      getLang() === "deu"
        ? { available: "Verfügbar", more: "weitere" }
        : { available: "Available", more: "more" };

    return `
      <span class="flex items-center gap-2">
        <i class="fa-solid fa-calendar-days"></i>
        <span class="truncate">
          <span class="font-medium">${t.available}:</span>
          ${esc(shown.join(" • "))}${
      extra ? ` <span class="text-gray-500">+${extra} ${t.more}</span>` : ""
    }
        </span>
      </span>
    `;
  }

  // ----------- Row template -----------
  const rowHTML = (t) => `
    <a href="/pages/trip-details.html?id=${t.id}" 
       class="block bg-white rounded-lg shadow hover:scale-105 hover:shadow-lg transition overflow-hidden">
      <div class="flex flex-col sm:flex-row">
        <img src="${esc(safeImg(t.mainImageURL))}" alt="${esc(t.name)}" 
             class="w-full sm:w-56 h-44 object-cover">

        <div class="flex-1 p-4">
          <div class="flex items-center gap-2 text-xs">
            <span class="px-2 py-0.5 rounded bg-teal-50 text-teal-700 font-semibold">
              ${esc(t.category || "Activity")}
            </span>
            ${
              t.isBestSeller
                ? `<span class="px-2 py-0.5 rounded bg-yellow-50 text-yellow-700 font-semibold">Best seller</span>`
                : ""
            }
            ${
              t.isAvailable
                ? `<span class="px-2 py-0.5 rounded bg-green-50 text-green-700 font-semibold">Available</span>`
                : `<span class="px-2 py-0.5 rounded bg-gray-100 text-gray-500">Unavailable</span>`
            }
          </div>

          <h3 class="mt-2 text-lg font-semibold truncate">${esc(t.name)}</h3>

          <div class="mt-1 flex items-center gap-2 text-sm">
            <div class="flex items-center gap-1" aria-label="rating">
              ${starsHTML(t.rating)}
              <span class="ml-1 text-gray-600">${(
                Number(t.rating) || 0
              ).toFixed(1)}</span>
            </div>
            <span class="text-gray-400">•</span>
            <span class="text-gray-600">${t.reviews ?? 0} reviews</span>
          </div>

          <div class="mt-2 text-sm text-gray-700">
            ${availabilityHTML(t)}
          </div>

          <div class="mt-3 flex items-center gap-6 text-sm text-gray-600">
            <span class="flex items-center gap-2">
              <i class="fa-solid fa-clock"></i> ${minutesToLabel(t.duration)}
            </span>
            <span class="flex items-center gap-2">
              <i class="fa-solid fa-people-group"></i> Family Plan
            </span>
          </div>
        </div>

        <div class="px-4 pb-4 sm:p-4 sm:w-56 flex sm:flex-col items-end justify-between">
          <div class="text-right">
            <div class="text-xl font-bold">
              ${t.price != null ? formatPrice(t.price) : ""}
            </div>
            <div class="text-xs text-gray-500">per person</div>
          </div>
          <span class="mt-2 inline-flex items-center gap-2 text-emerald-600 hover:text-emerald-700 font-semibold">
            View details <i class="fa-solid fa-chevron-right text-xs"></i>
          </span>
        </div>
      </div>
    </a>
  `;

  // ----------- Labels (i18n) -----------
  const sortLabels = () => {
    if (getLang() === "deu") {
      return {
        title: "Sortieren nach",
        recommended: "Empfohlen",
        bestseller: "Bestseller zuerst",
        priceLow: "Preis: aufsteigend",
        priceHigh: "Preis: absteigend",
        ratingHigh: "Bewertung: absteigend",
        ratingLow: "Bewertung: aufsteigend",
      };
    }
    return {
      title: "Sort by",
      recommended: "Recommended",
      bestseller: "Best seller",
      priceLow: "Price: low to high",
      priceHigh: "Price: high to low",
      ratingHigh: "Rating: high to low",
      ratingLow: "Rating: low to high",
    };
  };

  const searchLabels = () => {
    if (getLang() === "deu") {
      return {
        placeholder: "Ausflüge suchen",
        aria: "Ausflüge suchen",
        clear: "Löschen",
      };
    }
    return {
      placeholder: "Search trips",
      aria: "Search trips",
      clear: "Clear",
    };
  };

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

    // reflect current state
    currentSearch = getSearchFromQS();
    input.value = currentSearch;
    if (clearBtn) clearBtn.classList.toggle("hidden", !input.value);

    input.addEventListener("input", () => {
      if (clearBtn) clearBtn.classList.toggle("hidden", !input.value);
      // debounce live search
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

  // ----------- Fetch + Render -----------
  async function load(page = 1) {
    currentPage = page;

    listEl.innerHTML = skeletons(6);
    pagerEl.innerHTML = "";

    const qs = new URLSearchParams({
      PageNumber: page,
      PageSize: PAGE_SIZE,
      TranslationLanguageId: getLangId(),
    });

    const cat = getCategoryIdFromQS();
    if (cat) qs.append("CategoryId", cat);

    const sort = getSortFromQS();
    if (sort) qs.append("Sort", sort);

    const searchTerm = getSearchFromQS();
    if (searchTerm) qs.append("Search", searchTerm); // <-- API integration

    try {
      const res = await fetch(`/api/Trip/GetAllTrips?${qs.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();

      const payload = json?.data;
      const items = payload?.data ?? [];
      totalCount = Number(payload?.count ?? 0);

      const effectiveCount =
        totalCount > 0 ? totalCount : (page - 1) * PAGE_SIZE + items.length;

      totalPages = Math.max(1, Math.ceil(effectiveCount / PAGE_SIZE));

      if (summaryEl) {
        let text = effectiveCount > 0 ? `${effectiveCount} trips` : "No trips";
        const srch = getSearchFromQS();
        if (srch) text += ` • for "${srch}"`;
        text += ` • page ${currentPage} of ${totalPages}`;
        summaryEl.textContent = text;
      }

      if (!items.length) {
        const srch = getSearchFromQS();
        listEl.innerHTML = `
          <div class="bg-white rounded p-10 text-center text-gray-500">
            ${
              srch
                ? `No trips found for "<span class="font-semibold">${esc(
                    srch
                  )}</span>".`
                : "No trips found."
            }
          </div>`;
      } else {
        listEl.innerHTML = items.map(rowHTML).join("");
      }

      renderPagination();
    } catch (err) {
      console.error("Failed to load trips:", err);
      listEl.innerHTML =
        '<div class="bg-white rounded p-10 text-center text-red-500">Something went wrong. Please try again.</div>';
    }
  }

  // ----------- Pagination -----------
  function renderPagination() {
    const mkBtn = (label, page, { active = false, disabled = false } = {}) => `
      <button data-page="${page}" ${
      disabled ? "disabled" : ""
    } class="min-w-9 h-9 px-3 rounded border text-sm ${
      active
        ? "bg-emerald-600 text-white border-emerald-600"
        : "bg-white hover:bg-gray-50 border-gray-200"
    } ${disabled ? "opacity-50 cursor-not-allowed" : ""}">
        ${label}
      </button>`;

    let html = `<div class="inline-flex items-center gap-2">`;
    html += mkBtn("‹ Prev", currentPage - 1, { disabled: currentPage === 1 });

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

    html += mkBtn("Next ›", currentPage + 1, {
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
      load(1);
    }
  };
})();
