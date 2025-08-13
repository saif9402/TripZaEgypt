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
    if (!u) return "https://via.placeholder.com/800x450?text=No+Image";
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
    const half = v - full >= 0.5 ? 1 : 0; // visually still render as full/empty using ★☆, but keep text precise
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

  const getTripIdFromUrl = () => {
    const u = new URL(window.location.href);
    return u.searchParams.get("id");
  };

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

    // Keep only future (and today) dates in local time
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
      // Format yyyy-mm-dd in LOCAL time
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${dd}`;
    };

    if (future.length) {
      dateInput.min = fmt(future[0]);
      dateInput.value = fmt(future[0]);
    } else {
      // fallback to earliest date if all are past
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

  const renderGallery = (urls) => {
    const main = $("tripMainImage");
    const gal = $("tripGallery");
    if (main) main.src = safeImg(urls[0]);
    if (!gal) return;

    gal.innerHTML = urls
      .slice(0, 6)
      .map(
        (u) => `
        <img
          alt="img"
          class="rounded-md w-full h-20 object-cover cursor-pointer ring-0 hover:ring-2 hover:ring-yellow-400"
          src="${esc(safeImg(u))}"
          data-src="${esc(safeImg(u))}"
        />`
      )
      .join("");

    gal.querySelectorAll("img").forEach((thumb) => {
      thumb.addEventListener("click", () => {
        if (main) main.src = thumb.dataset.src;
      });
    });
  };

  const renderTrip = (t) => {
    // Title
    if ($("tripTitle")) $("tripTitle").textContent = t.name || "Trip";

    // Rating
    const ratingVal = Number(t.rating) || 0;
    if ($("tripRatingStars"))
      $("tripRatingStars").textContent = stars(ratingVal);
    if ($("tripRatingText"))
      $("tripRatingText").textContent = ratingVal
        ? `(${ratingVal.toFixed(1)})`
        : "";

    // Images (main + gallery)
    const galleryUrls = [];
    if (t.mainImage?.imageURL) galleryUrls.push(t.mainImage.imageURL);
    (t.images || []).forEach(
      (img) => img?.imageURL && galleryUrls.push(img.imageURL)
    );
    renderGallery(galleryUrls.length ? galleryUrls : [""]);

    // Duration
    if ($("tripDurationLabel"))
      $("tripDurationLabel").textContent = `Duration ${minsToLabel(
        t.duration
      )}`;

    // Languages
    if ($("tripLanguages")) {
      const langs = (t.languages || []).filter(Boolean).join(", ");
      $("tripLanguages").textContent = langs || "—";
    }

    // Description
    if ($("tripDescription"))
      $("tripDescription").textContent = t.description || "";

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
    if ($("tripPrice"))
      $("tripPrice").innerHTML =
        t.price != null ? `${formatPrice(t.price, "EGP")}` : "";

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
        {
          cache: "no-store",
        }
      );
      const json = await res.json();

      if (!json?.succeeded)
        throw new Error(json?.message || "Failed to fetch trip");

      const t = json.data || {};
      renderTrip(t);
    } catch (err) {
      console.error("Trip load error:", err);
      if ($("tripTitle")) $("tripTitle").textContent = "Trip not available";
      if ($("tripDescription"))
        $("tripDescription").textContent =
          "We couldn't load this trip right now. Please try again later.";
      setUnavailableUI(false);
    }
  }

  // Public hook so your language switch can re-fetch details too
  window.refreshTripDetailsLang = () => loadTrip({ noCache: true });

  // Initial load
  window.addEventListener("DOMContentLoaded", () => loadTrip());

  // Optional: if your language toggle already calls window.refreshLangData(),
  // add this one-liner inside it so details re-render too:
  //   window.refreshTripDetailsLang?.();
})();
