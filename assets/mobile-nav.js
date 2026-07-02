/* Viva La Vie — mobile drop-down menu toggle. Framework-independent:
   operates on plain DOM injected as siblings of the app root. */
(function () {
  function init() {
    var btn = document.querySelector(".vlv-mnav-btn");
    var menu = document.getElementById("vlv-mnav");
    if (!btn || !menu) return;
    var root = document.documentElement;

    function open() {
      root.classList.add("vlv-menu-open");
      btn.setAttribute("aria-expanded", "true");
      btn.setAttribute("aria-label", "Close menu");
      menu.setAttribute("aria-hidden", "false");
    }
    function close() {
      root.classList.remove("vlv-menu-open");
      btn.setAttribute("aria-expanded", "false");
      btn.setAttribute("aria-label", "Open menu");
      menu.setAttribute("aria-hidden", "true");
    }
    function toggle() { root.classList.contains("vlv-menu-open") ? close() : open(); }

    btn.addEventListener("click", toggle);
    // close when a link is tapped or the backdrop (menu itself) is tapped
    menu.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("a");
      if (a || e.target === menu) close();
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    window.addEventListener("resize", function () { if (window.innerWidth > 860) close(); });
  }
  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
})();
