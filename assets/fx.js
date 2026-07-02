/* Viva La Vie — global cursor glow. A soft aqua light that follows the pointer
   across every section (the hero effect, site-wide). Desktop pointers only;
   respects reduced-motion. Framework-independent. */
(function () {
  var mqHover = window.matchMedia("(hover: hover) and (pointer: fine)");
  var mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  function init() {
    var el = document.getElementById("vlv-cursor-glow");
    if (!el || !mqHover.matches || mqReduce.matches) return;
    var tx = window.innerWidth / 2, ty = window.innerHeight * 0.3;
    var cx = tx, cy = ty, raf = null, shown = false;
    function loop() {
      cx += (tx - cx) * 0.14;
      cy += (ty - cy) * 0.14;
      el.style.transform = "translate3d(" + (cx - 300).toFixed(1) + "px," + (cy - 300).toFixed(1) + "px,0)";
      if (Math.abs(tx - cx) > 0.4 || Math.abs(ty - cy) > 0.4) raf = requestAnimationFrame(loop);
      else raf = null;
    }
    window.addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch") return;
      tx = e.clientX; ty = e.clientY;
      if (!shown) { shown = true; el.style.opacity = ""; }
      if (!raf) raf = requestAnimationFrame(loop);
    }, { passive: true });
  }
  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
})();
