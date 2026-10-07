/**
 * The web of nodes behind the countdown page, for any surface that wants it.
 *
 * A cloud of nodes in three dimensions, joined by hair-thin lines to whichever
 * neighbours are near them in space. The whole cloud turns very slowly, each
 * node drifts on its own long cycle, and the pointer pulls the nearest ones
 * towards it before they wander back.
 *
 * **There is a second copy of this, on purpose, until the launch.** The
 * countdown in `apps/website/src/countdown/scene.ts` is served inline as one
 * string and shares its frame loop with the card that tilts under the pointer,
 * and that directory is deleted the day after the site opens. Until then the
 * two describe the same web with the same constants: change one and change the
 * other. `apps/website/tools/og.html` draws a still frame of it as well.
 *
 * Three rules keep it cheap: nothing on the frame path allocates, lines are
 * drawn in a handful of brightness bands rather than one stroke each, and a
 * reader who has asked for less motion gets one still frame.
 */

/** How far past the window the cloud reaches, so turning never swings an empty edge into view. */
const SPREAD = 1.22;
/** Half the depth of the box, in the same units as x and y. */
const DEPTH = 620;
/** Perspective: larger is a flatter, calmer projection. */
const FOCAL = 1500;
/** How near two nodes must be, in space, to be joined. */
const LINK = 330;
/** How near the pointer reaches, in screen pixels. */
const MAGNET = 240;
/** How hard the pointer pulls. */
const PULL = 1.35;
/** How eagerly a node returns home, which is slowly. */
const SPRING = 0.0075;
/** What makes the return a wander rather than a snap. */
const DAMPING = 0.93;
/** How many brightness steps the lines are drawn in. */
const BANDS = 7;
/** The web is slow by design, so it is drawn twenty times a second. */
const INTERVAL_MS = 1000 / 20;
/** The brightest a line is drawn, nearest and closest together. */
const LINE_ALPHA_MAX = 0.35;
/** The colour of the lines and of the nodes, as RGB without alpha. */
const LINE_RGB = "150, 185, 235";
const NODE_RGB = "186, 212, 246";
/** One frame at sixty a second, which the physics counts its steps in. */
const FRAME_MS = 16.667;
/** How long a resize has to settle before the cloud is rebuilt. */
const RESIZE_SETTLE_MS = 150;
/** A full turn, for drawing a node as a circle. */
const FULL_TURN = Math.PI * 2;

/** One node: where it lives, how it wanders, and how far the pointer has pulled it. */
interface SkyNode {
  homeX: number;
  homeY: number;
  homeZ: number;
  phaseX: number;
  phaseY: number;
  phaseZ: number;
  speedX: number;
  speedY: number;
  speedZ: number;
  reachX: number;
  reachY: number;
  reachZ: number;
  offsetX: number;
  offsetY: number;
  velocityX: number;
  velocityY: number;
}

