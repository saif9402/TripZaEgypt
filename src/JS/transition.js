// Create and append the transition overlay
const transitionEl = document.createElement("div");
transitionEl.className = "page-transition";
document.body.appendChild(transitionEl);

// Fade-in effect on page load
window.addEventListener("DOMContentLoaded", () => {
  transitionEl.classList.remove("active");
});

// Utility to bind transition to links
function bindPageTransitions() {
  document.querySelectorAll("a[href]").forEach((link) => {
    const href = link.getAttribute("href");
    if (
      href &&
      !href.startsWith("#") &&
      !link.target &&
      !href.startsWith("http")
    ) {
      link.addEventListener("click", function (e) {
        e.preventDefault();
        transitionEl.classList.add("active");
        setTimeout(() => {
          window.location.href = href;
        }, 300);
      });
    }
  });
}
