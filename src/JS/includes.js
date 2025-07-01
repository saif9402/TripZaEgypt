function includeHTML(id, file, onDone) {
  fetch(file)
    .then((res) => res.text())
    .then((html) => {
      document.getElementById(id).innerHTML = html;
      onDone?.();
    })
    .catch((err) => console.error(`Error loading ${file}:`, err));
}

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

window.addEventListener("DOMContentLoaded", () => {
  includeHTML("header-placeholder", "header.html", checkAllIncludesLoaded);
  includeHTML("footer-placeholder", "footer.html", checkAllIncludesLoaded);
});
