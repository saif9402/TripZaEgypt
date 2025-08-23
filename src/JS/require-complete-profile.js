(() => {
  // Pages where we should NOT block (auth pages)
  const SKIP_PAGES = [
    /sign-in\.html$/i,
    /sign-up\.html$/i,
    /check-email\.html$/i,
  ];

  // Nuke the legacy flag so it never interferes again
  try {
    localStorage.removeItem("mustCompleteProfile");
  } catch (_) {}

  // Only run for logged-in users, and not on auth pages
  if (!localStorage.getItem("accessToken")) return;
  if (SKIP_PAGES.some((rx) => rx.test(location.pathname))) return;

  // --- Helpers ---
  function waitForCurrentUser(timeoutMs = 12000) {
    return new Promise((resolve) => {
      if (window.currentUser) return resolve(window.currentUser);
      const start = Date.now();
      const ticker = setInterval(() => {
        if (window.currentUser) {
          clearInterval(ticker);
          resolve(window.currentUser);
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(ticker);
          resolve(null);
        }
      }, 120);

      // If your includes.js emits this, we resolve immediately
      window.addEventListener(
        "auth:user",
        (e) => {
          clearInterval(ticker);
          resolve(e.detail?.user || window.currentUser || null);
        },
        { once: true }
      );
    });
  }

  function isProfileComplete(u) {
    if (!u) return true; // don't block if we couldn't load
    const phone = String(u.phoneNumber || u.phone || "").replace(/[^\d+]/g, "");
    const country = String(u.country || "").trim();
    const hasPhone = phone.length >= 7; // minimal sanity check
    const hasCountry = country.length > 0;
    return hasPhone && hasCountry;
  }

  function lockScroll(lock) {
    document.documentElement.style.overflow = lock ? "hidden" : "";
  }

  function toast(message, ok = true) {
    let tc = document.getElementById("toast-container");
    if (!tc) {
      tc = document.createElement("div");
      tc.id = "toast-container";
      tc.className = "fixed top-4 right-4 z-[10000] space-y-2";
      document.body.appendChild(tc);
    }
    const el = document.createElement("div");
    el.className =
      "max-w-sm w-full px-4 py-3 rounded-lg shadow-lg text-white animate-fade-in-up transition " +
      (ok ? "bg-green-600" : "bg-red-600");
    el.textContent = message;
    tc.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      el.addEventListener("transitionend", () => el.remove());
    }, 3500);
  }

  function openCompleteProfileModal(user) {
    if (document.getElementById("completeProfileModal")) return;

    const countries = [
      "Egypt",
      "Saudi Arabia",
      "UAE",
      "Qatar",
      "Kuwait",
      "Jordan",
      "Bahrain",
      "Oman",
      "Morocco",
      "Algeria",
      "Tunisia",
      "Libya",
      "Lebanon",
      "Iraq",
      "Syria",
      "Yemen",
      "Turkey",
      "USA",
      "UK",
      "France",
      "Germany",
      "Italy",
      "Spain",
      "Netherlands",
      "Switzerland",
      "Sweden",
      "Norway",
      "Denmark",
      "Finland",
      "Canada",
      "Brazil",
      "Argentina",
      "Mexico",
      "South Africa",
      "Kenya",
      "Nigeria",
      "India",
      "Pakistan",
      "Bangladesh",
      "China",
      "Japan",
      "South Korea",
      "Indonesia",
      "Malaysia",
      "Philippines",
      "Australia",
      "New Zealand",
      "Russia",
      "Ukraine",
      "Romania",
      "Poland",
      "Portugal",
      "Greece",
      "Ireland",
      "Austria",
      "Belgium",
      "Singapore",
      "Vietnam",
      "Thailand",
      "Sri Lanka",
    ];

    const overlay = document.createElement("div");
    overlay.id = "completeProfileModal";
    overlay.className =
      "fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4";

    const safeName = String(user?.fullName || "").replace(/\"/g, "&quot;");

    overlay.innerHTML = `
      <div class="bg-white w-full max-w-md rounded-2xl shadow-xl p-6 relative">
        <h2 class="text-xl font-semibold mb-1">Complete your profile</h2>
        <p class="text-sm text-gray-600 mb-4">Please add your phone number and country to continue.</p>

        <form id="cpForm" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input required id="cpName" type="text" class="w-full border border-gray-300 rounded-lg px-3 py-2" value="${safeName}">
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Phone Number <span class="text-red-500">*</span></label>
            <input id="cpPhone" type="tel" inputmode="tel" placeholder="+201234567890"
                   class="w-full border border-gray-300 rounded-lg px-3 py-2" required />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Country <span class="text-red-500">*</span></label>
            <select id="cpCountry" class="w-full border border-gray-300 rounded-lg px-3 py-2" required></select>
          </div>

          <button id="cpSave" type="submit"
                  class="w-full bg-yellow-400 hover:bg-yellow-500 text-white font-semibold py-2 rounded-lg">
            Save & Continue
          </button>
          <p class="text-[11px] text-gray-500 text-center">You can’t navigate away until this is saved.</p>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);
    lockScroll(true);

    const sel = overlay.querySelector("#cpCountry");
    countries.forEach((c) => {
      const o = document.createElement("option");
      o.value = c;
      o.textContent = c;
      sel.appendChild(o);
    });
    sel.value = user?.country || "Egypt";

    // Block closing by outside click or Esc
    overlay.addEventListener(
      "click",
      (e) => {
        const card = overlay.firstElementChild;
        if (!card.contains(e.target)) {
          e.stopPropagation();
          e.preventDefault();
        }
      },
      true
    );
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape") e.preventDefault();
      },
      true
    );

    overlay.querySelector("#cpForm").addEventListener("submit", async (e) => {
      e.preventDefault();

      const name = overlay.querySelector("#cpName").value.trim();
      const phone = overlay.querySelector("#cpPhone").value.trim();
      const country = overlay.querySelector("#cpCountry").value.trim();
      if (!country) return toast("Please choose your country.", false);

      const btn = overlay.querySelector("#cpSave");
      const prev = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Saving…";

      const token = localStorage.getItem("accessToken");
      const params = new URLSearchParams({
        FullName: name || user?.fullName || "",
        PhoneNumber: phone,
        Country: country,
      });

      try {
        const res = await fetch(`/api/Auth/Update?${params.toString()}`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: "include",
        });
        if (!res.ok) {
          let msg = res.statusText;
          try {
            const payload = await res.json();
            msg =
              payload?.message ||
              (Array.isArray(payload?.errors)
                ? payload.errors.join(", ")
                : msg);
          } catch (_) {}
          throw new Error(msg || "Update failed");
        }

        // Update global user + any visible UI if present
        if (window.currentUser) {
          window.currentUser.fullName = name || window.currentUser.fullName;
          window.currentUser.phoneNumber = phone;
          window.currentUser.country = country;
        }
        try {
          const n = document.getElementById("sidebarName");
          const l = document.getElementById("sidebarLocation");
          const pn = document.getElementById("profileName");
          const pp = document.getElementById("profilePhone");
          const pc = document.getElementById("profileLocation");
          if (n) n.textContent = name || user?.fullName || "User";
          if (l)
            l.innerHTML =
              '<i class="fas fa-map-marker-alt mr-1"></i> ' + country;
          if (pn) pn.value = name || user?.fullName || "";
          if (pp) pp.value = phone;
          if (pc) pc.value = country;
        } catch (_) {}

        toast("Profile updated. You're good to go!");
        overlay.remove();
        lockScroll(false);

        // Notify listeners if needed
        window.dispatchEvent(
          new CustomEvent("profile:completed", {
            detail: { fullName: name, phoneNumber: phone, country },
          })
        );
      } catch (ex) {
        console.error(ex);
        toast(ex.message || "Could not update profile.", false);
      } finally {
        btn.disabled = false;
        btn.textContent = prev;
      }
    });
  }

  // Start
  waitForCurrentUser().then((user) => {
    if (!user) return; // couldn't load user; don't block
    if (!isProfileComplete(user)) openCompleteProfileModal(user);
  });

  // Optional: expose to call manually if needed
  window.ensureCompleteProfile = async () => {
    const u = await waitForCurrentUser();
    if (u && !isProfileComplete(u)) openCompleteProfileModal(u);
  };
})();
