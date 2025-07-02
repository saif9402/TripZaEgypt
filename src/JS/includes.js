function includeHTML(id, file, onDone) {
  const currentPath = window.location.pathname;
  const isInPagesFolder = currentPath.includes("/pages/");
  const fullPath = isInPagesFolder ? `../${file}` : file;

  fetch(fullPath)
    .then((res) => res.text())
    .then((html) => {
      const el = document.getElementById(id);
      el.innerHTML = html;

      // Re-initialize Alpine.js
      if (window.Alpine) {
        window.Alpine.initTree(el);
      }

      onDone?.();
    })
    .catch((err) => console.error(`Error loading ${file}:`, err));
}

window.addEventListener("DOMContentLoaded", () => {
  includeHTML(
    "header-placeholder",
    "pages/header.html",
    checkAllIncludesLoaded
  );
  includeHTML(
    "footer-placeholder",
    "pages/footer.html",
    checkAllIncludesLoaded
  );
});

function afterIncludesLoaded() {
  const savedLang = localStorage.getItem("lang") || "en";
  setLanguage(savedLang);

  // Attach event listener AFTER footer is loaded
  const select = document.getElementById("languageSelect");
  if (select) {
    select.addEventListener("change", () => {
      setLanguage(select.value);
    });
  }

  if (typeof bindPageTransitions === "function") {
    bindPageTransitions();
  }
}

let loadedCount = 0;
function checkAllIncludesLoaded() {
  loadedCount++;
  if (loadedCount === 2) afterIncludesLoaded(); // header + footer
}
