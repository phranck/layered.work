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

  // What the cards last read. The loop below runs on every frame whilst the
  // figures change once a second, so this is what keeps the other fifty-nine
  // frames down to a single comparison.
  var shown = -1;

  function tick() {
    var left = target - Date.now();

    if (left <= 0) {
      root.hidden = true;
      if (opened) opened.hidden = false;
      return;
    }

    var seconds = Math.floor(left / 1000);

    if (seconds !== shown) {
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

    // The clock is read on every frame rather than once a second, because a
    // chain of timers is not a clock. Measured on this page, about one wake-up
    // in twelve arrived a full second late whilst the frame loop itself never
    // stalled, which moved the count on by two and read as a skipped second.
    // Asking the clock what time it is costs a subtraction and a comparison per
    // frame and cannot skip.
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
})();
`;
