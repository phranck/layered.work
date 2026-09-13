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
