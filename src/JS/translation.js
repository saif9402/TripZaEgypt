const translations = {
  en: {
    "web.title": "Tour Guide",
    "hero.title": "We Find The Best Tours For You",
    "hero.subtitle":
      "Discover unforgettable adventures in Hurghada — from desert safaris to Red Sea cruises, all at unbeatable prices.",
    "hero.video": "Watch Video",
    "nav.title": "Tour Guide",
    "nav.home": "Home",
    "nav.about": "About Us",
    "nav.trips": "Our Trips",
    "nav.signin": "Sign In",
    "menu.name": "Menu",
    "menu.lang": "Language",
    "search.label": "Search",
    "search.trips": "Trips",
    "search.trip.placeholder": "Search A Trip",
    "search.guests": "Guests",
    "search.guests.placeholder": "Guests",
    "search.date": "Date",

    "trips.sectionTitle": "Explore Trips By Category",
    "trips.sectionDesc":
      "Browse our top-rated experiences in Hurghada — from thrilling desert safaris to relaxing Red Sea escapes.",
    "trend.name": "Trending Now",
    "trend.button": "Book Now",
    "trend.sectionTitle": "Explore Some of Our Trending Trips",
    "trend.sectionDesc":
      "Browse our Best Seller Trips in Hurghada — from thrilling desert safaris to relaxing Red Sea escapes",
    "trend.btn": "Explore All the Trips",
    "gallery.title": "From The Gallery",
    "gallery.sybtitle":
      "Moments captured. Memories made. Discover Hurghada through our lens.",
    "footer.lang": "Language",
    "footer.company": "Company",
    "footer.about": "About Us",
    "footer.blog": "Blog",
    "footer.careers": "Careers",
    "footer.help": "Help",
    "footer.contactUs": "Contact Us",
    "footer,faqs": "FAQs",
    "footer.terms": "Terms",
    "footer.follow": "Follow Us",

    "signin.name": "Sign in",
    "signin.subtitle": "Access exclusive tour experiences with your account",
    "signin.email": "Email",
    "signin.pass": "Password",
    "signin.button": "Sign In",
    "signin.create": "or create account",

    "signup.title": "Create Account",
    "signup.subtitle": "Join the adventure and explore new destinations",
    "signup.name": "Full Name",
    "signup.email": "Email",
    "signup.pass": "Password",
    "signup.confirmPass": "Confirm Password",
    "signup.button": "Create Account",
    "signup.haveAccount": "Already have an account?",
    "signup.signin": "Sign in",
  },
  deu: {
    "web.title": "Reiseführer",
    "hero.title": "Wir finden die besten Touren für Sie",
    "hero.subtitle":
      "Entdecken Sie unvergessliche Abenteuer in Hurghada – von Wüstensafaris bis zu Kreuzfahrten auf dem Roten Meer, alles zu unschlagbaren Preisen.",
    "hero.video": "Video ansehen",
    "nav.title": "Reiseführer",
    "nav.home": "Startseite",
    "nav.about": "Über uns",
    "nav.trips": "Unsere Reisen",
    "nav.signin": "Anmelden",
    "menu.name": "Menü",
    "menu.lang": "Sprache",
    "search.label": "Suchen",
    "search.trips": "Reisen",
    "search.trip.placeholder": "Reise suchen",
    "search.guests": "Gäste",
    "search.guests.placeholder": "Gäste",
    "search.date": "Datum",
    "trips.sectionTitle": "Beliebte Reisen entdecken",
    "trips.sectionDesc":
      "Durchstöbern Sie unsere Top-Erlebnisse in Hurghada – von aufregenden Wüstensafaris bis zu entspannenden Ausflügen am Roten Meer.",
    "trend.name": "Jetzt im Trend",
    "trend.button": "Jetzt buchen",
    "gallery.title": "Aus der Galerie",
    "gallery.subtitle":
      "Eingefangene Momente. Geschaffene Erinnerungen. Entdecken Sie Hurghada durch unsere Linse.",
    "footer.lang": "Sprache",
    "footer.company": "Unternehmen",
    "footer.about": "Über uns",
    "footer.blog": "Blog",
    "footer.careers": "Karriere",
    "footer.help": "Hilfe",
    "footer.contactUs": "Kontakt",
    "footer,faqs": "FAQs",
    "footer.terms": "Bedingungen",
    "footer.follow": "Folgen Sie uns",
    "signin.name": "Anmelden",
    "signin.subtitle":
      "Greifen Sie mit Ihrem Konto auf exklusive Tourerlebnisse zu",
    "signin.email": "E-Mail",
    "signin.pass": "Passwort",
    "signin.button": "Anmelden",
    "signin.create": "oder Konto erstellen",

    "signup.title": "Konto erstellen",
    "signup.subtitle":
      "Schließen Sie sich dem Abenteuer an und entdecken Sie neue Reiseziele",
    "signup.name": "Vollständiger Name",
    "signup.email": "E-Mail",
    "signup.pass": "Passwort",
    "signup.confirmPass": "Passwort bestätigen",
    "signup.button": "Konto erstellen",
    "signup.haveAccount": "Haben Sie bereits ein Konto?",
    "signup.signin": "Anmelden",
  },
};

function setLanguage(lang) {
  // Set texts
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (translations[lang] && translations[lang][key]) {
      el.textContent = translations[lang][key];
    }
  });

  // Set placeholders
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (translations[lang]?.[key]) {
      el.setAttribute("placeholder", translations[lang][key]);
    }
  });

  // Update language display buttons
  const mobileLangLabel = document.getElementById("mobileLangLabel");
  if (mobileLangLabel) mobileLangLabel.innerText = lang.toUpperCase();

  const currentLang = document.getElementById("currentLang");
  if (currentLang) currentLang.innerText = lang.toUpperCase();

  const langBtn = document.getElementById("currentLang");
  if (langBtn) langBtn.textContent = lang.toUpperCase();

  // Set selected option in dropdown
  const select = document.getElementById("languageSelect");
  if (select) select.value = lang;

  // Save lang + refresh categories
  localStorage.setItem("lang", lang);
  window.refreshLangData?.(); // ← triggers trending + categories reload

  // ✅ Only call this ONCE, at the end:
  fetchAndRenderCategories(); // 👇 new function (moved from includes.js)
}

// Initial load
document.addEventListener("DOMContentLoaded", () => {
  const savedLang = localStorage.getItem("lang") || "en";
  setLanguage(savedLang);

  const select = document.getElementById("languageSelect");
  if (select) {
    select.addEventListener("change", () => {
      setLanguage(select.value);
    });
  }
});
