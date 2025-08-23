// ../JS/wishlist.js
(function () {
  const t = (k, p) =>
    typeof window.t === "function"
      ? window.t(k, p)
      : k.replace(/\{(\w+)\}/g, (_, m) =>
          p && p[m] != null ? p[m] : `{${m}}`
        );

  const token = localStorage.getItem("accessToken");

  const profileSection = document.getElementById("profileSection");
  const bookingSection = document.getElementById("bookingSection");
  const wishlistSection = document.getElementById("wishlistSection");

  const navProfile = document.getElementById("navProfile");
  const navBookings = document.getElementById("navBookings");
  const navWishlist = document.getElementById("navWishlist");

  const wishlistLoading = document.getElementById("wishlistLoading");
  const wishlistGrid = document.getElementById("wishlistGrid");
  const wishlistEmpty = document.getElementById("wishlistEmpty");
  const wishlistError = document.getElementById("wishlistError");
  const wishlistRefresh = document.getElementById("wishlistRefresh");

  const tinyToast = document.getElementById("toast");

  function getLangId() {
    const lang = localStorage.getItem("lang") || "en";
    return lang === "deu" ? 1 : 2;
  }

  function showSection(section) {
    profileSection?.classList.add("hidden");
    bookingSection?.classList.add("hidden");
    wishlistSection?.classList.add("hidden");
    section?.classList.remove("hidden");
  }

  function setActiveNav(activeBtn) {
    [navProfile, navBookings, navWishlist].forEach((btn) => {
      if (!btn) return;
      btn.classList.remove(
        "bg-yellow-400",
        "hover:bg-yellow-500",
        "text-black"
      );
      btn.classList.add("border", "border-gray-300", "text-gray-700");
    });
    if (activeBtn) {
      activeBtn.classList.remove("border", "border-gray-300", "text-gray-700");
      activeBtn.classList.add(
        "bg-yellow-400",
        "hover:bg-yellow-500",
        "text-black"
      );
    }
  }

  function showToast(message, type = "success") {
    if (!tinyToast) return;
    tinyToast.textContent = message;
    tinyToast.classList.remove("hidden");
    tinyToast.classList.remove("bg-green-600", "bg-red-600", "bg-yellow-600");
    tinyToast.classList.add(
      type === "error"
        ? "bg-red-600"
        : type === "warn"
        ? "bg-yellow-600"
        : "bg-green-600"
    );
    tinyToast.style.opacity = "1";
    setTimeout(() => {
      tinyToast.style.opacity = "0";
      setTimeout(() => tinyToast.classList.add("hidden"), 300);
    }, 1600);
  }

  function resetStates() {
    wishlistError.classList.add("hidden");
    wishlistEmpty.classList.add("hidden");
    wishlistGrid.classList.add("hidden");
    wishlistLoading.classList.remove("hidden");
  }

  function showEmpty() {
    wishlistLoading.classList.add("hidden");
    wishlistGrid.classList.add("hidden");
    wishlistEmpty.classList.remove("hidden");
  }

  function showError() {
    wishlistLoading.classList.add("hidden");
    wishlistGrid.classList.add("hidden");
    wishlistEmpty.classList.add("hidden");
    wishlistError.classList.remove("hidden");
  }

  async function fetchWishlistIds() {
    const res = await fetch("/api/Wishlist", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Wishlist fetch failed");
    const json = await res.json();
    return (json?.data || []).map((x) => x.tripId);
  }

  async function fetchTripById(id, langId) {
    const res = await fetch(
      `/api/Trip/GetTripById/${id}?TranslationLanguageId=${langId}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    if (!res.ok) throw new Error(`Trip ${id} fetch failed`);
    return res.json();
  }

  async function deleteWishlist(tripId) {
    const res = await fetch(
      `/api/Wishlist?TripId=${encodeURIComponent(tripId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    if (!res.ok) throw new Error("Delete failed");
    return true;
  }

  function tripCard({ id, trip }) {
    const tdata = trip || {};
    const img =
      tdata.mainImage?.imageURL ||
      "https://via.placeholder.com/600x400?text=Trip";
    const name = tdata.name || "—";
    const price =
      typeof tdata.price === "number" ? tdata.price.toFixed(2) : "—";
    const rating =
      typeof tdata.rating === "number" ? tdata.rating.toFixed(1) : "—";
    const bestseller = !!tdata.isBestSeller;

    return `
      <div id="wish-${id}" class="p-4 bg-white rounded-2xl border shadow-sm flex flex-col">
        <div class="relative">
          <img src="${img}" alt="${name}" class="w-full h-40 object-cover rounded-xl" />
          ${
            bestseller
              ? `<span class="absolute top-2 left-2 bg-yellow-400 text-black text-xs font-semibold px-2 py-1 rounded">${t(
                  "profile.badge.bestSeller"
                )}</span>`
              : ""
          }
          <button
            data-action="remove"
            data-id="${id}"
            title="${t("profile.wishlist.remove")}"
            class="absolute top-2 right-2 bg-white/90 hover:bg-white p-2 rounded-full shadow border"
            type="button"
          >
            <i class="fas fa-heart text-rose-600"></i>
          </button>
        </div>

        <div class="mt-3 flex-1">
          <h3 class="font-semibold line-clamp-2">${name}</h3>
          <div class="flex items-center justify-between text-sm text-gray-600 mt-2">
            <span><i class="fas fa-star text-yellow-400"></i> ${rating}</span>
            <span class="font-medium text-gray-800">€${price}</span>
          </div>
        </div>

        <div class="mt-4 flex gap-2">
          <a
            href="/pages/trip-details.html?id=${id}"
            class="flex-1 text-center px-3 py-2 rounded-lg bg-gray-900 text-white hover:bg-black transition"
          >${t("profile.wishlist.view")}</a>
          <button
            data-action="remove"
            data-id="${id}"
            class="px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-100"
            type="button"
          >
            ${t("profile.wishlist.remove")}
          </button>
        </div>
      </div>
    `;
  }

  function renderGrid(items) {
    wishlistGrid.innerHTML = items.map(tripCard).join("");
    wishlistLoading.classList.add("hidden");
    wishlistEmpty.classList.add("hidden");
    wishlistGrid.classList.remove("hidden");
  }

  async function loadWishlist() {
    resetStates();
    try {
      const ids = await fetchWishlistIds();

      if (!ids.length) {
        showEmpty();
        return;
      }

      const langId = getLangId();
      const jobs = ids.map((id) =>
        fetchTripById(id, langId)
          .then((j) => ({ id, trip: j?.data }))
          .catch(() => null)
      );

      const results = await Promise.all(jobs);
      const ok = results.filter(Boolean);

      if (!ok.length) {
        showError();
        return;
      }

      if (ok.length < ids.length) {
        showToast(t("wishlist.toast.someFailed"), "warn");
      }

      renderGrid(ok);
    } catch (e) {
      console.error(e);
      showError();
    }
  }

  wishlistGrid.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action='remove']");
    if (!btn) return;

    const tripId = btn.getAttribute("data-id");
    btn.disabled = true;

    try {
      await deleteWishlist(tripId);
      document.getElementById(`wish-${tripId}`)?.remove();
      showToast(t("wishlist.toast.removed"));

      if (!wishlistGrid.children.length) showEmpty();
    } catch (err) {
      console.error(err);
      showToast(t("wishlist.toast.removeFailed"), "error");
      btn.disabled = false;
    }
  });

  const ACTIVE_BTN = ["bg-yellow-400", "hover:bg-yellow-500", "text-black"];
  const INACTIVE_BTN = ["border", "border-gray-300", "text-gray-700"];

  function clearActiveNav() {
    [navProfile, navBookings, navWishlist].forEach((btn) => {
      if (!btn) return;
      btn.classList.remove(...ACTIVE_BTN);
      btn.classList.add(...INACTIVE_BTN);
    });
  }

  function hideAllSections() {
    [profileSection, bookingSection, wishlistSection].forEach((sec) =>
      sec?.classList.add("hidden")
    );
  }

  function activateTab(tab) {
    hideAllSections();
    clearActiveNav();

    switch (tab) {
      case "profile":
        profileSection?.classList.remove("hidden");
        navProfile?.classList.remove(...INACTIVE_BTN);
        navProfile?.classList.add(...ACTIVE_BTN);
        break;

      case "bookings":
        bookingSection?.classList.remove("hidden");
        navBookings?.classList.remove(...INACTIVE_BTN);
        navBookings?.classList.add(...ACTIVE_BTN);
        break;

      case "wishlist":
        wishlistSection?.classList.remove("hidden");
        navWishlist?.classList.remove(...INACTIVE_BTN);
        navWishlist?.classList.add(...ACTIVE_BTN);
        loadWishlist();
        break;
    }
  }

  const enforce = (tab) => setTimeout(() => activateTab(tab), 0);

  navProfile?.addEventListener("click", () => enforce("profile"));
  navBookings?.addEventListener("click", () => enforce("bookings"));
  navWishlist?.addEventListener("click", () => enforce("wishlist"));

  enforce(
    !profileSection?.classList.contains("hidden")
      ? "profile"
      : !bookingSection?.classList.contains("hidden")
      ? "bookings"
      : "profile"
  );

  window.refreshTripDetailsLang = () => {
    if (!wishlistSection.classList.contains("hidden")) {
      loadWishlist();
    }
  };

  wishlistRefresh?.addEventListener("click", loadWishlist);
})();
