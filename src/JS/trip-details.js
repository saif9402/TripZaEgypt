// ../JS/trip-details.js

(function () {
  const $ = (id) => document.getElementById(id);

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
    if (!u) return "https://via.placeholder.com/1200x800?text=No+Image";
    if (u.startsWith("http")) return u;
    return u.startsWith("/") ? u : `/${u}`;
  };

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

  const formatPrice = (value, currency = "EGP") => {
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

  const setDates = (tripDates = []) => {
    const dateInput = $("tripDateInput");
    if (!dateInput) return;

    if (!tripDates.length) {
      dateInput.value = "";
      dateInput.min = "";
      return;
    }

    const now = new Date();
    const future = tripDates
      .map((d) => new Date(d))
      .filter(
        (d) =>
          !isNaN(d) &&
          d >= new Date(now.getFullYear(), now.getMonth(), now.getDate())
      )
      .sort((a, b) => a - b);

    const fmt = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${dd}`;
    };

    if (future.length) {
      dateInput.min = fmt(future[0]);
      dateInput.value = fmt(future[0]);
    } else {
      const all = tripDates
        .map((d) => new Date(d))
        .filter((d) => !isNaN(d))
        .sort((a, b) => a - b);
      if (all.length) {
        dateInput.min = fmt(all[0]);
        dateInput.value = fmt(all[0]);
      } else {
        dateInput.value = "";
        dateInput.min = "";
      }
    }
  };

  // ---------- Modal state & helpers ----------
  let imageList = []; // all URLs in order (main first)
  let currentIndex = 0; // index in imageList currently shown in modal

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

    // show overlay
    modal.classList.remove("opacity-0", "pointer-events-none");
    modal.classList.add("opacity-100", "pointer-events-auto");

    // animate image in
    requestAnimationFrame(() => {
      modalImg.classList.remove("opacity-0", "scale-90");
      modalImg.classList.add("opacity-100", "scale-100");
    });
  };

  const closeModal = () => {
    if (!modal || !modalImg) return;

    // fade out image
    modalImg.classList.remove("opacity-100", "scale-100");
    modalImg.classList.add("opacity-0", "scale-90");

    // fade out overlay
    modal.classList.remove("opacity-100");
    modal.classList.add("opacity-0");
    modal.classList.add("pointer-events-none");

    // Update the main image to the last viewed
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

  // Keyboard controls
  document.addEventListener("keydown", (e) => {
    if (!isModalOpen()) return;
    if (e.key === "ArrowRight") showNext();
    else if (e.key === "ArrowLeft") showPrev();
    else if (e.key === "Escape") closeModal();
  });

  // Buttons & backdrop
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

  // ---------- Rendering ----------
  const renderGallery = (urls) => {
    const main = $("tripMainImage");
    const gal = $("tripGallery");

    // normalize & store
    imageList = (urls && urls.length ? urls : [""]).map(safeImg);

    // main image
    if (main) {
      main.src = imageList[0];
      main.addEventListener("click", () => openModalAt(currentIndex));
    }

    // thumbnails
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

    gal.querySelectorAll("img").forEach((thumb) => {
      thumb.addEventListener("click", (e) => {
        const idx = Number(thumb.getAttribute("data-index")) || 0;
        currentIndex = idx;
        openModalAt(idx);
      });
    });
  };

  const renderTrip = (t) => {
    // Title
    $("tripTitle") && ($("tripTitle").textContent = t.name || "Trip");

    // Category + Rating
    const ratingVal = Number(t.rating) || 0;
    $("tripRatingStars") &&
      ($("tripRatingStars").textContent = stars(ratingVal));
    $("tripRatingText") &&
      ($("tripRatingText").textContent = ratingVal
        ? `(${ratingVal.toFixed(1)})`
        : "");

    // Images (main + gallery)
    const galleryUrls = [];
    if (t.mainImage?.imageURL) galleryUrls.push(t.mainImage.imageURL);
    (t.images || []).forEach(
      (img) => img?.imageURL && galleryUrls.push(img.imageURL)
    );
    renderGallery(galleryUrls.length ? galleryUrls : [""]);

    // Duration
    $("tripDurationLabel") &&
      ($("tripDurationLabel").textContent = `Duration ${minsToLabel(
        t.duration
      )}`);

    // Languages
    if ($("tripLanguages")) {
      const langs = (t.languages || []).filter(Boolean).join(", ");
      $("tripLanguages").textContent = langs || "—";
    }

    // Description
    $("tripDescription") &&
      ($("tripDescription").textContent = t.description || "");

    // Activities
    if ($("tripActivities")) {
      $("tripActivities").innerHTML = (t.activities || [])
        .map((a) => `<li>${esc(a)}</li>`)
        .join("");
    }

    // Included / Not Included
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

    // Price
    $("tripPrice") &&
      ($("tripPrice").innerHTML =
        t.price != null ? `${formatPrice(t.price, "EGP")}` : "");

    // Availability + dates
    setUnavailableUI(!!t.isAvailable);
    setDates(t.tripDates || []);
  };

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

      const t = json.data || {};
      renderTrip(t);
    } catch (err) {
      console.error("Trip load error:", err);
      $("tripTitle") && ($("tripTitle").textContent = "Trip not available");
      $("tripDescription") &&
        ($("tripDescription").textContent =
          "We couldn't load this trip right now. Please try again later.");
      setUnavailableUI(false);
      renderGallery([""]); // still render gallery with placeholder so modal works
    }
  }

  // Public hook so your language switch can re-fetch details too
  window.refreshTripDetailsLang = () => loadTrip({ noCache: true });

  // Initial load
  window.addEventListener("DOMContentLoaded", () => loadTrip());
})();
