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

  // ---------------- Availability (dates + times) ----------------

  const fmtDateKey = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`; // local date key
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

    // Parse, keep only future-or-today slots, sort
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

    // sort each day's times ascending (already sorted, but keep it explicit)
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

    // If today, hide past times
    if (dayKey === fmtDateKey(now)) {
      options = options.filter((o) => o.date > now);
    }

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

    // No future slots
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

    // Try to use Flatpickr if loaded
    if (window.flatpickr) {
      try {
        datePickerInstance?.destroy?.();
      } catch {}
      datePickerInstance = flatpickr(dateInput, {
        dateFormat: "Y-m-d",
        minDate: availability.days[0],
        enable: availability.days, // only these days are clickable
        defaultDate: availability.days[0],
        disableMobile: true, // always use the custom picker on mobile
        onChange: (selectedDates) => {
          const d = selectedDates && selectedDates[0];
          if (d) {
            const key = fmtDateKey(d);
            syncTimeOptions(key);
          }
        },
      });

      // Initialize time list for the first available day
      syncTimeOptions(availability.days[0]);
    } else {
      // Fallback without Flatpickr:
      // show a simple YYYY-MM-DD value and guard invalid picks
      dateInput.type = "date";
      dateInput.min = availability.days[0];
      dateInput.value = availability.days[0];
      dateInput.disabled = false;

      dateInput.addEventListener("change", () => {
        const val = dateInput.value;
        if (!availability.days.includes(val)) {
          // snap back to first allowed day
          dateInput.value = availability.days[0];
          syncTimeOptions(availability.days[0]);
        } else {
          syncTimeOptions(val);
        }
      });

      syncTimeOptions(availability.days[0]);
    }
  };

  // ---------------- Image modal (unchanged) ----------------

  let imageList = []; // all URLs in order (main first)
  let currentIndex = 0; // modal index

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

    gal.querySelectorAll("img").forEach((thumb) => {
      thumb.addEventListener("click", () => {
        const idx = Number(thumb.getAttribute("data-index")) || 0;
        currentIndex = idx;
        openModalAt(idx);
      });
    });
  };

  // ---------------- Render trip ----------------

  const renderTrip = (t) => {
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
      ($("tripDescription").textContent = t.description || "");

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
        t.price != null ? `${formatPrice(t.price, "EGP")}` : "");

    setUnavailableUI(!!t.isAvailable);

    // NEW: hook up date + time availability from t.tripDates
    setupAvailability(t.tripDates || []);
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

      const t = json.data || {};
      renderTrip(t);
    } catch (err) {
      console.error("Trip load error:", err);
      $("tripTitle") && ($("tripTitle").textContent = "Trip not available");
      $("tripDescription") &&
        ($("tripDescription").textContent =
          "We couldn't load this trip right now. Please try again later.");
      setUnavailableUI(false);
      renderGallery([""]);
      setupAvailability([]); // disable date/time
    }
  }

  // Expose for language switchers
  window.refreshTripDetailsLang = () => loadTrip({ noCache: true });

  // ---------------- Booking button (uses chosen exact slot) ----------------

  $("bookBtn")?.addEventListener("click", () => {
    const dateVal =
      (datePickerInstance?.selectedDates?.[0] &&
        fmtDateKey(datePickerInstance.selectedDates[0])) ||
      $("tripDateInput")?.value ||
      "";

    const timeVal = $("tripTimeSelect")?.value || ""; // this is the full ISO from API

    if (!dateVal || !timeVal) {
      alert("Please choose an available date and time.");
      return;
    }

    // At this point, `timeVal` is an exact available datetime (from your API).
    // You can send it to your booking endpoint as the selected slot.
    console.log("Selected slot:", { dateVal, timeISO: timeVal });
    alert(
      `Selected slot:\nDate: ${dateVal}\nTime: ${new Date(
        timeVal
      ).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    );
  });

  // ---------------- Init ----------------

  window.addEventListener("DOMContentLoaded", () => loadTrip());
})();
