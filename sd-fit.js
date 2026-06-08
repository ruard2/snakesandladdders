/**
 * sd-fit.js — proportional frame sizing utility
 *
 * Sizes any element to fill the viewport while keeping a fixed aspect ratio,
 * exactly like the world-map pattern. Use for any portrait/landscape image frame.
 *
 * Usage — one-liner anywhere:
 *   SDFit.auto('.kies-frame', 941, 1672);   // width=941, height=1672 (portrait)
 *   SDFit.auto('#map',        941, 1672);   // same ratio, different selector
 *   SDFit.auto('#map',        16,  9);      // landscape 16:9
 *
 * SDFit.auto()  →  fits now AND re-fits on every window resize
 * SDFit.fit()   →  fits once, no resize listener
 *
 * The selector/element can be a CSS selector string, an HTMLElement, or null/missing
 * (nothing happens if the element isn't in the DOM yet — safe to call early).
 */
(function () {
  'use strict';

  /**
   * Fit a single element to the viewport at a given pixel ratio.
   * @param {string|HTMLElement} target  CSS selector or DOM element
   * @param {number} imgW               Original image width  (e.g. 941)
   * @param {number} imgH               Original image height (e.g. 1672)
   */
  function fit(target, imgW, imgH) {
    const el = typeof target === 'string'
      ? document.querySelector(target)
      : target;
    if (!el) return;

    const ratio  = imgW / imgH;
    const vw     = window.innerWidth;
    const vh     = window.innerHeight;
    let w, h;

    if (vw / vh > ratio) {          // viewport is wider than image ratio → clamp by height
      h = vh; w = h * ratio;
    } else {                        // viewport is taller → clamp by width
      w = vw; h = w / ratio;
    }

    el.style.width  = w + 'px';
    el.style.height = h + 'px';
  }

  /**
   * Like fit(), but also registers a resize listener so the frame stays correct.
   * Calling auto() multiple times on the same target is safe — each call just
   * overwrites the previous size and the resize handler keeps working.
   */
  function auto(target, imgW, imgH) {
    fit(target, imgW, imgH);
    window.addEventListener('resize', function () { fit(target, imgW, imgH); });
  }

  window.SDFit = { fit: fit, auto: auto };
})();
