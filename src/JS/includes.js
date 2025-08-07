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

function fetchAndRenderTrending() {
  const langCode = localStorage.getItem("lang") || "en";
  const langId = langCode === "deu" ? 1 : 2;

  const url = `/api/Trip/GetAllTrips?IsTopRated=true&languageId=${langId}&pageNumber=1&pageSize=10`;

  const section = document
    .querySelector("section [data-i18n='trend.name']")
    ?.closest("section");

  // Helper: paint one trip into the section
  function renderTrendingTrip(trip) {
    const imgEl = document.getElementById("trip-image");
    const titleEl = document.getElementById("trip-title");
    const ratingEl = document.getElementById("rating");
    const reviewsEl = document.getElementById("reviews");
    const locationEl = document.getElementById("location");
    const descEl = document.getElementById("description");
    const bookLinkEl = document.getElementById("book-link");

    const image = trip.mainImageURL || "img/trip-fallback.jpg";
    if (imgEl) imgEl.setAttribute("href", image);
    if (titleEl) titleEl.textContent = trip.name ?? "Top Rated Trip";
    if (ratingEl) ratingEl.textContent = (trip.rating ?? 0).toFixed(1);
    if (reviewsEl) reviewsEl.textContent = `${trip.reviews ?? 0} reviews`;
    if (locationEl) locationEl.textContent = trip.category ?? "—";
    if (descEl) {
      // List API doesn’t return a description; keep a short generic line
      descEl.textContent = "Hand‑picked, highly rated by travelers like you.";
    }
    if (bookLinkEl) bookLinkEl.href = `/pages/trip-details.html?id=${trip.id}`;
  }

  // Helper: optional preloader so image swaps feel snappier
  function preloadImages(list) {
    list.forEach((t) => {
      const src = t.mainImageURL;
      if (src) {
        const img = new Image();
        img.src = src;
      }
    });
  }

  fetch(url)
    .then((res) => res.json())
    .then((json) => {
      const items = json?.data?.data || [];
      if (!items.length) {
        if (section) section.style.display = "none";
        return;
      }
      if (section) section.style.display = "";

      preloadImages(items);

      // initial render
      let i = 0;
      renderTrendingTrip(items[i]);

      // auto-rotate every 2s
      let timer = setInterval(() => {
        i = (i + 1) % items.length;
        renderTrendingTrip(items[i]);
      }, 2000);

      // nice touch: pause on hover (optional)
      if (section) {
        section.addEventListener("mouseenter", () => clearInterval(timer));
        section.addEventListener("mouseleave", () => {
          clearInterval(timer);
          timer = setInterval(() => {
            i = (i + 1) % items.length;
            renderTrendingTrip(items[i]);
          }, 2000);
        });
      }
    })
    .catch((err) => {
      console.error("Failed to load trending trips:", err);
      if (section) section.style.display = "none";
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
  fetchAndRenderTrending();

  if (typeof bindPageTransitions === "function") {
    bindPageTransitions();
  }
}

let loadedCount = 0;
function checkAllIncludesLoaded() {
  loadedCount++;
  if (loadedCount === 2) afterIncludesLoaded(); // header + footer
}
