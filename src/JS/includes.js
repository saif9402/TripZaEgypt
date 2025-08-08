function includeHTML(id, file, onDone) {
  // Determine base path depending on current file location
  const currentPath = window.location.pathname;
  const isInPagesFolder = currentPath.includes("/pages/");
  const fullPath = isInPagesFolder ? `../${file}` : file;

  fetch(fullPath)
    .then((res) => res.text())
    .then((html) => {
      document.getElementById(id).innerHTML = html;
      onDone?.();
    })
    .catch((err) => console.error(`Error loading ${file}:`, err));
}

function checkAuthAndIncludeHeader() {
  const token = localStorage.getItem("accessToken");

  if (!token) {
    // Not logged in
    includeHTML(
      "header-placeholder",
      "pages/header.html",
      checkAllIncludesLoaded
    );
    return;
  }

  fetch("/api/Auth/GetToken", {
    method: "POST",
    credentials: "include",
  })
    .then(async (res) => {
      if (!res.ok) throw new Error("Response not OK");

      const text = await res.text(); // because response is text/plain
      const data = JSON.parse(text); // manually parse JSON string

      if (data?.succeeded && data?.data?.email) {
        window.currentUser = data.data;
        includeHTML(
          "header-placeholder",
          "pages/header-auth.html",
          checkAllIncludesLoaded
        );
      } else {
        localStorage.removeItem("accessToken");
        includeHTML(
          "header-placeholder",
          "pages/header.html",
          checkAllIncludesLoaded
        );
      }
    })
    .catch((err) => {
      console.error("Auth check failed:", err);
      includeHTML(
        "header-placeholder",
        "pages/header.html",
        checkAllIncludesLoaded
      );
    });
}

window.addEventListener("DOMContentLoaded", () => {
  checkAuthAndIncludeHeader();
  includeHTML(
    "footer-placeholder",
    "pages/footer.html",
    checkAllIncludesLoaded
  );
});

// --- Trending Now (Top Rated) ---
async function fetchAndRenderTrendingTrip() {
  const langCode = localStorage.getItem("lang") || "en";
  const langId = langCode === "deu" ? 1 : 2;

  const params = new URLSearchParams({
    IsTopRated: true,
    LanguageId: langId,
  });

  try {
    const res = await fetch(`/api/Trip/GetAllTrips?${params.toString()}`);
    const json = await res.json();

    const list = json?.data?.data || [];
    if (!json?.succeeded || !list.length) return;

    // pick the best rated (just in case the API doesn't sort)
    const top = list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0];

    // helpers
    const setText = (sel, txt) => {
      const el = document.querySelector(sel);
      if (el) el.textContent = txt;
    };

    // Title, rating, reviews
    setText("#trip-title", top.name);
    setText("#rating", (top.rating ?? 0).toFixed(1));
    setText("#reviews", `${top.reviews} review${top.reviews === 1 ? "" : "s"}`);

    // Image (blob <image> inside the SVG)
    const img = document.querySelector("#trip-image");
    const imgUrl = top.mainImageURL
      ? top.mainImageURL.startsWith("http")
        ? top.mainImageURL
        : `${top.mainImageURL.startsWith("/") ? "" : "/"}${top.mainImageURL}`
      : "img/trending.png";
    if (img) img.setAttribute("href", imgUrl);

    // Little description line (since API doesn’t return activities)
    setText(
      "#activities",
      [
        `Category: ${top.category}`,
        `Duration: ${top.duration} min`,
        top.isAvailable ? "Available now" : "Currently unavailable",
      ].join(" • ")
    );

    // Book link -> details page
    const link = document.querySelector("#book-link");
    if (link) link.href = `/pages/trip-details.html?id=${top.id}`;

    // Optional: stars (add id="stars" to that span in your HTML if you want dynamic stars)
    const starsEl = document.querySelector("#stars");
    if (starsEl) {
      const r = Math.max(0, Math.min(5, Number(top.rating) || 0));
      const full = Math.floor(r);
      const empty = 5 - full;
      starsEl.textContent = "★".repeat(full) + "☆".repeat(empty);
    }
  } catch (e) {
    console.error("Failed to load trending trip:", e);
  }
}

function fetchAndRenderCategories() {
  const langCode = localStorage.getItem("lang") || "en";
  const langId = langCode === "deu" ? 1 : 2;

  fetch(`/api/Category/GetAllCategories/${langId}`)
    .then((res) => res.json())
    .then((data) => {
      if (data.succeeded && data.data?.data) {
        const categories = data.data.data;

        // 1️⃣ Render Header Dropdowns (already existing)
        const desktopDropdown = document.getElementById("tripsDropdown");
        const mobileDropdown = document.getElementById("mobileTripsDropdown");

        if (desktopDropdown) {
          desktopDropdown.innerHTML = `
            <li>
              <a href="/pages/trips-list.html" class="block px-4 py-2 font-semibold text-blue-600 hover:bg-blue-50">All Trips</a>
            </li>
            <li><hr class="border-t border-gray-200 my-1" /></li>
          `;
          categories.forEach((cat) => {
            const li = document.createElement("li");
            li.innerHTML = `<a href="/pages/trips-list.html?categoryId=${cat.id}" class="block px-4 py-2 hover:bg-gray-100">${cat.name}</a>`;
            desktopDropdown.appendChild(li);
          });
        }

        if (mobileDropdown) {
          mobileDropdown.innerHTML = "";
          categories.forEach((cat) => {
            const li = document.createElement("li");
            li.innerHTML = `<a href="/pages/trips-list.html?categoryId=${cat.id}" class="hover:text-blue-500">${cat.name}</a>`;
            mobileDropdown.appendChild(li);
          });
        }

        // 2️⃣ Render Category Filter Buttons
        const categoryButtons = document.getElementById("categoryButtons");
        if (categoryButtons) {
          categoryButtons.innerHTML = "";
          categories.forEach((cat) => {
            const btn = document.createElement("button");
            btn.className =
              "bg-gray-100 px-4 py-1 rounded-full text-sm hover:bg-blue-400 hover:text-white transition";
            btn.textContent = cat.name;
            btn.addEventListener("click", () => loadTripsByCategory(cat.id));
            categoryButtons.appendChild(btn);
          });
        }
      } else {
        console.warn("No categories found in API response");
      }
    })
    .catch((err) => {
      console.error("Error loading categories for header & filter:", err);
    });
}

function afterIncludesLoaded() {
  const savedLang = localStorage.getItem("lang") || "en";
  setLanguage(savedLang);

  const select = document.getElementById("languageSelect");
  if (select) {
    select.addEventListener("change", () => {
      setLanguage(select.value);
    });
  }

  fetchAndRenderCategories(); // ✅ call once here
  fetchAndRenderTrendingTrip();

  if (typeof bindPageTransitions === "function") {
    bindPageTransitions();
  }
}

let loadedCount = 0;
function checkAllIncludesLoaded() {
  loadedCount++;
  if (loadedCount === 2) afterIncludesLoaded(); // header + footer
}
