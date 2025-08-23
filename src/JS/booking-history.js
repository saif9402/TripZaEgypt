(function () {
  const t = (k, p) =>
    typeof window.t === "function"
      ? window.t(k, p)
      : k.replace(/\{(\w+)\}/g, (_, m) =>
          p && p[m] != null ? p[m] : `{${m}}`
        );

  const grid = () => document.getElementById("bookingsGrid");
  const loading = () => document.getElementById("bookingsLoading");
  const empty = () => document.getElementById("bookingsEmpty");
  const errorBox = () => document.getElementById("bookingsError");

  const langCode = localStorage.getItem("lang") || "en";

  let bookingsCache = null;
  let loadedOnce = false;

  const STATUS_STYLES = {
    Pending: { cls: "bg-yellow-100 text-yellow-800", icon: "fa-clock" },
    Confirmed: { cls: "bg-green-100 text-green-800", icon: "fa-circle-check" },
    Canceled: { cls: "bg-red-100 text-red-800", icon: "fa-circle-xmark" },
    Cancelled: { cls: "bg-red-100 text-red-800", icon: "fa-circle-xmark" },
    Rejected: { cls: "bg-gray-100 text-gray-700", icon: "fa-ban" },
  };

  function statusBadge(status) {
    const s = STATUS_STYLES[status] || {
      cls: "bg-gray-100 text-gray-700",
      icon: "fa-info-circle",
    };
    const labelKey = `booking.status.${
      status in STATUS_STYLES ? status : "Unknown"
    }`;
    const label =
      status in STATUS_STYLES
        ? t(labelKey) === labelKey
          ? status
          : t(labelKey)
        : status;
    return `<span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${s.cls}">
      <i class="fa-solid ${s.icon}"></i> ${label}
    </span>`;
  }

  function confirmModal({
    title = t("booking.confirm.deleteTitle"),
    html = "",
    confirmText = t("booking.confirm.ok"),
    cancelText = t("booking.confirm.cancel"),
    danger = false,
  } = {}) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.id = "confirmModal";
      overlay.className =
        "fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 opacity-0 transition-opacity";
      overlay.innerHTML = `
      <div id="confirmCard"
           role="dialog" aria-modal="true" aria-labelledby="confirmTitle"
           class="bg-white w-full max-w-md rounded-2xl shadow-xl p-6 relative transform scale-95 transition-transform">
        <button type="button" aria-label="Close"
                class="absolute top-3 right-3 p-2 rounded-full hover:bg-gray-100"
                id="confirmCloseBtn">
          <i class="fa-solid fa-xmark"></i>
        </button>

        <div class="flex items-start gap-3">
          <div class="mt-1 shrink-0 ${
            danger ? "text-red-600" : "text-yellow-500"
          }">
            <i class="fa-solid ${
              danger ? "fa-triangle-exclamation" : "fa-circle-info"
            } text-xl"></i>
          </div>
          <div class="flex-1">
            <h3 id="confirmTitle" class="text-lg font-semibold mb-1">${title}</h3>
            <div class="text-sm text-gray-600" id="confirmBody">${html}</div>
          </div>
        </div>

        <div class="mt-6 flex items-center justify-end gap-2">
          <button type="button" class="px-4 py-2 rounded-lg border hover:bg-gray-50" id="confirmCancel">${cancelText}</button>
          <button type="button"
            class="px-4 py-2 rounded-lg text-white ${
              danger
                ? "bg-red-600 hover:bg-red-700"
                : "bg-yellow-500 hover:bg-yellow-600"
            }"
            id="confirmOk">${confirmText}</button>
        </div>
      </div>
    `;

      document.body.appendChild(overlay);
      document.documentElement.style.overflow = "hidden";
      requestAnimationFrame(() => {
        overlay.classList.remove("opacity-0");
        overlay.classList.add("opacity-100");
        overlay.querySelector("#confirmCard").classList.remove("scale-95");
        overlay.querySelector("#confirmCard").classList.add("scale-100");
      });

      const cleanup = (val) => {
        overlay.classList.remove("opacity-100");
        overlay.classList.add("opacity-0");
        overlay.querySelector("#confirmCard").classList.remove("scale-100");
        overlay.querySelector("#confirmCard").classList.add("scale-95");
        setTimeout(() => {
          overlay.remove();
          document.documentElement.style.overflow = "";
          resolve(val);
        }, 150);
      };

      overlay.addEventListener("click", (e) => {
        const card = overlay.querySelector("#confirmCard");
        if (!card.contains(e.target)) cleanup(false);
      });
      overlay
        .querySelector("#confirmCancel")
        .addEventListener("click", () => cleanup(false));
      overlay
        .querySelector("#confirmOk")
        .addEventListener("click", () => cleanup(true));
      overlay
        .querySelector("#confirmCloseBtn")
        .addEventListener("click", () => cleanup(false));
      const onEsc = (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          cleanup(false);
        }
      };
      document.addEventListener("keydown", onEsc, { once: true });
    });
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(
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
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      return `${value} ${currency}`;
    }
  };

  function parseISOGuessTZ(iso) {
    if (!iso) return null;
    const hasTZ = /[zZ]|[+\-]\d{2}:\d{2}$/.test(iso);
    const fixed = hasTZ ? iso : iso + "Z";
    const d = new Date(fixed);
    return isNaN(d) ? null : d;
  }

  function formatDateLocal(iso) {
    const d = parseISOGuessTZ(iso);
    if (!d) return "-";
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
    } catch {
      return d.toLocaleString("en-GB");
    }
  }

  async function confirmDeleteBooking(id) {
    const b = Array.isArray(bookingsCache)
      ? bookingsCache.find((x) => String(x.id) === String(id))
      : null;

    const trip = b?.tripName
      ? escapeHtml(b.tripName)
      : t("booking.modal.title");
    const created = b?.createdAt ? formatDateLocal(b.createdAt) : null;
    const total =
      (b?.totalCost ?? null) !== null ? formatPrice(b.totalCost, "EUR") : null;

    const line1 = t("booking.confirm.htmlLine1", {
      trip,
      created: created
        ? t("booking.confirm.createdSuffix", { date: created })
        : "",
    });
    const lineTotal = total
      ? `<p class="mt-1">${t("booking.confirm.totalLine", { total })}</p>`
      : "";
    const irreversible = `<p class="mt-3 text-xs text-red-600">${t(
      "booking.confirm.irreversible"
    )}</p>`;

    const html = `<p>${line1}</p>${lineTotal}${irreversible}`;

    return confirmModal({
      title: t("booking.confirm.deleteTitle"),
      html,
      confirmText: t("booking.confirm.ok"),
      cancelText: t("booking.confirm.cancel"),
      danger: true,
    });
  }

  function bookingCard(b) {
    const isPending = String(b.status).toLowerCase() === "pending";
    const created = formatDateLocal(b.createdAt);
    const createdLbl = t("booking.card.created");
    const totalLbl = t("booking.card.total");
    const publicIdLbl = t("booking.card.publicId");
    const copyLbl = t("booking.btn.copy");

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
            <span class="truncate">${createdLbl}: <b>${created}</b></span>
          </div>
          <div class="flex items-center gap-2">
            <i class="fa-solid fa-tag text-gray-400"></i>
            <span>${totalLbl}: <b>${formatPrice(b.totalCost, "EUR")}</b></span>
          </div>
          <div class="flex items-center gap-2">
            <i class="fa-solid fa-fingerprint text-gray-400"></i>
            <code class="text-xs bg-gray-50 px-1.5 py-0.5 rounded break-all">${
              b.bookingPublicId
            }</code>
            <button class="copy-id ml-1 text-xs underline hover:no-underline" type="button" data-id="${
              b.bookingPublicId
            }">
              ${copyLbl}
            </button>
          </div>
        </div>

        <div class="mt-4 flex items-center justify-end">
          ${
            isPending
              ? `<button class="delete-booking inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm"
                     type="button" data-bid="${b.id}">
                   <i class="fa-solid fa-trash"></i> ${t(
                     "booking.modal.delete"
                   )}
                 </button>`
              : `<button class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-gray-500 text-sm cursor-not-allowed opacity-60" disabled>
                   <i class="fa-solid fa-ban"></i> ${t("booking.modal.delete")}
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
      errorBox().textContent = t("booking.error.load", {
        msg: err?.message || "",
      });
      errorBox().classList.remove("hidden");
    } finally {
      loadedOnce = true;
    }
  }

  async function deleteBooking(id, btn) {
    const token = localStorage.getItem("accessToken");
    const ok = await confirmDeleteBooking(id);
    if (!ok) return;

    btn.disabled = true;
    const prevHtml = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> ${t(
      "booking.delete.deleting"
    )}`;

    try {
      const res = await fetch(`/api/Booking/DeleteBooking/${id}`, {
        method: "DELETE",
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

      if (Array.isArray(bookingsCache)) {
        bookingsCache = bookingsCache.filter(
          (b) => String(b.id) !== String(id)
        );
      }
      const card =
        btn.closest(".booking-card") ||
        document.querySelector(`.booking-card[data-id="${id}"]`);
      if (card) {
        card.classList.add("opacity-50", "pointer-events-none");
        setTimeout(() => card.remove(), 150);
      }

      showToast(t("booking.delete.deleted"));
      if (!grid().querySelector(".booking-card")) {
        renderBookings([]);
      }

      const modal = document.getElementById("bookingModal");
      if (modal) closeBookingModal();
    } catch (err) {
      console.error(err);
      showToast(
        err?.message || t("booking.modal.error.load", { msg: "" }),
        "error"
      );
      btn.disabled = false;
      btn.innerHTML = prevHtml;
    }
  }

  function buildModalSkeleton() {
    const overlay = document.createElement("div");
    overlay.id = "bookingModal";
    overlay.className =
      "fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4";
    overlay.innerHTML = `
      <div class="bg-white w-full max-w-lg rounded-2xl shadow-xl relative">
        <div class="p-6">
          <div id="bookingModalHeader" class="flex items-start justify-between gap-3">
            <h3 class="font-semibold text-lg leading-snug">${t(
              "booking.modal.title"
            )}</h3>
            <span id="bookingModalStatus"></span>
          </div>

          <div id="bookingModalBody" class="mt-4 space-y-3 text-sm text-gray-700">
            <div class="flex items-center gap-2 text-gray-500">
              <i class="fa-solid fa-circle-notch fa-spin"></i>
              <span>${t("booking.modal.loading")}</span>
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
    const overlay = buildModalSkeleton();
    document.body.appendChild(overlay);
    document.documentElement.style.overflow = "hidden";

    overlay.addEventListener("click", (e) => {
      const card = overlay.firstElementChild;
      if (!card.contains(e.target)) {
        e.stopPropagation();
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

      header.querySelector("h3").textContent =
        b.tripName || t("booking.modal.title");
      statusSlot.innerHTML = statusBadge(b.status);

      const publicIdLbl = t("booking.card.publicId");
      const createdLbl = t("booking.card.created");
      const adultsLbl = t("booking.card.adults");
      const childrenLbl = t("booking.card.children");
      const totalLbl = t("booking.card.total");
      const copyLbl = t("booking.btn.copy");

      body.innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="space-y-1">
            <div class="text-xs text-gray-500">${publicIdLbl}</div>
            <div class="flex items-center gap-2">
              <code class="text-xs bg-gray-50 px-1.5 py-0.5 rounded break-all">${
                b.bookingPublicId
              }</code>
              <button class="copy-id text-xs underline hover:no-underline" type="button" data-id="${
                b.bookingPublicId
              }">
                ${copyLbl}
              </button>
            </div>
          </div>

          <div class="space-y-1">
            <div class="text-xs text-gray-500">${createdLbl}</div>
            <div class="font-medium">${formatDateLocal(b.createdAt)}</div>
          </div>

          <div class="space-y-1">
            <div class="text-xs text-gray-500">${adultsLbl}</div>
            <div class="font-medium">${b.adults ?? "-"}</div>
          </div>

          <div class="space-y-1">
            <div class="text-xs text-gray-500">${childrenLbl}</div>
            <div class="font-medium">${b.childrens ?? "-"}</div>
          </div>

          <div class="space-y-1">
            <div class="text-xs text-gray-500">${totalLbl}</div>
            <div class="font-medium">${formatPrice(b.totalCost, "EUR")}</div>
          </div>
        </div>
      `;

      footer.innerHTML = "";
      const isPending = String(b.status).toLowerCase() === "pending";
      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "px-4 py-2 rounded-lg border hover:bg-gray-50";
      closeBtn.textContent = t("booking.modal.close");
      closeBtn.addEventListener("click", closeBookingModal);
      footer.appendChild(closeBtn);

      if (isPending) {
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className =
          "px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white";
        delBtn.innerHTML = `<i class="fa-solid fa-trash mr-2"></i>${t(
          "booking.modal.delete"
        )}`;
        delBtn.addEventListener("click", () => deleteBooking(b.id, delBtn));
        footer.appendChild(delBtn);
      }

      body.addEventListener("click", (e) => {
        const copyBtn = e.target.closest(".copy-id");
        if (copyBtn) {
          const text = copyBtn.getAttribute("data-id");
          try {
            navigator.clipboard.writeText(text);
            showToast(t("booking.toast.copied"));
          } catch (_) {
            showToast(t("booking.toast.copyFailed"), "error");
          }
        }
      });
    } catch (err) {
      console.error(err);
      body.innerHTML = `
        <div class="p-3 rounded-lg bg-red-50 text-red-700 text-sm">
          ${t("booking.modal.error.load", { msg: err?.message || "" })}
        </div>
      `;
    }
  }

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
    document
      .getElementById("navProfile")
      .addEventListener("click", () => setActiveNav("profile"));
    document
      .getElementById("navBookings")
      .addEventListener("click", async () => {
        setActiveNav("bookings");
        if (!loadedOnce) await fetchBookings();
      });

    setActiveNav("profile");

    grid().addEventListener("click", (e) => {
      const delBtn = e.target.closest(".delete-booking");
      if (delBtn) {
        const id = delBtn.getAttribute("data-bid");
        deleteBooking(id, delBtn);
        e.stopPropagation();
        return;
      }
      const copyBtn = e.target.closest(".copy-id");
      if (copyBtn) {
        const text = copyBtn.getAttribute("data-id");
        try {
          navigator.clipboard.writeText(text);
          showToast(t("booking.toast.copied"));
        } catch (_) {
          showToast(t("booking.toast.copyFailed"), "error");
        }
        e.stopPropagation();
        return;
      }
      const card = e.target.closest(".booking-card");
      if (card) {
        const id = card.getAttribute("data-id");
        openBookingModal(id);
      }
    });
  });
})();
