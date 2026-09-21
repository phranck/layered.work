/**
 * Hands the focus back to whatever opened an overlay, without drawing a ring.
 *
 * Closing a dialog has to put the focus somewhere, and the only sensible place
 * is the control that opened it, so the next Tab carries on from there. The
 * browser, though, has just seen a key press, and treats any focus that follows
 * as keyboard navigation: `:focus-visible` matches and the ring appears on a
 * control the reader never navigated to.
 *
 * The attribute this sets suppresses the ring for exactly that moment.
 * `focus.css` carries the rule. It is removed again as soon as the reader does
 * anything, so the very next Tab or key press shows the ring as it should.
 *
 * @param element - The control the focus returns to. Nothing happens without one.
 */
export function returnFocusQuietly(element: HTMLElement | null | undefined): void {
  if (!element) return;
  element.setAttribute("data-focus-quiet", "");
  element.focus({ preventScroll: true });
  const release = () => {
    element.removeAttribute("data-focus-quiet");
    element.removeEventListener("blur", release);
    element.removeEventListener("keydown", release);
    element.removeEventListener("pointerdown", release);
  };
  element.addEventListener("blur", release);
  element.addEventListener("keydown", release);
  element.addEventListener("pointerdown", release);
}
