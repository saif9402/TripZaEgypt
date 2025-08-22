(function () {
  const p = location.pathname.toLowerCase();
  const isAuthPage =
    /sign-in\.html|sign-up\.html|forgetpassword|oauth-callback/i.test(p);
  if (isAuthPage) return;

  // If the flag is set, force the user to profile page
  if (localStorage.getItem("mustCompleteProfile") === "1") {
    if (!/profile\.html$/i.test(p)) {
      // remember where they were going
      sessionStorage.setItem("afterProfile", location.href);
      // adjust the path if your pages folder differs
      location.replace("pages/profile.html");
    }
  }
})();
