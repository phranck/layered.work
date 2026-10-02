import { useEffect, useRef } from "react";
import { startSky } from "./sky.js";

/**
 * The countdown's web of nodes, behind a whole screen.
 *
 * It fills the window from a fixed layer under everything and answers the
 * pointer across the whole window, so whatever stands in front of it needs no
 * background of its own. It is decoration, so it is hidden from assistive
 * technology, and the animation stops when the component goes.
 */
export function SkyBackdrop() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => (canvas.current ? startSky(canvas.current) : undefined), []);
  return (
    <div className="sky" aria-hidden="true">
      <canvas ref={canvas} className="sky__web" />
    </div>
  );
}
