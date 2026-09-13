/**
 * The flip countdown.
 *
 * Each digit is a card split across the middle. When it changes, the old top
 * half folds down and the new bottom half rises to meet it, which is the split
 * flap board the shape comes from.
 *
 * Only `transform` and `opacity` move, so the whole animation stays on the
 * compositor, and only a digit that actually changed animates. At one second
 * that is one or two of the eight.
 */
export const COUNTDOWN_SCRIPT = `
(function () {
  var root = document.getElementById("clock");
  var opened = document.getElementById("open");
  if (!root) return;

  var target = new Date(root.getAttribute("data-target")).getTime();
  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var digits = [];

  // Every digit card, in the order the markup puts them, so a tick writes to
  // them by index and looks nothing up.
  var cards = root.querySelectorAll("[data-digit]");
  for (var i = 0; i < cards.length; i += 1) {
    digits.push({
      element: cards[i],
      front: cards[i].querySelector(".front .glyph"),
      back: cards[i].querySelector(".back .glyph"),
      foldTop: cards[i].querySelector(".fold-top .glyph"),
      foldBottom: cards[i].querySelector(".fold-bottom .glyph"),
      value: null,
      timer: 0,
    });
  }

  /**
   * Writes a digit, folding it when it changes.
   *
   * The four faces carry, in order: the top half of what is arriving, the
   * bottom half of what is leaving, the folding top half of what is leaving,
   * and the folding bottom half of what is arriving. That is what makes the
   * card read as one piece turning rather than two halves swapping.
   */
  function write(digit, next) {
    if (digit.value === next) return;
    var previous = digit.value;
    digit.value = next;

    if (previous === null || still) {
      digit.front.textContent = next;
      digit.back.textContent = next;
      digit.foldTop.textContent = next;
      digit.foldBottom.textContent = next;
      return;
    }

    digit.front.textContent = next;
    digit.back.textContent = previous;
    digit.foldTop.textContent = previous;
    digit.foldBottom.textContent = next;

    digit.element.classList.remove("turning");
    // Reading offsetWidth forces the class removal to take effect before it is
    // added again, which is what lets the same digit flip twice in a row.
    void digit.element.offsetWidth;
    digit.element.classList.add("turning");

    clearTimeout(digit.timer);
    digit.timer = setTimeout(function () {
      digit.element.classList.remove("turning");
      // Both of these still carry what was leaving. The folding top sits over
      // the static top at rest, so leaving it alone showed the old figure for
      // good, which is what made the clock read wrongly between ticks.
      digit.back.textContent = next;
      digit.foldTop.textContent = next;
      // 250ms for the fall and 290ms for the landing, plus a little, so the
      // faces are only reset once the animation has genuinely finished.
    }, 560);
  }

  /*
   * Puts the groove on whole pixels of the display.
   *
   * A card's height follows the window, so the middle of it lands wherever that
   * happens to fall, and a line drawn across a fraction of a pixel is spread
   * over two rows at half strength each. That reads as a grey smear rather than
   * as a gap between two flaps, which is the one thing the line is there to be.
   *
   * Two things are snapped. The thickness, because a display at one and a half
   * pixels to the CSS pixel turns a hairline into one and a half rows and no
   * amount of moving it helps. And the position, by the fraction of a pixel
   * between where the line falls and the nearest pixel edge, which is at most
   * half a pixel of movement and is not visible.
   *
   * Both are written as custom properties the stylesheet reads, so a reader
   * without a script gets the authored values rather than nothing.
   */
  function sharpenGrooves() {
    var ratio = window.devicePixelRatio || 1;

    for (var i = 0; i < digits.length; i += 1) {
      var element = digits[i].element;
      var authored = parseFloat(getComputedStyle(element).getPropertyValue("--groove"));
      if (!authored) continue;

      // At least one pixel of the display, and a whole number of them.
      var thickness = Math.max(1, Math.round(authored * ratio)) / ratio;

      // Where the top edge of the line falls now, counted in the display's own
      // pixels from the top of the window.
      var box = element.getBoundingClientRect();
      var edge = (box.top + box.height / 2 - thickness / 2) * ratio;

      element.style.setProperty("--groove-drawn", thickness + "px");
      element.style.setProperty("--groove-nudge", (Math.round(edge) - edge) / ratio + "px");
    }
  }

  /*
   * Run again whenever what was measured could have changed.
   *
   * The window resizing changes the card's height, the typefaces arriving
   * changes it again, and moving the window to a screen of another density
   * changes the grid the line is being snapped to. A media query is what
   * reports that last one, and it has to be asked again each time because it
   * is written for the density that held when it was made.
   */
  function watchDensity() {
    window
      .matchMedia("(resolution: " + (window.devicePixelRatio || 1) + "dppx)")
      .addEventListener("change", function () {
        sharpenGrooves();
        watchDensity();
      }, { once: true });
  }

  sharpenGrooves();
  watchDensity();
  window.addEventListener("resize", sharpenGrooves);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(sharpenGrooves);

  // What the cards last read. Both drivers below ask for the time far more
  // often than the figures change, so this is what keeps all but one of those
  // readings down to a single comparison.
  var shown = -1;
  var ticker = 0;

  /** Puts the time on the cards, and puts the notice up when it runs out. */
  function render() {
    var left = target - Date.now();

    if (left <= 0) {
      root.hidden = true;
      if (opened) opened.hidden = false;
      clearInterval(ticker);
      return;
    }

    var seconds = Math.floor(left / 1000);
    if (seconds === shown) return;
    shown = seconds;

    var parts = [
      Math.floor(seconds / 86400),
      Math.floor(seconds / 3600) % 24,
      Math.floor(seconds / 60) % 60,
      seconds % 60,
    ];

    for (var i = 0; i < parts.length; i += 1) {
      var text = String(parts[i]);
      while (text.length < 2) text = "0" + text;
      // Two cards per unit, tens then units.
      write(digits[i * 2], text.charAt(text.length - 2));
      write(digits[i * 2 + 1], text.charAt(text.length - 1));
    }
  }

  function frame() {
    render();
    if (!root.hidden) requestAnimationFrame(frame);
  }

  /*
   * Two drivers, because neither is a clock on its own.
   *
   * The frame loop is exact whilst the window is in front, and a browser
   * throttles it hard when the window is behind another one. Measured on this
   * page with the tab still on screen but not focused: frames arrived in bursts
   * of two or three, seventeen milliseconds apart, with two seconds of nothing
   * between the bursts. A clock driven by that alone steps two at a time.
   *
   * Timers keep their pace in that state, and they are the ones that are late:
   * about one wake-up in twelve arrived a full second behind, which is what
   * made an earlier version of this skip a second. Reading the clock four times
   * a second rather than once means being late by a second no longer costs a
   * figure, because the reading names the time rather than counting on having
   * been woken at the right moment.
   *
   * Whichever arrives first writes, and the other finds nothing to do. Coming
   * back to a tab that was hidden altogether is the third case, and that is
   * what the last line catches.
   */
  ticker = setInterval(render, 250);
  requestAnimationFrame(frame);
  document.addEventListener("visibilitychange", render);
})();
`;
