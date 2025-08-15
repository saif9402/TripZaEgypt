/* trips-list.js — Trips list with pagination (10/page) + Sort control + i18n
   Now displays availability from tripDates as date ranges (e.g., Aug 20–21, 2025).
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

  // Create sort select if page forgot to include it
  let sortSelect = document.getElementById("sortSelect");
  if (!sortSelect) {
    const toolbar =
      summaryEl?.parentElement || document.querySelector(".mb-4, .toolbar");
    if (toolbar) {
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

  let currentSort = getSortFromQS(); // "price:asc" | "rating:desc" | "bestseller" | ""

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

  // ----------- Availability (tripDates) helpers -----------
  const DAY_MS = 24 * 60 * 60 * 1000;

  // Robust parse for "8/20/2025" or ISO strings; returns Date | null
  function parseApiDate(str) {
    if (!str) return null;
    const d1 = new Date(str);
    if (!isNaN(d1.getTime())) return d1;

    // fallback for M/D/YYYY
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
        // Normalize to midnight to make day-diff reliable
        .map((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())) || [];
    // unique + sort
    const uniq = Array.from(
      new Map(dates.map((d) => [d.getTime(), d])).values()
    );
    uniq.sort((a, b) => a - b);
    return uniq;
  }

  function groupConsecutiveRanges(dates) {
    // dates must be sorted, midnight-normalized
    if (!dates.length) return [];
    const ranges = [];
    let start = dates[0];
    let prev = dates[0];

    for (let i = 1; i < dates.length; i++) {
      const cur = dates[i];
      const diff = (cur - prev) / DAY_MS;
      if (diff === 1) {
        // still consecutive
        prev = cur;
      } else {
        // close previous range
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

    const md = new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
    });
    const mdy = new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    if (sameDay) return mdy.format(start);

    const sameMonth =
      start.getFullYear() === end.getFullYear() &&
      start.getMonth() === end.getMonth();
    const sameYear = start.getFullYear() === end.getFullYear();

    if (sameMonth) {
      // Aug 20–21, 2025
      const left = md
        .format(start)
        .replace(/,?\s*\d+$/, String(start.getDate()));
      const right = String(end.getDate());
      return `${left}–${right}, ${start.getFullYear()}`;
    }

    if (sameYear) {
      // Aug 31 – Sep 2, 2025
      return `${md.format(start)} – ${md.format(end)}, ${start.getFullYear()}`;
    }

    // Different years
    return `${mdy.format(start)} – ${mdy.format(end)}`;
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
       class="block bg-white rounded-lg shadow hover:shadow-lg transition overflow-hidden">
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

          <!-- Availability line -->
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
            <div class="text-sm text-gray-500">Starting from</div>
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

  // ----------- Sort labels/UI -----------
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

    // reflect current URL state
    currentSort = getSortFromQS();
    sel.value = currentSort;

    sel.onchange = () => {
      currentSort = sel.value;
      setSortInQS(currentSort);
      load(1);
    };
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
    if (sort) qs.append("Sort", sort); // API expects array[string]; appending once is fine.

    try {
      const res = await fetch(`/api/Trip/GetAllTrips?${qs.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();

      const payload = json?.data;
      const items = payload?.data ?? [];
      totalCount = Number(payload?.count ?? 0);

      // If backend returns incorrect count, fall back to length (defensive)
      const effectiveCount =
        totalCount > 0 ? totalCount : (page - 1) * PAGE_SIZE + items.length;

      totalPages = Math.max(1, Math.ceil(effectiveCount / PAGE_SIZE));

      if (summaryEl) {
        summaryEl.textContent =
          effectiveCount > 0
            ? `${effectiveCount} trips • page ${currentPage} of ${totalPages}`
            : "No trips";
      }

      if (!items.length) {
        listEl.innerHTML =
          '<div class="bg-white rounded p-10 text-center text-gray-500">No trips found.</div>';
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

  // ----------- Public hook (used by sidebar categories) -----------
  window.reloadTripsPage = (page = 1) => load(page);

  // ----------- Init -----------
  document.addEventListener("DOMContentLoaded", () => {
    initSortUI();
    load(1);
  });

  // Re-init on language change (ties into your existing refresh hook)
  const oldRefresh = window.refreshLangData;
  window.refreshLangData = async function () {
    try {
      if (typeof oldRefresh === "function") await oldRefresh();
    } finally {
      initSortUI(); // update labels
      load(1); // reload data in the new language
    }
  };
})();
