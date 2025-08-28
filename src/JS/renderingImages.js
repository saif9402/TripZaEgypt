// JS/renderingImages.js
(() => {
  const imagePaths = [
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

  const t = (k, params) =>
    typeof window.t === "function" ? window.t(k, params) : k;

  const slider = document.getElementById("slider");
  const dotsContainer = document.getElementById("dots");
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

  function updateDots() {
    Array.from(dotsContainer.children).forEach((dot, i) => {
      dot.style.background =
        i === currentIndex ? "white" : "rgba(255,255,255,.4)";
      dot.style.transform = i === currentIndex ? "scale(1)" : "scale(.9)";
    });
  }

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

      // One frame to ensure styles apply
      requestAnimationFrame(() => {
        // fade out current
        curBg.style.opacity = "0";
        curFg.style.opacity = "0";
        if (!prefersReduced) {
          curFg.style.transform = "translateY(-4px) scale(0.995)";
        }

        // fade/animate in incoming
        nextBg.style.opacity = "1";
        nextFg.style.opacity = "1";

        if (!prefersReduced) {
          // Nudge one more frame so transform transition always triggers
          requestAnimationFrame(() => {
            nextBg.style.transform = pan.end;
            nextFg.style.transform = "translateY(0) scale(1)";
          });
        }
      });

      active = active === "A" ? "B" : "A";
      updateDots();
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
    intervalId = setInterval(next, 5000); // autoplay interval
  }
  function stopAuto() {
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
  }

  // Build dots
  dotsContainer.innerHTML = "";
  imagePaths.forEach((_, i) => {
    const dot = document.createElement("button");
    dot.setAttribute("aria-label", `Go to slide ${i + 1}`);
    dot.style.width = "10px";
    dot.style.height = "10px";
    dot.style.borderRadius = "9999px";
    dot.style.background = "rgba(255,255,255,.4)";
    dot.style.transition = "transform 200ms ease, background 200ms ease";
    dot.addEventListener("click", () => {
      stopAuto();
      show(i);
      startAuto();
    });
    dotsContainer.appendChild(dot);
  });

  // Controls + hover pause
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

  // Keyboard nav (← →)
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

  // Init
  show(0);
  startAuto();
})();
