// ../JS/trip-details.js
(function () {
  const $ = (id) => document.getElementById(id);

  // ---------- Image fallbacks (no external DNS needed) ----------
  const FALLBACK_DATA_IMG =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='800'>
         <rect width='100%' height='100%' fill='#e5e7eb'/>
         <text x='50%' y='50%' text-anchor='middle' dominant-baseline='middle'
               font-size='36' fill='#9ca3af' font-family='system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif'>
           No Image
         </text>
       </svg>`
    );

  function safeImg(u) {
    if (!u) return FALLBACK_DATA_IMG;
    if (/^data:/i.test(u)) return u;
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith("//")) return window.location.protocol + u;
    return u.startsWith("/") ? u : `/${u}`;
  }

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

  // ---------- Utils ----------
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

  const formatPrice = (value, currency = "EUR") => {
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

  // ---------------- Toasts (Tailwind-ish) ----------------
  function ensureToastRoot() {
    let root = document.getElementById("toast-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "toast-root";
      root.className =
        "fixed z-[70] top-4 right-4 w-[92vw] max-w-sm space-y-3 pointer-events-none";
      document.body.appendChild(root);
    }
    return root;
  }
  function toast(type, title, message, ms = 4200) {
    const root = ensureToastRoot();
    const wrap = document.createElement("div");
    wrap.className =
      "pointer-events-auto rounded-xl shadow-lg border overflow-hidden bg-white";
    const color =
      type === "success"
        ? "bg-green-600"
        : type === "error"
        ? "bg-red-600"
        : type === "warning"
        ? "bg-yellow-500"
        : "bg-blue-600";
    wrap.innerHTML = `
      <div class="${color} text-white px-4 py-2 text-sm font-semibold">${esc(
      title || ""
    )}</div>
      <div class="px-4 py-3 text-sm text-gray-700">${esc(message || "")}</div>
    `;
    root.appendChild(wrap);
    const timer = setTimeout(() => {
      wrap.style.opacity = "0";
      wrap.style.transform = "translateY(-6px)";
      setTimeout(() => wrap.remove(), 200);
    }, ms);
    wrap.addEventListener("click", () => {
      clearTimeout(timer);
      wrap.remove();
    });
  }

  // ---------------- Auth helpers ----------------
  const LOGIN_URL = "sign-in.html"; // change if different

  const parseMaybeTextJSON = async (res) => {
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("application/json")) return res.json();
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  };

  function redirectToLogin() {
    const returnUrl = encodeURIComponent(
      location.pathname + location.search + location.hash
    );
    location.href = `${LOGIN_URL}?returnUrl=${returnUrl}`;
  }

  async function getFreshAccessToken() {
    const res = await fetch("/api/Auth/GetToken", {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json, text/plain" },
    });

    if (!res.ok) {
      const err = new Error("Auth token refresh failed");
      err.status = res.status;
      throw err;
    }

    const data = await parseMaybeTextJSON(res);
    if (data?.succeeded && data?.data?.accessToken) {
      try {
        localStorage.setItem("accessToken", data.data.accessToken);
      } catch {}
      window.currentUser = data.data;
      return data.data.accessToken;
    }
    const err = new Error(data?.message || "Not authenticated");
    err.code = "AUTH";
    throw err;
  }

  async function ensureLoggedInOrRedirect() {
    try {
      await getFreshAccessToken();
      return true;
    } catch (e) {
      toast("info", "Sign in required", "Please sign in to continue.");
      redirectToLogin();
      return false;
    }
  }

  async function addBooking({ tripId, tripDateISO, adults, children }) {
    const token = await getFreshAccessToken();

    const res = await fetch("/api/Booking/AddBooking", {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json, text/plain",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        adults: Number(adults) || 0,
        children: Number(children) || 0,
        tripDate: String(tripDateISO),
        tripId: Number(tripId),
      }),
    });

    const payload = await parseMaybeTextJSON(res);

    if (!res.ok || payload?.succeeded === false) {
      const msg =
        payload?.message ||
        (Array.isArray(payload?.errors) && payload.errors[0]) ||
        `Booking failed (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      err.details = payload;
      throw err;
    }

    return payload;
  }

  // ---------------- Add Review ----------------
  async function addReview({ tripId, rating, comment }) {
    const token = await getFreshAccessToken(); // <- refresh before action

    const res = await fetch("/api/Reviews/AddReview", {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json, text/plain",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        tripId: Number(tripId),
        rating: Number(rating),
        comment: String(comment || "").trim(),
      }),
    });

    const payload = await parseMaybeTextJSON(res);

    if (!res.ok || payload?.succeeded === false) {
      const msg =
        payload?.message ||
        (Array.isArray(payload?.errors) && payload.errors[0]) ||
        `Add review failed (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      err.details = payload;
      throw err;
    }

    return payload;
  }

  // ---------------- Reviews UI helpers ----------------
  function pluralize(n, one = "review", many = "reviews") {
    return `${n} ${n === 1 ? one : many}`;
  }

  function faStarsHTML(value) {
    // full/half/empty FontAwesome stars for any 0..5 value
    const v = Math.max(0, Math.min(5, Number(value) || 0));
    const full = Math.floor(v);
    const half = v - full >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    return (
      '<i class="fa-solid fa-star text-yellow-400"></i>'.repeat(full) +
      (half
        ? '<i class="fa-solid fa-star-half-stroke text-yellow-400"></i>'
        : "") +
      '<i class="fa-regular fa-star text-gray-300"></i>'.repeat(empty)
    );
  }

  function wireReviewsForm() {
    const form = $("writeReviewForm");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const tripId = getTripIdFromUrl();
      const rating = Number($("rvRating")?.value || 0);
      const comment = ($("rvComment")?.value || "").trim();
      const name = ($("rvName")?.value || "").trim();

      if (!(rating >= 1 && rating <= 5)) {
        toast("warning", "Pick a rating", "Please choose from 1 to 5 stars.");
        return;
      }
      if (comment.length < 10) {
        toast(
          "warning",
          "Comment too short",
          "Please write at least 10 characters."
        );
        return;
      }

      const ok = await ensureLoggedInOrRedirect();
      if (!ok) return;

      const submitBtn = form.querySelector('button[type="submit"]');
      const original = submitBtn?.textContent;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Submitting…";
      }

      try {
        await addReview({ tripId, rating, comment });
        await fetchReviews(tripId); // refresh list + stats

        toast("success", "Review added", "Thanks for sharing your experience!");

        // Reset UI
        form.reset();
        form.querySelectorAll(".fa-star, .fa-star-half-stroke").forEach((i) => {
          i.classList.remove("fa-solid", "text-yellow-400");
          i.classList.add("fa-regular", "text-gray-300");
        });

        // Show inline “thanks” message
        const rvToastEl = $("rvToast");
        if (rvToastEl) {
          rvToastEl.classList.remove("hidden");
          setTimeout(() => rvToastEl.classList.add("hidden"), 3000);
        }
      } catch (err) {
        console.error("Add review error:", err);
        if (err?.status === 401 || err?.status === 403) {
          toast("info", "Sign in required", "Please sign in to add a review.");
          redirectToLogin();
        } else {
          toast(
            "error",
            "Couldn't add review",
            err?.message || "Please try again."
          );
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = original || "Submit review";
        }
      }
    });
  }

  // ---------------- Reviews state + fetch ----------------
  const reviewState = {
    all: [],
    userId: null,
    pageSize: 6,
    visible: 0,
    filter: "all",
    sort: "newest",
  };

  function normalizeReview(r) {
    return {
      id:
        r.id ??
        r.reviewId ??
        `${r.userId || r.appUserId || "u"}-${r.tripId || r.tripID || "t"}`,
      userId: r.userId ?? r.appUserId ?? r.user?.id ?? null,
      userName: r.userName ?? r.fullName ?? r.user?.fullName ?? "Anonymous",
      avatar: r.user?.profilePictureURL ?? r.profilePictureURL ?? "",
      rating: Number(r.rating ?? r.stars ?? r.rate ?? 0),
      comment: r.comment ?? r.text ?? "",
      createdAt: r.createdAt ?? r.createdOn ?? r.date ?? r.reviewDate ?? null,
    };
  }

  async function fetchReviews(tripId) {
    // Try to know who is signed in (without forcing login)
    let userId = null;
    try {
      await getFreshAccessToken(); // sets window.currentUser if signed in
      userId = window.currentUser?.id ?? null;
    } catch (_) {
      /* not signed in is fine */
    }
    reviewState.userId = userId;

    const params = new URLSearchParams({ TripId: String(tripId) });
    if (userId != null) params.append("UserId", String(userId));

    // loading skeleton
    const listEl = $("reviewsList");
    if (listEl) {
      listEl.innerHTML = Array.from({ length: 3 })
        .map(
          () => `<div class="bg-white rounded-xl shadow p-4 animate-pulse">
                   <div class="h-5 bg-gray-200 rounded w-32 mb-3"></div>
                   <div class="h-4 bg-gray-200 rounded w-full mb-2"></div>
                   <div class="h-4 bg-gray-200 rounded w-5/6"></div>
                 </div>`
        )
        .join("");
    }

    let list = [];
    try {
      const res = await fetch(`/api/Reviews/GetReviews?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      const arr = Array.isArray(json)
        ? json
        : Array.isArray(json?.data?.data)
        ? json.data.data
        : Array.isArray(json?.data)
        ? json.data
        : [];
      list = arr.map(normalizeReview);
    } catch (e) {
      console.error("GetReviews error:", e);
      toast("error", "Couldn't load reviews", "Please try again later.");
      list = [];
    }

    reviewState.all = list;
    reviewState.visible = Math.min(reviewState.pageSize, list.length);
    applyReviewsUI();
  }

  // ---------------- Reviews stats + breakdown ----------------
  function renderReviewStats(list) {
    const total = list.length;
    const sum = list.reduce((s, r) => s + (Number(r.rating) || 0), 0);
    const avg = total ? sum / total : 0;

    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    list.forEach((r) => {
      const rr = Math.max(1, Math.min(5, Math.round(Number(r.rating) || 0)));
      counts[rr]++;
    });

    // Summary card
    const avgEl = $("avgRating");
    const avgStarsEl = $("avgStars");
    const countEl = $("reviewsCount");
    if (avgEl) avgEl.textContent = avg ? avg.toFixed(1) : "—";
    if (avgStarsEl) avgStarsEl.innerHTML = faStarsHTML(avg);
    if (countEl) countEl.textContent = pluralize(total);

    // Header row
    const hdrAvgEl = $("reviewsAverageText");
    const hdrStarsEl = $("reviewsHeaderStars");
    const hdrCountEl = $("reviewsCountHeader");
    if (hdrAvgEl) hdrAvgEl.textContent = avg ? avg.toFixed(1) : "—";
    if (hdrStarsEl) hdrStarsEl.innerHTML = faStarsHTML(avg);
    if (hdrCountEl)
      hdrCountEl.textContent = `${total} ${total === 1 ? "review" : "reviews"}`;

    // Breakdown bars 5..1 using the provided template
    const container = $("breakdownRows");
    const tpl = $("ratingRowTemplate");
    if (container && tpl) {
      container.innerHTML = "";
      const max = total || 1;
      for (let i = 5; i >= 1; i--) {
        const node = tpl.content.cloneNode(true);
        node.querySelector(".starLabel").textContent = i;
        node.querySelector(".bar").style.width = `${(counts[i] / max) * 100}%`;
        node.querySelector(".count").textContent = String(counts[i]);
        container.appendChild(node);
      }
    }
  }

  // ---------------- Render reviews list ----------------
  function renderReviewsList(list) {
    const wrap = $("reviewsList");
    if (!wrap) return;

    const isMine = (r) =>
      reviewState.userId != null &&
      String(r.userId) === String(reviewState.userId);

    if (!list.length) {
      wrap.innerHTML = `<div class="text-center text-gray-500 py-6">No reviews yet. Be the first to review!</div>`;
      return;
    }

    const lang = localStorage.getItem("lang") === "deu" ? "de-DE" : "en-EG";

    wrap.innerHTML = list
      .map((r) => {
        const when = r.createdAt ? new Date(r.createdAt) : null;
        const dateStr =
          when && !isNaN(when)
            ? when.toLocaleDateString(lang, {
                year: "numeric",
                month: "short",
                day: "2-digit",
              })
            : "";
        const actions = isMine(r)
          ? `<div class="flex gap-2 mt-1">
               <button class="rv-edit px-3 py-1.5 rounded bg-yellow-500 hover:bg-yellow-600 text-white text-xs" data-id="${esc(
                 r.id
               )}">Edit</button>
               <button class="rv-del px-3 py-1.5 rounded bg-red-600 hover:bg-red-700 text-white text-xs" data-id="${esc(
                 r.id
               )}">Delete</button>
             </div>`
          : "";
        const avatar = r.avatar
          ? `<img src="${esc(
              safeImg(r.avatar)
            )}" class="w-9 h-9 rounded-full object-cover" onerror="this.src='${FALLBACK_DATA_IMG}'" />`
          : `<div class="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-sm">${esc(
              (r.userName || "A")[0]
            ).toUpperCase()}</div>`;

        return `
        <div class="bg-white rounded-xl shadow p-4" data-rid="${esc(r.id)}">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-3">
              ${avatar}
              <div>
                <div class="font-medium">${esc(r.userName || "Anonymous")}</div>
                <div class="text-xs text-gray-400">${dateStr}</div>
              </div>
            </div>
            <div class="text-right">
              <div class="text-yellow-400">${faStarsHTML(r.rating)}</div>
              ${actions}
            </div>
          </div>
          <p class="mt-3 text-gray-700 whitespace-pre-line">${esc(
            r.comment || ""
          )}</p>
        </div>`;
      })
      .join("");

    // Wire actions
    wrap.querySelectorAll(".rv-edit").forEach((btn) => {
      btn.addEventListener("click", () =>
        enterEditMode(btn.getAttribute("data-id"))
      );
    });
    wrap.querySelectorAll(".rv-del").forEach((btn) => {
      btn.addEventListener("click", () =>
        confirmDelete(btn.getAttribute("data-id"))
      );
    });
  }

  // ---------------- Apply filter/sort/pagination ----------------
  function applyReviewsUI() {
    const { all, filter, sort, visible } = reviewState;

    // Stats first
    renderReviewStats(all);

    // If the user already reviewed, hide the write form
    const hasMine =
      reviewState.userId != null &&
      all.some((r) => String(r.userId) === String(reviewState.userId));
    const formCard = $("writeReviewCard");
    if (formCard) formCard.classList.toggle("hidden", hasMine);

    // Filter by exact star value if picked
    let list = all.slice();
    if (filter !== "all") {
      const n = Number(filter);
      list = list.filter((r) => Math.round(r.rating) === n);
    }

    // Sort
    list.sort((a, b) => {
      if (sort === "highest") return b.rating - a.rating;
      if (sort === "lowest") return a.rating - b.rating;
      // newest by createdAt desc
      const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return db - da || (b.id > a.id ? 1 : -1);
    });

    // Render current page
    renderReviewsList(list.slice(0, visible));

    // Load more button
    const btn = $("reviewsLoadMore");
    if (btn) {
      btn.classList.toggle("hidden", list.length <= visible);
      btn.onclick = () => {
        reviewState.visible = Math.min(
          list.length,
          reviewState.visible + reviewState.pageSize
        );
        renderReviewsList(list.slice(0, reviewState.visible));
        btn.classList.toggle("hidden", list.length <= reviewState.visible);
      };
    }
  }

  function wireReviewsSection() {
    $("reviewsFilter")?.addEventListener("change", (e) => {
      reviewState.filter = e.target.value;
      reviewState.visible = reviewState.pageSize;
      applyReviewsUI();
    });
    $("reviewsSort")?.addEventListener("change", (e) => {
      reviewState.sort = e.target.value;
      applyReviewsUI();
    });

    wireReviewsForm(); // keep the create flow from previous step

    const id = getTripIdFromUrl();
    if (id) fetchReviews(id);
  }

  // ---------------- Edit / Delete ----------------
  async function updateReview({ tripId, rating, comment }) {
    const token = await getFreshAccessToken();
    const res = await fetch("/api/Reviews/UpdateReview", {
      method: "PUT",
      credentials: "include",
      headers: {
        Accept: "application/json, text/plain",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        tripId: Number(tripId),
        rating: Number(rating),
        comment: String(comment || "").trim(),
      }),
    });
    const payload = await parseMaybeTextJSON(res);
    if (!res.ok || payload?.succeeded === false) {
      const msg =
        payload?.message ||
        (Array.isArray(payload?.errors) && payload.errors[0]) ||
        `Update review failed (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      err.details = payload;
      throw err;
    }
    return payload;
  }

  async function deleteReview({ tripId, userId }) {
    // Token likely required; try to refresh but don't crash if missing
    const token = await getFreshAccessToken().catch(() => null);
    const params = new URLSearchParams();
    if (userId != null) params.append("UserId", String(userId));

    const res = await fetch(
      `/api/Reviews/DeleteReview/${encodeURIComponent(
        tripId
      )}?${params.toString()}`,
      {
        method: "DELETE",
        credentials: "include",
        headers: {
          Accept: "application/json, text/plain",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      }
    );
    const payload = await parseMaybeTextJSON(res);
    if (!res.ok || payload?.succeeded === false) {
      const msg =
        payload?.message ||
        (Array.isArray(payload?.errors) && payload.errors[0]) ||
        `Delete review failed (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      err.details = payload;
      throw err;
    }
    return payload;
  }

  function enterEditMode(id) {
    const card = document.querySelector(
      `[data-rid="${CSS.escape(String(id))}"]`
    );
    const r = reviewState.all.find((x) => String(x.id) === String(id));
    if (!card || !r) return;

    card.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="font-medium">Edit your review</div>
        <button class="rv-cancel text-sm text-gray-500 hover:text-gray-700">Cancel</button>
      </div>
      <div class="mt-3">
        <div class="mb-2 flex items-center gap-1" id="rvEditStars"></div>
        <textarea id="rvEditComment" rows="4" class="w-full border border-gray-300 px-3 py-2 rounded outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500">${esc(
          r.comment || ""
        )}</textarea>
        <div class="mt-3 flex gap-2">
          <button class="rv-save bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2 rounded">Save</button>
          <button class="rv-cancel border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold px-4 py-2 rounded">Cancel</button>
        </div>
      </div>`;

    // Star input
    const starsWrap = card.querySelector("#rvEditStars");
    let current = Math.round(Number(r.rating) || 0);
    for (let i = 1; i <= 5; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.innerHTML = `<i class="${
        i <= current ? "fa-solid" : "fa-regular"
      } fa-star text-xl ${
        i <= current ? "text-yellow-400" : "text-gray-300"
      }"></i>`;
      b.className = "p-1";
      b.addEventListener("mouseenter", () => paint(i));
      b.addEventListener("mouseleave", () => paint(current));
      b.addEventListener("click", () => {
        current = i;
        paint(current);
      });
      starsWrap.appendChild(b);
    }
    function paint(v) {
      starsWrap.querySelectorAll("i").forEach((iEl, idx) => {
        const k = idx + 1;
        iEl.classList.toggle("fa-solid", k <= v);
        iEl.classList.toggle("fa-regular", k > v);
        iEl.classList.toggle("text-yellow-400", k <= v);
        iEl.classList.toggle("text-gray-300", k > v);
      });
    }

    // Cancel/Save
    card
      .querySelectorAll(".rv-cancel")
      .forEach((b) => b.addEventListener("click", () => applyReviewsUI()));
    card.querySelector(".rv-save")?.addEventListener("click", async () => {
      const comment = (
        card.querySelector("#rvEditComment")?.value || ""
      ).trim();
      if (comment.length < 10) {
        toast(
          "warning",
          "Comment too short",
          "Please write at least 10 characters."
        );
        return;
      }
      try {
        await updateReview({
          tripId: getTripIdFromUrl(),
          rating: current,
          comment,
        });
        // mutate in-memory and re-apply UI
        r.rating = current;
        r.comment = comment;
        toast("success", "Review updated", "Your changes were saved.");
        applyReviewsUI();
      } catch (e) {
        console.error("UpdateReview error:", e);
        if (e?.status === 401 || e?.status === 403) {
          toast(
            "info",
            "Sign in required",
            "Please sign in to update your review."
          );
          redirectToLogin();
        } else {
          toast(
            "error",
            "Couldn't update review",
            e?.message || "Please try again."
          );
        }
      }
    });
  }

  function confirmDelete(id) {
    const r = reviewState.all.find((x) => String(x.id) === String(id));
    if (!r) return;
    const ok = window.confirm(
      "Delete your review? This action cannot be undone."
    );
    if (!ok) return;

    deleteReview({ tripId: getTripIdFromUrl(), userId: reviewState.userId })
      .then(() => {
        reviewState.all = reviewState.all.filter(
          (x) => String(x.id) !== String(id)
        );
        toast("success", "Review deleted", "Your review was removed.");
        applyReviewsUI();
      })
      .catch((e) => {
        console.error("DeleteReview error:", e);
        if (e?.status === 401 || e?.status === 403) {
          toast(
            "info",
            "Sign in required",
            "Please sign in to delete your review."
          );
          redirectToLogin();
        } else {
          toast(
            "error",
            "Couldn't delete review",
            e?.message || "Please try again."
          );
        }
      });
  }

  // ---------------- Availability (dates + times) ----------------
  const fmtDateKey = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
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
    if (dayKey === fmtDateKey(now))
      options = options.filter((o) => o.date > now);

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

    if (window.flatpickr) {
      try {
        datePickerInstance?.destroy?.();
      } catch {}
      datePickerInstance = flatpickr(dateInput, {
        dateFormat: "Y-m-d",
        minDate: availability.days[0],
        enable: availability.days,
        defaultDate: availability.days[0],
        disableMobile: true,
        onChange: (selectedDates) => {
          const d = selectedDates && selectedDates[0];
          if (d) syncTimeOptions(fmtDateKey(d));
        },
      });

      syncTimeOptions(availability.days[0]);
    } else {
      dateInput.type = "date";
      dateInput.min = availability.days[0];
      dateInput.value = availability.days[0];
      dateInput.disabled = false;

      dateInput.addEventListener("change", () => {
        const val = dateInput.value;
        if (!availability.days.includes(val)) {
          dateInput.value = availability.days[0];
          syncTimeOptions(availability.days[0]);
        } else {
          syncTimeOptions(val);
        }
      });

      syncTimeOptions(availability.days[0]);
    }
  };

  // ---------------- Ensure Related DOM IDs exist ----------------
  function ensureRelatedDOM() {
    if (
      document.getElementById("relatedGrid") &&
      document.getElementById("relatedPrevBtn") &&
      document.getElementById("relatedNextBtn")
    )
      return;

    const sections = Array.from(document.querySelectorAll("section"));
    const sec = sections.find((s) => {
      const h2 = s.querySelector("h2");
      return h2 && /related tours/i.test(h2.textContent || "");
    });
    if (!sec) return;

    const headerBtns = sec.querySelectorAll("button");
    if (headerBtns[0] && !headerBtns[0].id) headerBtns[0].id = "relatedPrevBtn";
    if (headerBtns[1] && !headerBtns[1].id) headerBtns[1].id = "relatedNextBtn";

    const grid = sec.querySelector("div.grid");
    if (grid && !grid.id) grid.id = "relatedGrid";
  }

  // ---------------- Related trips (2 on small, 3 on ≥md) ----------------
  const relatedState = {
    trips: [],
    page: 0,
    windowSize: getRelatedWindowSize(),
  };

  function getRelatedWindowSize() {
    return window.matchMedia("(min-width: 768px)").matches ? 3 : 2;
  }

  function clampPage(total, win) {
    const pages = Math.max(1, Math.ceil(total / win));
    if (relatedState.page >= pages) relatedState.page = pages - 1;
    if (relatedState.page < 0) relatedState.page = 0;
    return pages;
  }

  function applyGridColumns(grid, cols) {
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = `repeat(${Math.max(
      cols,
      1
    )}, minmax(0, 1fr))`;
    grid.style.gap = "1.5rem"; // gap-6
  }

  function renderRelatedPage() {
    const grid = $("relatedGrid");
    if (!grid) return;

    const total = relatedState.trips.length;
    const win = relatedState.windowSize || 2;
    const pages = clampPage(total, win);

    applyGridColumns(grid, Math.min(win, total || win));

    if (!total) {
      grid.innerHTML = `<div class="col-span-full text-center text-gray-500 py-8">No related trips found.</div>`;
    } else {
      const start = relatedState.page * win;
      const slice = relatedState.trips.slice(start, start + win);

      // Use global tripCardHTML if available
      if (typeof tripCardHTML === "function") {
        grid.innerHTML = slice.map((t) => tripCardHTML(t)).join("");
      } else {
        grid.innerHTML = slice
          .map(
            (t) => `
            <a href="/pages/trip-details.html?id=${t.id ?? ""}"
               class="block bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition"
               data-animate="card">
              <img class="w-full h-40 object-cover"
                   src="${esc(safeImg(t.mainImageURL))}"
                   alt="${esc(t.name || "Trip")}" />
              <div class="p-4">
                <h3 class="text-sm font-semibold mb-2">${esc(
                  t.name || "Trip"
                )}</h3>
                <ul class="text-xs text-gray-600 space-y-1 mb-3">
                  <li><i class="fas fa-clock mr-1"></i> ${esc(
                    minsToLabel(t.duration)
                  )}</li>
                  <li><i class="fas fa-users mr-1"></i> ${
                    Number(t.reviews) || 0
                  } reviews</li>
                </ul>
                <div class="flex justify-between items-center text-sm">
                  <div class="text-yellow-500">${esc(stars(t.rating))}</div>
                  <div class="text-green-600 font-semibold">
                    ${t.price != null ? esc(formatPrice(t.price, "EUR")) : ""}
                    <span class="text-gray-400 text-xs">per person</span>
                  </div>
                </div>
              </div>
            </a>`
          )
          .join("");
      }
    }

    // attach image fallbacks for the freshly injected cards
    attachImgFallbacks(grid);

    // Enable/disable arrows
    const prev = $("relatedPrevBtn");
    const next = $("relatedNextBtn");
    const disabled = pages <= 1;
    if (prev) prev.disabled = disabled;
    if (next) next.disabled = disabled;
    if (prev) prev.classList.toggle("opacity-40", disabled);
    if (next) next.classList.toggle("opacity-40", disabled);
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), ms);
    };
  }

  function wireRelatedNav() {
    const prev = $("relatedPrevBtn");
    const next = $("relatedNextBtn");

    prev?.addEventListener("click", () => {
      const total = relatedState.trips.length;
      const win = relatedState.windowSize;
      const pages = Math.max(1, Math.ceil(total / win));
      if (pages <= 1) return;
      relatedState.page = (relatedState.page - 1 + pages) % pages;
      renderRelatedPage();
    });
    next?.addEventListener("click", () => {
      const total = relatedState.trips.length;
      const win = relatedState.windowSize;
      const pages = Math.max(1, Math.ceil(total / win));
      if (pages <= 1) return;
      relatedState.page = (relatedState.page + 1) % pages;
      renderRelatedPage();
    });

    // Recalc window size on resize
    const onResize = () => {
      const newWin = getRelatedWindowSize();
      if (newWin !== relatedState.windowSize) {
        relatedState.windowSize = newWin;
        renderRelatedPage();
      }
    };
    window.addEventListener("resize", debounce(onResize, 120));
  }

  async function resolveCategoryIdFromTrip(trip) {
    if (trip?.categoryId) return trip.categoryId;
    if (trip?.category?.id) return trip.category.id;

    const langId = getLangId();
    try {
      const res = await fetch(`/api/Category/GetAllCategories/${langId}`);
      const json = await res.json();
      const cats = json?.data?.data || [];
      const wanted = ((trip?.categoryName ?? trip?.category) || "")
        .toString()
        .trim()
        .toLowerCase();
      const match = cats.find(
        (c) => (c?.name || "").toString().trim().toLowerCase() === wanted
      );
      return match?.id ?? null;
    } catch {
      return null;
    }
  }

  async function loadRelatedTripsForTrip(trip, { noCache = false } = {}) {
    const grid = $("relatedGrid");
    if (!grid) return;

    // skeletons
    grid.innerHTML = `
      <div class="animate-pulse bg-white rounded-lg shadow-md overflow-hidden">
        <div class="w-full h-40 bg-gray-200"></div>
        <div class="p-4 space-y-3">
          <div class="h-5 bg-gray-200 rounded w-3/4"></div>
          <div class="h-4 bg-gray-200 rounded w-1/2"></div>
          <div class="h-4 bg-gray-200 rounded w-2/3"></div>
        </div>
      </div>`.repeat(relatedState.windowSize);

    const categoryId = await resolveCategoryIdFromTrip(trip);
    if (!categoryId) {
      grid.innerHTML = `<div class="col-span-full text-center text-gray-500 py-8">No category found for this trip.</div>`;
      return;
    }

    const langId = getLangId();
    const params = new URLSearchParams({
      CategoryId: String(categoryId),
      TranslationLanguageId: String(langId),
      PageSize: "50",
      PageNumber: "1",
    });
    params.append("Sort", "rand");
    if (noCache) params.append("_ts", Date.now());

    let trips = [];
    try {
      const res = await fetch(`/api/Trip/GetAllTrips?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      trips = json?.data?.data ?? [];
    } catch (e) {
      console.error("Related trips load error:", e);
      grid.innerHTML = `<div class="col-span-full text-center text-red-500 py-8">Couldn't load related trips.</div>`;
      return;
    }

    // Exclude current trip
    const currentId = getTripIdFromUrl();
    relatedState.trips = trips.filter(
      (t) => String(t.id) !== String(currentId)
    );
    relatedState.page = 0;

    renderRelatedPage();
  }

  // ---------------- Image modal ----------------
  let imageList = [];
  let currentIndex = 0;

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
      // main image fallback
      main.addEventListener(
        "error",
        () => {
          main.src = FALLBACK_DATA_IMG;
        },
        { once: true }
      );
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

    // attach fallbacks for thumbnails
    attachImgFallbacks(gal);

    gal.querySelectorAll("img").forEach((thumb) => {
      thumb.addEventListener("click", () => {
        const idx = Number(thumb.getAttribute("data-index")) || 0;
        currentIndex = idx;
        openModalAt(idx);
      });
    });
  };

  // ---------------- Render trip ----------------
  let currentTrip = null;

  const renderTrip = (t) => {
    currentTrip = t || {};

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
    // if API only gives mainImageURL (string), include it
    if (t.mainImageURL && !galleryUrls.length) galleryUrls.push(t.mainImageURL);
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
      ($("tripDescription").innerText = `${t.description}` || "");

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
        t.price != null ? `${formatPrice(t.price, "EUR")}` : "");

    setUnavailableUI(!!t.isAvailable);

    setupAvailability(t.tripDates || []);

    // Load related trips for this category
    loadRelatedTripsForTrip(t);
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

      renderTrip(json.data || {});
    } catch (err) {
      console.error("Trip load error:", err);
      $("tripTitle") && ($("tripTitle").textContent = "Trip not available");
      $("tripDescription") &&
        ($("tripDescription").textContent =
          "We couldn't load this trip right now. Please try again later.");
      setUnavailableUI(false);
      renderGallery([""]);
      setupAvailability([]);
      const grid = $("relatedGrid");
      if (grid)
        grid.innerHTML = `<div class="col-span-full text-center text-gray-500 py-8">No related trips.</div>`;
    }
  }

  window.refreshTripDetailsLang = () => loadTrip({ noCache: true });

  // ---------------- Booking Confirmation Modal ----------------
  const bModal = $("bookingModal");
  const bBackdrop = $("bookingBackdrop");
  const bClose = $("bookingCloseBtn");
  const bEdit = $("bookingEditBtn");
  const bConfirm = $("bookingConfirmBtn");

  const bmTripName = $("bmTripName");
  const bmDate = $("bmDate");
  const bmTime = $("bmTime");
  const bmAdults = $("bmAdults");
  const bmChildren = $("bmChildren");
  const bmPriceAdult = $("bmPriceAdult");
  const bmPriceChild = $("bmPriceChild");
  const bmTotal = $("bmTotal");

  const openBookingModal = () => {
    if (!bModal) return;
    bModal.classList.remove("opacity-0", "pointer-events-none");
    bModal.classList.add("opacity-100", "pointer-events-auto");
    bModal.setAttribute("aria-hidden", "false");
  };

  const closeBookingModal = () => {
    if (!bModal) return;
    bModal.classList.remove("opacity-100");
    bModal.classList.add("opacity-0", "pointer-events-none");
    bModal.setAttribute("aria-hidden", "true");
  };

  bBackdrop?.addEventListener("click", closeBookingModal);
  bClose?.addEventListener("click", closeBookingModal);
  bEdit?.addEventListener("click", closeBookingModal);

  $("bookBtn")?.addEventListener("click", async () => {
    const dateVal =
      (datePickerInstance?.selectedDates?.[0] &&
        fmtDateKey(datePickerInstance.selectedDates[0])) ||
      $("tripDateInput")?.value ||
      "";

    const timeISO = $("tripTimeSelect")?.value || "";
    const adultCount = Math.max(1, parseInt($("adultCount")?.value || "1", 10));
    const childCount = Math.max(0, parseInt($("childCount")?.value || "0", 10));

    if (!dateVal || !timeISO) {
      toast(
        "warning",
        "Select date & time",
        "Please choose an available date and time."
      );
      return;
    }

    const logged = await ensureLoggedInOrRedirect();
    if (!logged) return;

    const perAdult = Number(currentTrip?.price) || 0;
    const perChild = perAdult * 0.5;
    const total = perAdult * adultCount + perChild * childCount;

    bmTripName && (bmTripName.textContent = currentTrip?.name || "Trip");
    bmDate && (bmDate.textContent = dateVal);

    const t = new Date(timeISO);
    const lang = localStorage.getItem("lang") === "deu" ? "de-DE" : "en-EG";
    bmTime &&
      (bmTime.textContent = isNaN(t)
        ? ""
        : t.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" }));

    bmAdults && (bmAdults.textContent = String(adultCount));
    bmChildren && (bmChildren.textContent = String(childCount));
    bmPriceAdult && (bmPriceAdult.textContent = formatPrice(perAdult, "EUR"));
    bmPriceChild && (bmPriceChild.textContent = formatPrice(perChild, "EUR"));
    bmTotal && (bmTotal.textContent = formatPrice(total, "EUR"));

    bConfirm.dataset.payload = JSON.stringify({
      tripId: getTripIdFromUrl(),
      tripName: currentTrip?.name || "",
      date: dateVal,
      timeISO,
      adults: adultCount,
      children: childCount,
      perAdult,
      perChild,
      total,
    });

    openBookingModal();
  });

  bConfirm?.addEventListener("click", async () => {
    if (!bConfirm) return;

    let payload;
    try {
      payload = JSON.parse(bConfirm.dataset.payload || "{}");
    } catch {
      toast("error", "Missing details", "Please review your booking details.");
      return;
    }

    const originalText = bConfirm.textContent;
    bConfirm.disabled = true;
    bConfirm.textContent = "Booking…";

    try {
      await addBooking({
        tripId: payload.tripId,
        tripDateISO: payload.timeISO,
        adults: payload.adults,
        children: payload.children,
      });

      closeBookingModal();

      const timeTxt =
        new Date(payload.timeISO).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }) || "";
      toast(
        "success",
        "Booking confirmed",
        `Trip: ${payload.tripName} • ${
          payload.date
        } ${timeTxt}\nTotal: ${formatPrice(payload.total, "EUR")}`
      );
    } catch (e) {
      console.error("Booking error:", e);
      if (e?.status === 401 || e?.status === 403 || e?.code === "AUTH") {
        toast(
          "info",
          "Sign in required",
          "Please sign in to complete your booking."
        );
        redirectToLogin();
      } else {
        toast("error", "Booking failed", e.message || "Please try again.");
      }
    } finally {
      bConfirm.disabled = false;
      bConfirm.textContent = originalText;
    }
  });

  window.addEventListener("DOMContentLoaded", () => {
    ensureRelatedDOM();
    wireRelatedNav();
    wireReviewsSection();
    loadTrip();
  });
})();