/** Holds a value to 0 to 1, which a turned box can push a node's depth past. */
function unit(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Draws the web on a canvas and keeps it moving until stopped.
 *
 * The canvas fills the element that holds it: a fixed layer over the window
 * behind a whole screen, or one band of a page. Under
 * `prefers-reduced-motion: reduce` one frame is drawn and nothing moves; in a
 * hidden tab, or while the canvas is scrolled out of view, nothing is drawn at
 * all.
 *
 * @param canvas - The canvas to draw on.
 * @returns A function that stops the animation and removes every listener.
 */
export function startSky(canvas: HTMLCanvasElement): () => void {
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return () => {};
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const nodes: SkyNode[] = [];
  let width = 0;
  let height = 0;

  // Reused every frame so the loop allocates nothing.
  let projectedX = new Float32Array(0);
  let projectedY = new Float32Array(0);
  let projectedZ = new Float32Array(0);
  let projectedScale = new Float32Array(0);
  const bandX1: Float32Array[] = [];
  const bandY1: Float32Array[] = [];
  const bandX2: Float32Array[] = [];
  const bandY2: Float32Array[] = [];
  const bandCount = new Array<number>(BANDS).fill(0);

  function build() {
    // Enough to read as a web, few enough that the pair search stays cheap.
    const count = Math.max(70, Math.min(260, Math.round((width * height) / 7000)));
    nodes.length = 0;
    for (let index = 0; index < count; index += 1) {
      nodes.push({
        homeX: (Math.random() - 0.5) * width * SPREAD,
        homeY: (Math.random() - 0.5) * height * SPREAD,
        homeZ: (Math.random() - 0.5) * 2 * DEPTH,
        phaseX: Math.random() * FULL_TURN,
        phaseY: Math.random() * FULL_TURN,
        phaseZ: Math.random() * FULL_TURN,
        speedX: 0.00007 + Math.random() * 0.00013,
        speedY: 0.00005 + Math.random() * 0.00011,
        speedZ: 0.00004 + Math.random() * 0.00009,
        reachX: 30 + Math.random() * 70,
        reachY: 30 + Math.random() * 70,
        reachZ: 40 + Math.random() * 90,
        offsetX: 0,
        offsetY: 0,
        velocityX: 0,
        velocityY: 0,
      });
    }
    projectedX = new Float32Array(count);
    projectedY = new Float32Array(count);
    projectedZ = new Float32Array(count);
    projectedScale = new Float32Array(count);

    // Room for every pair that could fall in one band, allocated once.
    const capacity = Math.max(256, count * 12);
    for (let band = 0; band < BANDS; band += 1) {
      bandX1[band] = new Float32Array(capacity);
      bandY1[band] = new Float32Array(capacity);
      bandX2[band] = new Float32Array(capacity);
      bandY2[band] = new Float32Array(capacity);
    }
  }

  // What the canvas fills. A fixed layer makes it the window, a band makes it the band.
  const host = canvas.parentElement ?? canvas;

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = host.clientWidth;
    height = host.clientHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context?.setTransform(ratio, 0, 0, ratio, 0, 0);
    build();
  }

  // --- The pointer -----------------------------------------------------------
  // Absent until it moves, so a page opened on a phone never has one.

  let pointerX = 0;
  let pointerY = 0;
  let pointing = false;
  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    pointerX = event.clientX;
    pointerY = event.clientY;
    pointing = true;
  };
  const onPointerLeave = () => {
    pointing = false;
  };

  // --- The frame -------------------------------------------------------------

  let last = 0;
  let due = 0;
  let running = 0;

  function frame(now: number) {
    if (!still) running = requestAnimationFrame(frame);
    if (now < due) return;
    due = now + INTERVAL_MS;
    if (!context) return;

    const step = last ? Math.min((now - last) / FRAME_MS, 4) : 1;
    last = now;

    // One turn around the vertical takes about six minutes.
    const yaw = now * 0.0000175;
    const tilt = Math.sin(now * 0.000011) * 0.22;
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const cosTilt = Math.cos(tilt);
    const sinTilt = Math.sin(tilt);

    context.clearRect(0, 0, width, height);

    // The pointer arrives in the window's coordinates and the web is drawn in
    // the canvas's, which differ wherever the canvas does not start at the
    // window's corner. Read once a frame, so a scroll between frames is followed.
    const origin = pointing ? canvas.getBoundingClientRect() : undefined;
    const localX = origin ? pointerX - origin.left : 0;
    const localY = origin ? pointerY - origin.top : 0;

    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index] as SkyNode;
      // Home plus the node's own slow wander.
      const wanderX = node.homeX + Math.sin(now * node.speedX + node.phaseX) * node.reachX;
      const wanderY = node.homeY + Math.cos(now * node.speedY + node.phaseY) * node.reachY;
      const wanderZ = node.homeZ + Math.sin(now * node.speedZ + node.phaseZ) * node.reachZ;

      // Turn around the vertical, then tip.
      const turnedX = wanderX * cosYaw - wanderZ * sinYaw;
      const turnedZ = wanderX * sinYaw + wanderZ * cosYaw;
      const tippedY = wanderY * cosTilt - turnedZ * sinTilt;
      const tippedZ = wanderY * sinTilt + turnedZ * cosTilt;

      // Perspective, with the divisor held above zero: turning the box swings
      // its width into its depth, and past the focal length the scene would
      // turn inside out.
      const scale = FOCAL / Math.max(FOCAL * 0.3, FOCAL + tippedZ);
      projectedX[index] = width / 2 + turnedX * scale;
      projectedY[index] = height / 2 + tippedY * scale;
      projectedZ[index] = tippedZ;
      projectedScale[index] = scale;

      if (still) continue;

      // The pointer pulls what is near it, and a weak, damped spring brings it back.
      if (pointing) {
        const towardsX = localX - ((projectedX[index] as number) + node.offsetX);
        const towardsY = localY - ((projectedY[index] as number) + node.offsetY);
        const distance = Math.sqrt(towardsX * towardsX + towardsY * towardsY);
        if (distance < MAGNET && distance > 0.5) {
          const closeness = 1 - distance / MAGNET;
          const force = closeness * closeness * PULL * step;
          node.velocityX += (towardsX / distance) * force;
          node.velocityY += (towardsY / distance) * force;
        }
      }
      node.velocityX = (node.velocityX - node.offsetX * SPRING * step) * DAMPING ** step;
      node.velocityY = (node.velocityY - node.offsetY * SPRING * step) * DAMPING ** step;
      node.offsetX += node.velocityX * step;
      node.offsetY += node.velocityY * step;
      projectedX[index] = (projectedX[index] as number) + node.offsetX;
      projectedY[index] = (projectedY[index] as number) + node.offsetY;
    }

    // --- The lines, under the nodes, darker the further back they are --------

    const linkSquared = LINK * LINK;
    bandCount.fill(0);
    for (let first = 0; first < nodes.length; first += 1) {
      for (let second = first + 1; second < nodes.length; second += 1) {
        const apartX = (projectedX[first] as number) - (projectedX[second] as number);
        const apartY = (projectedY[first] as number) - (projectedY[second] as number);
        const apartZ = ((projectedZ[first] as number) - (projectedZ[second] as number)) * 0.5;
        const distanceSquared = apartX * apartX + apartY * apartY + apartZ * apartZ;
        if (distanceSquared > linkSquared) continue;

        const near = 1 - Math.sqrt(distanceSquared) / LINK;
        const pairDepth = unit(
          1 - (((projectedZ[first] as number) + (projectedZ[second] as number)) * 0.5 + DEPTH) / (2 * DEPTH),
        );
        const alpha = near * near * (0.05 + pairDepth * 0.3);
        if (alpha < 0.006) continue;

        const band = Math.min(BANDS - 1, Math.floor((alpha / LINE_ALPHA_MAX) * BANDS));
        const at = bandCount[band] as number;
        const x1 = bandX1[band] as Float32Array;
        if (at >= x1.length) continue;
        x1[at] = projectedX[first] as number;
        (bandY1[band] as Float32Array)[at] = projectedY[first] as number;
        (bandX2[band] as Float32Array)[at] = projectedX[second] as number;
        (bandY2[band] as Float32Array)[at] = projectedY[second] as number;
        bandCount[band] = at + 1;
      }
    }

    context.lineWidth = 0.6;
    for (let band = 0; band < BANDS; band += 1) {
      const count = bandCount[band] as number;
      if (!count) continue;
      // The middle of the band, so a line is drawn at about its own brightness.
      const alpha = ((band + 0.5) / BANDS) * LINE_ALPHA_MAX;
      context.strokeStyle = `rgba(${LINE_RGB}, ${alpha.toFixed(3)})`;
      context.beginPath();
      for (let at = 0; at < count; at += 1) {
        context.moveTo(
          (bandX1[band] as Float32Array)[at] as number,
          (bandY1[band] as Float32Array)[at] as number,
        );
        context.lineTo(
          (bandX2[band] as Float32Array)[at] as number,
          (bandY2[band] as Float32Array)[at] as number,
        );
      }
      context.stroke();
    }

    // --- The nodes -------------------------------------------------------------

    for (let index = 0; index < nodes.length; index += 1) {
      const nodeDepth = unit(1 - ((projectedZ[index] as number) + DEPTH) / (2 * DEPTH));
      const radius = (0.7 + nodeDepth * 1.5) * (projectedScale[index] as number);
      context.fillStyle = `rgba(${NODE_RGB}, ${(0.1 + nodeDepth * 0.52).toFixed(3)})`;
      context.beginPath();
      context.arc(projectedX[index] as number, projectedY[index] as number, radius, 0, FULL_TURN);
      context.fill();
    }
  }

  function start() {
    if (running || still) return;
    last = 0;
    due = 0;
    running = requestAnimationFrame(frame);
  }

  function stop() {
    if (!running) return;
    cancelAnimationFrame(running);
    running = 0;
  }

  // A hidden tab draws nothing, and nor does a canvas scrolled out of view, so
  // the animation does not keep a core warm behind whatever the reader is
  // looking at instead.
  let inView = true;
  const follow = () => (document.hidden || !inView ? stop() : start());
  const visibility = new IntersectionObserver(([entry]) => {
    inView = entry?.isIntersecting ?? true;
    follow();
  });

  let pending: ReturnType<typeof setTimeout> | undefined;
  // The observer reports the size it starts with as well, which would scatter
  // the cloud a second time a moment after it was built, so only a change counts.
  const sizing = new ResizeObserver(() => {
    if (host.clientWidth === width && host.clientHeight === height) return;
    clearTimeout(pending);
    pending = setTimeout(() => {
      resize();
      if (still) frame(performance.now());
    }, RESIZE_SETTLE_MS);
  });

  if (!still) {
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave, { passive: true });
  }
  document.addEventListener("visibilitychange", follow);
  visibility.observe(canvas);
  sizing.observe(host);

  resize();
  if (still) frame(performance.now());
  else start();

  return () => {
    stop();
    clearTimeout(pending);
    visibility.disconnect();
    sizing.disconnect();
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerleave", onPointerLeave);
    document.removeEventListener("visibilitychange", follow);
  };
}
