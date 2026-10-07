import { useEffect, useRef } from "react";
import { join } from "./shared.js";
import { startSky } from "./sky.js";

/**
 * The layer the web is drawn in, and the canvas inside it.
 *
 * It is decoration, so it is hidden from assistive technology. Rendered in the
 * browser, it starts the web itself and stops it when it goes. Rendered to
 * static markup, as the site renders its pages, no effect runs, and the page's
 * own script starts every canvas inside a `[data-sky]` layer.
 *
 * @param className - The variant's class beside `sky`.
 */
function SkyLayer({ className }: { className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => (canvas.current ? startSky(canvas.current) : undefined), []);
  return (
    <div className={join("sky", className)} aria-hidden="true" data-sky="">
      <canvas ref={canvas} className="sky__web" />
    </div>
  );
}

/**
 * The countdown's web of nodes, behind a whole screen.
 *
 * It fills the window from a fixed layer under everything and answers the
 * pointer across the whole window, so whatever stands in front of it needs no
 * background of its own.
 */
export function SkyBackdrop() {
  return <SkyLayer />;
}

/**
 * The countdown's web of nodes, behind one band of a page.
 *
 * Placed as the first child of a band that carries `section--sky`. It spans the
 * window's width as the band's fill does, lies under the band's content, and
 * answers the pointer wherever it passes over the band.
 */
export function SkyBand() {
  return <SkyLayer className="sky--band" />;
}
