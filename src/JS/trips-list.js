/* Trips List (10 per page) with real pagination */
(() => {
  const PAGE_SIZE = 10;

  // DOM
  const listEl = document.getElementById("tripsContainer");
  const pagerEl = document.getElementById("pagination");
  const summaryEl = document.getElementById("resultsSummary");
  if (!listEl || !pagerEl) return;

  // State
  let currentPage = 1;
  let totalPages = 1;
  let totalCount = 0;

  // Helpers
  const getLangId = () =>
    (localStorage.getItem("lang") || "en") === "deu" ? 1 : 2;

  const getCategoryIdFromQS = () =>
    new URLSearchParams(location.search).get("categoryId");

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
    const lang = localStorage.getItem("lang") || "en";
    const locale = lang === "deu" ? "de-DE" : "en-EG";
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

  // One row that mimics your screenshot layout (responsive)
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

          <div class="mt-3 flex items-center gap-6 text-sm text-gray-600">
            <span class="flex items-center gap-2">
              <i class="fa-solid fa-clock"></i> ${minutesToLabel(t.duration)}
            </span>
            <span class="flex items-center gap-2">
              <i class="fa-solid fa-bus"></i> Transport
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

  // Fetch + render
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

    try {
      const res = await fetch(`/api/Trip/GetAllTrips?${qs.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();

      const payload = json?.data;
      const items = payload?.data ?? [];
      totalCount = Number(payload?.count ?? 0);
      totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

      summaryEl.textContent =
        totalCount > 0
          ? `${totalCount} trips • page ${currentPage} of ${totalPages}`
          : "No trips";

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

  // Pagination UI
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

  // Initial load
  document.addEventListener("DOMContentLoaded", () => load(1));

  // Optional: if you call window.refreshLangData elsewhere after a language switch,
  // reload this list in the new language too.
  const oldRefresh = window.refreshLangData;
  window.refreshLangData = async function () {
    try {
      if (typeof oldRefresh === "function") await oldRefresh();
    } finally {
      load(1); // reload first page in the new language
    }
  };
})();
