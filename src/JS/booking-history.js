(function () {
  const grid = () => document.getElementById("bookingsGrid");
  const loading = () => document.getElementById("bookingsLoading");
  const empty = () => document.getElementById("bookingsEmpty");
  const errorBox = () => document.getElementById("bookingsError");

  const langCode = localStorage.getItem("lang") || "en";

  let bookingsCache = null; // cache after first fetch
  let loadedOnce = false;

  const STATUS_STYLES = {
    Pending: { cls: "bg-yellow-100 text-yellow-800", icon: "fa-clock" },
    Confirmed: { cls: "bg-green-100 text-green-800", icon: "fa-circle-check" },
    Canceled: { cls: "bg-red-100 text-red-800", icon: "fa-circle-xmark" },
    Cancelled: { cls: "bg-red-100 text-red-800", icon: "fa-circle-xmark" }, // alt spelling
    Rejected: { cls: "bg-gray-100 text-gray-700", icon: "fa-ban" },
  };

  function statusBadge(status) {
    const s = STATUS_STYLES[status] || {
      cls: "bg-gray-100 text-gray-700",
      icon: "fa-info-circle",
    };
    return `<span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${s.cls}">
          <i class="fa-solid ${s.icon}"></i> ${status}
        </span>`;
  }

  const formatPrice = (
    value,
    currency = "EUR",
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

  function formatDateLocal(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "-";
    try {
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Cairo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).format(d);
    } catch (_) {
      return d.toLocaleString();
    }
  }

  function bookingCard(b) {
    const isPending = String(b.status).toLowerCase() === "pending";
    const created = formatDateLocal(b.createdAt);
    return `
        <article class="booking-card p-4 rounded-xl border bg-white shadow-sm hover:shadow transition cursor-pointer"
                 data-id="${b.id}" data-bpid="${b.bookingPublicId}">
          <div class="flex items-start justify-between gap-3">
            <h3 class="font-semibold text-gray-900 leading-snug line-clamp-2 mr-2">${
              b.tripName
            }</h3>
            ${statusBadge(b.status)}
          </div>

          <div class="mt-2 text-sm text-gray-600 space-y-1">
            <div class="flex items-center gap-2">
              <i class="fa-solid fa-calendar-day text-gray-400"></i>
              <span class="truncate">Created: <b>${created}</b></span>
            </div>
            <div class="flex items-center gap-2">
              <i class="fa-solid fa-tag text-gray-400"></i>
              <span>Total: <b>${formatPrice(b.totalCost, "EUR")}</b></span>
            </div>
            <div class="flex items-center gap-2">
              <i class="fa-solid fa-fingerprint text-gray-400"></i>
              <code class="text-xs bg-gray-50 px-1.5 py-0.5 rounded break-all">${
                b.bookingPublicId
              }</code>
              <button class="copy-id ml-1 text-xs underline hover:no-underline" type="button" data-id="${
                b.bookingPublicId
              }">
                Copy
              </button>
            </div>
          </div>

          <div class="mt-4 flex items-center justify-end">
            ${
              isPending
                ? `<button class="delete-booking inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm"
                       type="button" data-bid="${b.id}">
                     <i class="fa-solid fa-trash"></i> Delete
                   </button>`
                : `<button class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-gray-500 text-sm cursor-not-allowed opacity-60" disabled>
                     <i class="fa-solid fa-ban"></i> Delete
                   </button>`
            }
          </div>
        </article>
      `;
  }

  function renderBookings(list) {
    loading().classList.add("hidden");
    errorBox().classList.add("hidden");

    if (!list || list.length === 0) {
      empty().classList.remove("hidden");
      grid().classList.add("hidden");
      return;
    }

    empty().classList.add("hidden");
    const html = list.map(bookingCard).join("");
    const g = grid();
    g.innerHTML = html;
    g.classList.remove("hidden");
  }

  async function fetchBookings() {
    const token = localStorage.getItem("accessToken");
    loading().classList.remove("hidden");
    empty().classList.add("hidden");
    grid().classList.add("hidden");
    errorBox().classList.add("hidden");

    try {
      const res = await fetch("/api/Booking/GetAllBookings", {
        method: "GET",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });

      if (!res.ok) {
        let msg = res.statusText;
        try {
          const payload = await res.json();
          msg = payload?.message || msg;
        } catch (_) {}
        throw new Error(msg || "Failed to fetch bookings.");
      }

      const payload = await res.json();
      const rows = payload?.data?.data || [];
      bookingsCache = rows;
      renderBookings(rows);
    } catch (err) {
      console.error(err);
      loading().classList.add("hidden");
      errorBox().textContent =
        "Couldn’t load bookings. " + (err?.message || "");
      errorBox().classList.remove("hidden");
    } finally {
      loadedOnce = true;
    }
  }

  // Delete API (pending only)
  async function deleteBooking(id, btn) {
    const token = localStorage.getItem("accessToken");
    if (!confirm("Delete this booking? This action cannot be undone.")) {
      return;
    }

    // lock UI
    btn.disabled = true;
    const prevHtml = btn.innerHTML;
    btn.innerHTML =
      '<i class="fa-solid fa-circle-notch fa-spin"></i> Deleting…';

    try {
      const res = await fetch(`/api/Booking/DeleteBooking/${id}`, {
        method: "DELETE", // change to "POST" if your backend expects POST
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });

      if (!res.ok) {
        let msg = res.statusText;
        try {
          const payload = await res.json();
          msg = payload?.message || msg;
        } catch (_) {}
        throw new Error(msg || "Delete failed");
      }

      // Remove from cache
      if (Array.isArray(bookingsCache)) {
        bookingsCache = bookingsCache.filter(
          (b) => String(b.id) !== String(id)
        );
      }
      // Remove card in grid (works for both grid-button and modal-button)
      const card =
        btn.closest(".booking-card") ||
        document.querySelector(`.booking-card[data-id="${id}"]`);
      if (card) {
        card.classList.add("opacity-50", "pointer-events-none");
        setTimeout(() => card.remove(), 150);
      }

      showToast("Booking deleted.");
      if (!grid().querySelector(".booking-card")) {
        renderBookings([]);
      }

      // If inside modal, close it
      const modal = document.getElementById("bookingModal");
      if (modal) closeBookingModal();
    } catch (err) {
      console.error(err);
      showToast(err?.message || "Could not delete booking.", "error");
      btn.disabled = false;
      btn.innerHTML = prevHtml;
    }
  }

  // -------- Modal --------
  function buildModalSkeleton() {
    const overlay = document.createElement("div");
    overlay.id = "bookingModal";
    overlay.className =
      "fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4";
    overlay.innerHTML = `
        <div class="bg-white w-full max-w-lg rounded-2xl shadow-xl relative">
          

          <div class="p-6">
            <div id="bookingModalHeader" class="flex items-start justify-between gap-3">
              <h3 class="font-semibold text-lg leading-snug">Booking Details</h3>
              <span id="bookingModalStatus"></span>
            </div>

            <div id="bookingModalBody" class="mt-4 space-y-3 text-sm text-gray-700">
              <div class="flex items-center gap-2 text-gray-500">
                <i class="fa-solid fa-circle-notch fa-spin"></i>
                <span>Loading booking…</span>
              </div>
            </div>

            <div id="bookingModalFooter" class="mt-6 flex items-center justify-end gap-2"></div>
          </div>
        </div>
      `;
    return overlay;
  }

  function closeBookingModal() {
    const overlay = document.getElementById("bookingModal");
    if (!overlay) return;
    overlay.remove();
    document.removeEventListener("keydown", escListener, true);
    document.documentElement.style.overflow = "";
  }

  function escListener(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeBookingModal();
    }
  }

  async function openBookingModal(id) {
    // Create & show modal
    const overlay = buildModalSkeleton();
    document.body.appendChild(overlay);
    document.documentElement.style.overflow = "hidden";
    document
      .getElementById("bookingModalClose")
      .addEventListener("click", closeBookingModal);
    overlay.addEventListener("click", (e) => {
      const card = overlay.firstElementChild;
      if (!card.contains(e.target)) {
        e.stopPropagation(); // click-outside closes
        closeBookingModal();
      }
    });
    document.addEventListener("keydown", escListener, true);

    const token = localStorage.getItem("accessToken");
    const body = document.getElementById("bookingModalBody");
    const header = document.getElementById("bookingModalHeader");
    const statusSlot = document.getElementById("bookingModalStatus");
    const footer = document.getElementById("bookingModalFooter");

    try {
      const res = await fetch(`/api/Booking/GetBookingById/${id}`, {
        method: "GET",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });

      if (!res.ok) {
        let msg = res.statusText;
        try {
          const payload = await res.json();
          msg = payload?.message || msg;
        } catch (_) {}
        throw new Error(msg || "Failed to fetch booking.");
      }

      const payload = await res.json();
      const b = payload?.data;
      if (!b) throw new Error("Missing booking data.");

      // Header
      header.querySelector("h3").textContent = b.tripName || "Booking Details";
      statusSlot.innerHTML = statusBadge(b.status);

      // Body
      body.innerHTML = `
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="space-y-1">
              <div class="text-xs text-gray-500">Public ID</div>
              <div class="flex items-center gap-2">
                <code class="text-xs bg-gray-50 px-1.5 py-0.5 rounded break-all">${
                  b.bookingPublicId
                }</code>
                <button class="copy-id text-xs underline hover:no-underline" type="button" data-id="${
                  b.bookingPublicId
                }">
                  Copy
                </button>
              </div>
            </div>

            <div class="space-y-1">
              <div class="text-xs text-gray-500">Created</div>
              <div class="font-medium">${formatDateLocal(b.createdAt)}</div>
            </div>

            <div class="space-y-1">
              <div class="text-xs text-gray-500">Adults</div>
              <div class="font-medium">${b.adults ?? "-"}</div>
            </div>

            <div class="space-y-1">
              <div class="text-xs text-gray-500">Children</div>
              <div class="font-medium">${b.childrens ?? "-"}</div>
            </div>

            <div class="space-y-1">
              <div class="text-xs text-gray-500">Total</div>
              <div class="font-medium">${formatPrice(b.totalCost, "EUR")}</div>
            </div>
          </div>
        `;

      // Footer (Delete if pending)
      footer.innerHTML = "";
      const isPending = String(b.status).toLowerCase() === "pending";
      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "px-4 py-2 rounded-lg border hover:bg-gray-50";
      closeBtn.textContent = "Close";
      closeBtn.addEventListener("click", closeBookingModal);
      footer.appendChild(closeBtn);

      if (isPending) {
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className =
          "px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white";
        delBtn.innerHTML = '<i class="fa-solid fa-trash mr-2"></i>Delete';
        delBtn.addEventListener("click", () => deleteBooking(b.id, delBtn));
        footer.appendChild(delBtn);
      }

      // Copy handler inside modal
      body.addEventListener("click", (e) => {
        const copyBtn = e.target.closest(".copy-id");
        if (copyBtn) {
          const text = copyBtn.getAttribute("data-id");
          try {
            navigator.clipboard.writeText(text);
            showToast("Copied!");
          } catch (_) {
            showToast("Copy failed", "error");
          }
        }
      });
    } catch (err) {
      console.error(err);
      body.innerHTML = `
          <div class="p-3 rounded-lg bg-red-50 text-red-700 text-sm">
            Couldn’t load booking. ${err?.message || ""}
          </div>
        `;
    }
  }

  // -------- Events & Nav --------
  function setActiveNav(which) {
    const btnProfile = document.getElementById("navProfile");
    const btnBookings = document.getElementById("navBookings");
    const profileSection = document.getElementById("profileSection");
    const bookingSection = document.getElementById("bookingSection");

    const onProfile = which === "profile";
    profileSection.classList.toggle("hidden", !onProfile);
    bookingSection.classList.toggle("hidden", onProfile);

    if (onProfile) {
      btnProfile.classList.add(
        "bg-yellow-400",
        "hover:bg-yellow-500",
        "text-black"
      );
      btnProfile.classList.remove("border", "border-gray-300", "text-gray-700");
      btnBookings.classList.remove(
        "bg-yellow-400",
        "hover:bg-yellow-500",
        "text-black"
      );
      btnBookings.classList.add("border", "border-gray-300", "text-gray-700");
    } else {
      btnBookings.classList.add(
        "bg-yellow-400",
        "hover:bg-yellow-500",
        "text-black"
      );
      btnBookings.classList.remove(
        "border",
        "border-gray-300",
        "text-gray-700"
      );
      btnProfile.classList.remove(
        "bg-yellow-400",
        "hover:bg-yellow-500",
        "text-black"
      );
      btnProfile.classList.add("border", "border-gray-300", "text-gray-700");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    // Switch tabs
    document
      .getElementById("navProfile")
      .addEventListener("click", () => setActiveNav("profile"));
    document
      .getElementById("navBookings")
      .addEventListener("click", async () => {
        setActiveNav("bookings");
        if (!loadedOnce) await fetchBookings();
      });

    // Default: profile
    setActiveNav("profile");

    // Delegated actions for grid (delete, copy, open modal)
    grid().addEventListener("click", (e) => {
      // Delete button
      const delBtn = e.target.closest(".delete-booking");
      if (delBtn) {
        const id = delBtn.getAttribute("data-bid");
        deleteBooking(id, delBtn);
        e.stopPropagation();
        return;
      }
      // Copy id
      const copyBtn = e.target.closest(".copy-id");
      if (copyBtn) {
        const text = copyBtn.getAttribute("data-id");
        try {
          navigator.clipboard.writeText(text);
          showToast("Copied!");
        } catch (_) {
          showToast("Copy failed", "error");
        }
        e.stopPropagation();
        return;
      }
      // Card click => open modal
      const card = e.target.closest(".booking-card");
      if (card) {
        const id = card.getAttribute("data-id");
        openBookingModal(id);
      }
    });
  });
})();
