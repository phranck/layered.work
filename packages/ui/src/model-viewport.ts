import { returnFocusQuietly } from "./focus-return.js";

/** Map the full-window layer back to the embedded viewer without per-frame layout. */
function zoomTransform(rect: DOMRect): string {
  return `translate(${rect.left}px, ${rect.top}px) scale(${rect.width / window.innerWidth}, ${rect.height / window.innerHeight})`;
}

function animateZoom(dialog: HTMLDialogElement, from: string, to: string, finish: () => void) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    finish();
    return undefined;
  }
  const styles = getComputedStyle(dialog);
  const duration = styles.getPropertyValue("--duration-slow").trim() || "460ms";
  const animation = dialog.animate([{ transform: from }, { transform: to }], {
    duration: Number.parseFloat(duration) * (duration.endsWith("ms") ? 1 : 1000),
    easing: styles.getPropertyValue("--ease").trim() || "cubic-bezier(0.22, 1, 0.36, 1)",
    fill: "both",
  });
  animation.onfinish = () => {
    finish();
    animation.cancel();
  };
  return animation;
}

/** Upgrade the shared model markup, preserving the same viewer and camera state. */
export function initializeModelViewports(root: ParentNode = document): void {
  for (const model of root.querySelectorAll<HTMLElement>(".content-model")) {
    const stage = model.querySelector<HTMLElement>(".content-model__stage");
    const viewport = model.querySelector<HTMLElement>(".content-model__viewport");
    const dialog = model.querySelector<HTMLDialogElement>(".content-model__dialog");
    const button = model.querySelector<HTMLButtonElement>("[data-model-zoom]");
    if (!stage || !viewport || !dialog || !button) continue;
    const german = model.ownerDocument.documentElement.lang === "de";
    const expandLabel = german ? "3D-Ansicht vergrößern" : "Expand 3D view";
    const closeLabel = german ? "3D-Ansicht schließen (Esc)" : "Close expanded 3D view (Esc)";
    let animation: Animation | undefined;
    let closing = false;
    function setExpanded(expanded: boolean) {
      if (!button) return;
      const label = expanded ? closeLabel : expandLabel;
      button.setAttribute("aria-expanded", String(expanded));
      button.setAttribute("aria-label", label);
      button.title = label;
    }
    button.disabled = false;
    setExpanded(false);
    const close = () => {
      if (!dialog.open || closing) return;
      closing = true;
      const current = getComputedStyle(dialog).transform;
      animation?.cancel();
      animation = animateZoom(dialog, current, zoomTransform(stage.getBoundingClientRect()), () => {
        animation = undefined;
        dialog.close();
      });
    };
    button.addEventListener("click", () => {
      if (dialog.open) {
        close();
      } else {
        const from = zoomTransform(viewport.getBoundingClientRect());
        dialog.append(viewport);
        dialog.showModal();
        setExpanded(true);
        // The dialog takes the focus, not the button inside it. Forcing it onto
        // the button drew a keyboard focus ring the moment the viewer opened,
        // although nobody had navigated to that button. Tab still reaches it,
        // and the ring belongs there when it does.
        dialog.focus({ preventScroll: true });
        animation = animateZoom(dialog, from, "none", () => {
          animation = undefined;
        });
      }
    });
    // Keep the modal/focus trap active until Escape's return animation finishes.
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      close();
    });
    dialog.addEventListener("close", () => {
      animation?.cancel();
      animation = undefined;
      closing = false;
      stage.append(viewport);
      setExpanded(false);
      returnFocusQuietly(button);
    });
  }
}
