// JS/renderingImages.js
(() => {
  const API_URL = "/api/SliderImages/GetSliderImages";

  // Fallbacks if API returns nothing or fails
  const FALLBACK_IMAGES = [
    "img/Home.png",
    "img/Home2.jpg",
    "img/Home3.jpg",
    "img/Home4.jpg",
    "img/Home5.jpg",
    "img/Home6.jpg",
    "img/Home7.jpg",
    "img/Home8.jpg",
    "img/Home9.jpg",
    "img/Home10.jpg",
    "img/Home11.jpg",
    "img/Home12.jpg",
    "img/Home13.jpg",
  ];

  // Will be filled from API (or fallback)
  const imagePaths = [];

  const t = (k, params) =>
    typeof window.t === "function" ? window.t(k, params) : k;

  const slider = document.getElementById("slider");
  const nextBtn = document.getElementById("nextBtn");
  const prevBtn = document.getElementById("prevBtn");
  if (!slider) return;

  const prefersReduced = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  // Build layers (no Tailwind classes, so purge can't remove them)
  slider.style.position = "relative";
  slider.style.overflow = "hidden";
  slider.innerHTML = `
    <div style="position:absolute;inset:0;pointer-events:none;z-index:0;">
      <img id="bgA" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:blur(26px);opacity:0;" />
      <img id="bgB" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:blur(26px);opacity:0;" />
      <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.15),transparent 60%,rgba(0,0,0,.15));"></div>
    </div>
    <img id="fgA" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:0;z-index:10;" />
    <img id="fgB" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:0;z-index:10;" />
  `;

  const bgA = slider.querySelector("#bgA");
  const bgB = slider.querySelector("#bgB");
  const fgA = slider.querySelector("#fgA");
  const fgB = slider.querySelector("#fgB");

  // Inline transitions (can’t be purged)
  const setBgTransition = (el) => {
    el.style.transition = prefersReduced
      ? "opacity 0ms linear"
      : "opacity 600ms ease, transform 9000ms ease";
    el.style.willChange = "opacity, transform, filter";
  };
  const setFgTransition = (el) => {
    el.style.transition = prefersReduced
      ? "opacity 0ms linear"
      : "opacity 600ms ease, transform 600ms ease";
    el.style.willChange = "opacity, transform";
  };
  [bgA, bgB].forEach(setBgTransition);
  [bgA, bgB].forEach((el) => {
    el.style.filter = "blur(26px) brightness(1.30) saturate(1.15)";
  });
  [fgA, fgB].forEach(setFgTransition);

  // Pan/zoom directions alternate for subtle variety
  const pans = [
    {
      start: "scale(1.12) translateX(-2%) translateY(0)",
      end: "scale(1.2) translateX(2%) translateY(0)",
    },
    {
      start: "scale(1.12) translateX(2%) translateY(0)",
      end: "scale(1.2) translateX(-2%) translateY(0)",
    },
    {
      start: "scale(1.12) translateX(0) translateY(-2%)",
      end: "scale(1.2) translateX(0) translateY(2%)",
    },
    {
      start: "scale(1.12) translateX(0) translateY(2%)",
      end: "scale(1.2) translateX(0) translateY(-2%)",
    },
  ];

  let active = "A"; // which pair is currently visible
  let currentIndex = 0;
  let intervalId = null;

  function show(index) {
    currentIndex = (index + imagePaths.length) % imagePaths.length;
    const src = imagePaths[currentIndex];
    const pan = pans[currentIndex % pans.length];

    const curBg = active === "A" ? bgA : bgB;
    const curFg = active === "A" ? fgA : fgB;
    const nextBg = active === "A" ? bgB : bgA;
    const nextFg = active === "A" ? fgB : fgA;

    // Prepare incoming
    nextBg.style.opacity = "0";
    nextFg.style.opacity = "0";
    if (!prefersReduced) {
      nextBg.style.transform = pan.start;
      nextFg.style.transform = "translateY(10px) scale(0.985)";
    }

    const pre = new Image();
    pre.onload = () => {
      nextBg.src = src;
      nextFg.src = src;
      nextFg.alt = t("gallery.imageAlt", { n: currentIndex + 1 });

      requestAnimationFrame(() => {
        curBg.style.opacity = "0";
        curFg.style.opacity = "0";
        if (!prefersReduced)
          curFg.style.transform = "translateY(-4px) scale(0.995)";

        nextBg.style.opacity = "1";
        nextFg.style.opacity = "1";

        if (!prefersReduced) {
          requestAnimationFrame(() => {
            nextBg.style.transform = pan.end;
            nextFg.style.transform = "translateY(0) scale(1)";
          });
        }
      });

      active = active === "A" ? "B" : "A";
    };
    pre.src = src;
  }

  function next() {
    show(currentIndex + 1);
  }
  function prev() {
    show(currentIndex - 1);
  }

  function startAuto() {
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(next, 5000);
  }
  function stopAuto() {
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
  }

  // Helpers
  const toAbsoluteURL = (u) => {
    try {
      return new URL(u, window.location.origin).href;
    } catch {
      return u;
    }
  };

  async function loadImageURLsFromAPI() {
    try {
      const res = await fetch(API_URL, {
        method: "GET",
        headers: { Accept: "application/json" },
        // credentials: "include", // uncomment if your API needs cookies
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      if (!json?.succeeded) throw new Error(json?.message || "Request failed");

      const urls = (Array.isArray(json.data) ? json.data : [])
        .map((item) => (item?.imageURL ?? item?.imageUrl ?? "").trim())
        .filter(Boolean)
        .map(toAbsoluteURL);

      if (!urls.length) throw new Error("List of images is empty");

      imagePaths.push(...urls);
    } catch (err) {
      console.error("Slider API error, using fallback images:", err);
      imagePaths.push(...FALLBACK_IMAGES);
    }
  }

  // Controls + keyboard
  nextBtn?.addEventListener("click", () => {
    stopAuto();
    next();
    startAuto();
  });
  prevBtn?.addEventListener("click", () => {
    stopAuto();
    prev();
    startAuto();
  });

  slider.tabIndex = 0;
  slider.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") {
      stopAuto();
      next();
      startAuto();
    }
    if (e.key === "ArrowLeft") {
      stopAuto();
      prev();
      startAuto();
    }
  });

  // Init (fetch  -> first slide -> autoplay)
  (async () => {
    await loadImageURLsFromAPI();
    if (!imagePaths.length) return; // nothing to show
    show(0);
    startAuto();
  })();
})();
