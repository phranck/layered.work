/**
 * Everything that moves behind and around the content.
 *
 * A cloud of nodes in three dimensions, joined by hair-thin lines to whichever
 * neighbours are near them in space. The whole cloud turns very slowly, each
 * node drifts on its own long cycle, and the pointer pulls the nearest ones
 * towards it before they wander back.
 *
 * The web and the card share one pointer and one frame loop. Two loops reading
 * the same pointer would be two answers to one question, and the card has to
 * follow at the rate the pointer moves whilst the web is content with a fifth
 * of that.
 *
 * Written as a string because it is served inline: the page is one document and
 * a second request for something decorative is a request the reader waits on.
 *
 * Three rules govern what is in here, and they are why it costs almost nothing:
 * nothing on the frame path allocates, the neighbour search is bounded rather
 * than exhaustive, and a reader who has asked for less motion gets one still
 * frame instead of an animation.
 */
export const SCENE_SCRIPT = `
(function () {
  var canvas = document.getElementById("sky");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // --- The cloud ------------------------------------------------------------
  // Home positions live in a box wider and taller than the window, so the
  // rotation never swings an empty edge into view. Depth runs from -1 at the
  // back to 1 at the front and decides brightness, size and how far a node
  // moves when the cloud turns.

  // These five are a set. The reach has to exceed the average spacing between
  // nodes or the result is a field of dots: measured at a spread of 1.45, a
  // depth of 900 and 150 nodes, the spacing came to about 415 units against a
  // reach of 190, and the web drew 30 lines a frame. Tightening the box and
  // widening the reach is what turns it into a web.
  //
  // A second copy of the cloud lives in tools/og.html, which draws one still
  // frame of it for the sharing image. It is apart because it runs offline in a
  // headless browser against a page this server never serves. Change the shape
  // of the web here and re-render there, or the picture people see before they
  // arrive stops being the page they arrive at.
  var SPREAD = 1.22;        // how far past the window the cloud reaches
  var DEPTH = 620;          // half the depth of the box, in the same units as x and y
  var FOCAL = 1500;         // perspective: larger is a flatter, calmer projection
  var LINK = 330;           // how near two nodes must be, in space, to be joined
  var MAGNET = 240;         // how near the pointer reaches, in screen pixels
  var PULL = 1.35;          // how hard it pulls
  var SPRING = 0.0075;      // how eagerly a node returns home, which is slowly
  var DAMPING = 0.93;       // what makes the return a wander rather than a snap
  var BANDS = 7;            // how many brightness steps the lines are drawn in
  var INTERVAL = 1000 / 20; // the web is slow by design, so it is drawn slowly

  var nodes = [];
  var width = 0;
  var height = 0;
  var ratio = 1;
  var half = 0;

  // Reused every frame so the loop allocates nothing.
  var px = [];
  var py = [];
  var pz = [];
  var ps = [];

  // Lines are collected by brightness and each band is drawn as one path. A
  // stroke per line would be several hundred calls a frame; this is seven.
  var bandX1 = [], bandY1 = [], bandX2 = [], bandY2 = [], bandCount = [];
  for (var b = 0; b < BANDS; b += 1) {
    bandX1.push(null); bandY1.push(null); bandX2.push(null); bandY2.push(null); bandCount.push(0);
  }

  function build() {
    var area = width * height;
    // Enough to read as a web, few enough that the pair search stays cheap.
    var count = Math.max(70, Math.min(260, Math.round(area / 7000)));
    nodes.length = 0;
    for (var i = 0; i < count; i += 1) {
      nodes.push({
        // Home position, which itself drifts on a long cycle.
        hx: (Math.random() - 0.5) * width * SPREAD,
        hy: (Math.random() - 0.5) * height * SPREAD,
        hz: (Math.random() - 0.5) * 2 * DEPTH,
        // Each node keeps its own phases and periods, so nothing pulses together.
        p1: Math.random() * 6.283,
        p2: Math.random() * 6.283,
        p3: Math.random() * 6.283,
        s1: 0.00007 + Math.random() * 0.00013,
        s2: 0.00005 + Math.random() * 0.00011,
        s3: 0.00004 + Math.random() * 0.00009,
        a1: 30 + Math.random() * 70,
        a2: 30 + Math.random() * 70,
        a3: 40 + Math.random() * 90,
        // Offset from the pointer, and the velocity that carries it home.
        ox: 0, oy: 0, vx: 0, vy: 0,
      });
    }
    px.length = py.length = pz.length = ps.length = nodes.length;

    // Room for every pair that could possibly fall in one band, allocated once.
    var cap = Math.max(256, count * 12);
    for (var b = 0; b < BANDS; b += 1) {
      bandX1[b] = new Float32Array(cap);
      bandY1[b] = new Float32Array(cap);
      bandX2[b] = new Float32Array(cap);
      bandY2[b] = new Float32Array(cap);
    }
  }

  function resize() {
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    half = Math.min(width, height);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    build();
    measureCard();
  }

  // --- The pointer ----------------------------------------------------------
  // Absent until it moves, so a page opened on a phone never has one.

  var pointerX = 0;
  var pointerY = 0;
  var pointing = false;
  // How far the pointer has travelled since the last frame. Events can arrive
  // several times in one frame, so it accumulates and the frame consumes it.
  var moveX = 0;
  var moveY = 0;

  if (!still) {
    window.addEventListener("pointermove", function (event) {
      if (event.pointerType === "touch") return;
      if (pointing) {
        moveX += event.clientX - pointerX;
        moveY += event.clientY - pointerY;
      }
      pointerX = event.clientX;
      pointerY = event.clientY;
      pointing = true;
      if (event.timeStamp - measuredAt > 500) measureCard();
    }, { passive: true });
    window.addEventListener("pointerleave", function () { pointing = false; }, { passive: true });
    // The card is measured once rather than on every frame, so anything that
    // could move it has to say so.
    window.addEventListener("scroll", measureCard, { passive: true });

    // A press near a corner knocks that corner away from the reader. The
    // impulse is the opposite of the lean the pointer is asking for, so it
    // always pushes the near corner back rather than in a fixed direction.
    window.addEventListener("pointerdown", function (event) {
      if (event.pointerType === "touch" || !cardBox) return;
      measureCard();
      var pull = cornerPull(cardBox);
      if (pull <= 0) return;
      // Pressing a corner knocks it back; it does not begin a selection. Only
      // a press that actually lands near a corner is taken, so the address at
      // the foot of the card can still be selected and copied.
      event.preventDefault();
      var nx = Math.max(-1.4, Math.min(1.4, (event.clientX - (cardBox.left + cardBox.width / 2)) / (cardBox.width / 2)));
      var ny = Math.max(-1.4, Math.min(1.4, (event.clientY - (cardBox.top + cardBox.height / 2)) / (cardBox.height / 2)));
      tiltVX -= ny * TILT * pull * FLICK * 0.1;
      tiltVY -= -nx * TILT * pull * FLICK * 0.1;
    });
  }

  // --- The card -------------------------------------------------------------
  // A rigid plane. Bringing a corner towards the reader tips the whole card,
  // because that is what happens to a rigid thing pulled at one corner, and it
  // is the difference between this and a panel that merely tilts towards the
  // pointer wherever it is.

  var card = document.querySelector("main");
  var REACH = 300;          // how near a corner the pointer has to come
  var TILT = 11.4;          // degrees at the most, chosen by measuring: this brings
                            // the near corner about 120px forward on this card
  var STIFFNESS = 0.1;      // how strongly it follows
  var CARD_DAMPING = 0.82;  // what stops it from swinging past and back

  // The card also turns in its own plane, the way a sheet pinned through its
  // middle turns when something sweeps past it. What decides that is torque:
  // the lever from the middle out to the pointer, crossed with the direction
  // the pointer is travelling. A sweep along a line through the middle exerts
  // none, which is right, and one along the edge exerts the most.
  var SPIN_GAIN = 0.52;     // how much a sweep turns it
  var SPIN_STIFFNESS = 0.034; // how hard it is pulled back
  var SPIN_DAMPING = 0.90;  // little enough that it swings past and back, tight
                            // enough that it reads as sprung rather than loose
  var SPIN_MAX = 2.5;       // degrees, which is about nineteen pixels at a corner

  // Clicking a corner knocks it back. The impulse goes onto the velocity rather
  // than onto the angle, so the card carries on past where the pointer is
  // holding it and is then pulled back, which is what a flick is.
  var FLICK = 5.5;

  var shadow = document.getElementById("shadow");
  var SHADOW_DROP = 22;     // where it sits when the card is flat, in pixels
  var SHADOW_SHIFT = 1.9;   // how far a degree of lean moves it
  var SHADOW_GROW = 0.0042; // how much a degree of lean spreads it

  var cardBox = null;
  var tiltX = 0, tiltY = 0;
  var tiltVX = 0, tiltVY = 0;
  var spin = 0, spinV = 0;

  var measuredAt = 0;

  function measureCard() {
    cardBox = card ? card.getBoundingClientRect() : null;
    measuredAt = performance.now();
  }

  // Reading the card's box every frame would force a layout on the frame path,
  // and measuring it once is not enough: it is laid out in the fallback face
  // and grows when Barlow arrives, after which every corner is in the wrong
  // place. That was worth about ten degrees of lean at the corners.
  //
  // So: whenever it changes size, once the typefaces have settled, and at most
  // twice a second whilst the pointer is about. One rect read per half second
  // costs nothing and nothing can drift for longer than that.
  if (card && window.ResizeObserver) {
    new ResizeObserver(measureCard).observe(card);
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(measureCard);
  }

  /** How near the pointer is to the nearest corner, as 1 at it and 0 beyond reach. */
  function cornerPull(box) {
    var best = Infinity, cx, cy, dx, dy, d;
    for (var ix = 0; ix < 2; ix += 1) {
      for (var iy = 0; iy < 2; iy += 1) {
        cx = ix ? box.right : box.left;
        cy = iy ? box.bottom : box.top;
        dx = pointerX - cx;
        dy = pointerY - cy;
        d = Math.sqrt(dx * dx + dy * dy);
        if (d < best) best = d;
      }
    }
    if (best >= REACH) return 0;
    var near = 1 - best / REACH;
    return near * near;
  }

  /**
   * Where the card's shadow falls.
   *
   * The light is above and a little in front, so a flat card drops its shadow
   * straight down. Leaning the card moves the edge that comes forward further
   * from the surface behind, and its shadow accordingly moves away from it and
   * spreads; the edge that goes back does the opposite. The whole silhouette
   * also turns with the card's own turn, because that is what a silhouette is.
   */
  function castShadow() {
    if (!shadow) return;
    var lean = Math.sqrt(tiltX * tiltX + tiltY * tiltY);
    var x = -tiltY * SHADOW_SHIFT;
    var y = SHADOW_DROP + tiltX * SHADOW_SHIFT;
    var grow = 0.96 + lean * SHADOW_GROW;
    shadow.style.transform =
      "translate3d(" + x.toFixed(2) + "px, " + y.toFixed(2) + "px, 0) rotate(" + spin.toFixed(3) + "deg) scale(" + grow.toFixed(4) + ")";
    // Spread over a larger area from the same source, so it thins.
    shadow.style.opacity = (0.5 - lean * 0.011).toFixed(3);
  }

  function moveCard(step) {
    if (!card || !cardBox) return;

    var wantX = 0, wantY = 0;
    if (pointing) {
      var pull = cornerPull(cardBox);
      if (pull > 0) {
        // Where the pointer sits relative to the middle, which decides which
        // way the plane leans. Bounded, so a pointer far outside the card does
        // not ask for more than the corner nearest it already asks for.
        var nx = Math.max(-1.4, Math.min(1.4, (pointerX - (cardBox.left + cardBox.width / 2)) / (cardBox.width / 2)));
        var ny = Math.max(-1.4, Math.min(1.4, (pointerY - (cardBox.top + cardBox.height / 2)) / (cardBox.height / 2)));
        // The signs are the ones that bring the near corner towards the reader
        // rather than away from it: a positive rotateY turns the right edge
        // back, and a positive rotateX brings the bottom edge forward, so the
        // horizontal term is negated and the vertical one is not. Measured
        // rather than reasoned about, because the two conventions disagree.
        wantY = -nx * TILT * pull;
        wantX = ny * TILT * pull;
      }
    }

    tiltVX = (tiltVX + (wantX - tiltX) * STIFFNESS * step) * Math.pow(CARD_DAMPING, step);
    tiltVY = (tiltVY + (wantY - tiltY) * STIFFNESS * step) * Math.pow(CARD_DAMPING, step);
    tiltX += tiltVX * step;
    tiltY += tiltVY * step;

    // The turn in the plane. The lever is normalised against the card's own
    // half-size, so the same sweep turns a small card as much as a large one.
    if (pointing && (moveX || moveY)) {
      var leverX = (pointerX - (cardBox.left + cardBox.width / 2)) / (cardBox.width / 2);
      var leverY = (pointerY - (cardBox.top + cardBox.height / 2)) / (cardBox.height / 2);
      var reach = Math.max(0, 1 - Math.sqrt(leverX * leverX + leverY * leverY) / 2.2);
      spinV += (leverX * moveY - leverY * moveX) * SPIN_GAIN * reach * 0.01;
    }
    moveX = 0;
    moveY = 0;

    // Wound back under tension: stiff enough to return, damped little enough
    // to pass the middle and come back a time or two before it settles.
    spinV = (spinV - spin * SPIN_STIFFNESS * step) * Math.pow(SPIN_DAMPING, step);
    spin += spinV * step;
    if (spin > SPIN_MAX) { spin = SPIN_MAX; spinV = 0; }
    if (spin < -SPIN_MAX) { spin = -SPIN_MAX; spinV = 0; }

    // Rotation and nothing else. The card is pinned at its middle, so a corner
    // comes forward only because the opposite one goes back, which is how a
    // rigid thing on a pivot behaves. Adding a push towards the reader on top
    // would read as the card floating free of that pivot.
    //
    // The corner still travels a long way: it sits about 434px from the middle
    // on this card, and the two rotations add there, so the near corner comes
    // roughly 120px forward whilst the opposite one goes the same distance
    // back. Measured rather than worked out, because the sign conventions of
    // the two rotations are easy to get the wrong way round.
    if (Math.abs(tiltX) < 0.01 && Math.abs(tiltY) < 0.01 && Math.abs(spin) < 0.005) {
      card.style.transform = "";
      castShadow();
      return;
    }
    card.style.transform =
      "rotateX(" + tiltX.toFixed(3) + "deg) rotateY(" + tiltY.toFixed(3) + "deg) rotateZ(" + spin.toFixed(3) + "deg)";
    castShadow();
  }

  // --- The frame ------------------------------------------------------------

  /*
   * Holds a value to 0 to 1.
   *
   * The cloud is built inside a box of a known depth, and a node's place in that
   * box is what decides how bright and how large it is drawn. Turning the box
   * moves part of its width into its depth, so a node can end up further away
   * than the box is deep, and the figure that is meant to run from 0 to 1 runs
   * past both ends. At the far end it goes negative, and a negative brightness
   * only dims whilst a negative radius is an error the canvas throws: that
   * exception left the rest of the frame's nodes undrawn.
   */
  function clamp01(value) {
    return value < 0 ? 0 : value > 1 ? 1 : value;
  }

  var last = 0;
  var due = 0;
  var cardLast = 0;

  function frame(now) {
    if (!still) running = requestAnimationFrame(frame);

    // The card follows the pointer, so it moves every frame.
    var cardStep = cardLast ? Math.min((now - cardLast) / 16.667, 4) : 1;
    cardLast = now;
    if (!still) moveCard(cardStep);

    // The web is slow by design, so twenty frames a second is plenty and four
    // fifths of the drawing is work not done. The physics below reads the real
    // elapsed time, so it moves at the same speed whatever the rate is.
    if (now < due) return;
    due = now + INTERVAL;

    var step = last ? Math.min((now - last) / 16.667, 4) : 1;
    last = now;

    // The whole cloud turns, slowly enough that it reads as drifting rather
    // than spinning: one turn around the vertical takes about six minutes.
    var yaw = now * 0.0000175;
    var tilt = Math.sin(now * 0.000011) * 0.22;
    var cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    var cosX = Math.cos(tilt), sinX = Math.sin(tilt);

    ctx.clearRect(0, 0, width, height);

    var i, node, x, y, z, rx, ry, rz, scale, dx, dy, dist, force;

    for (i = 0; i < nodes.length; i += 1) {
      node = nodes[i];

      // Where the node is before the cloud turns: its home plus its own slow
      // wander, which is what keeps the web changing without anything moving
      // in step with anything else.
      x = node.hx + Math.sin(now * node.s1 + node.p1) * node.a1;
      y = node.hy + Math.cos(now * node.s2 + node.p2) * node.a2;
      z = node.hz + Math.sin(now * node.s3 + node.p3) * node.a3;

      // Turn around the vertical, then tip.
      rx = x * cosY - z * sinY;
      rz = x * sinY + z * cosY;
      ry = y * cosX - rz * sinX;
      rz = y * sinX + rz * cosX;

      // Perspective, with the divisor held above zero.
      //
      // The depth of the box is well inside the focal length, so this looks
      // safe, and it is not: turning the box swings its width into its depth,
      // and the width follows the window. On a 2560 pixel display a node can
      // reach about 1900 units in front of the middle against a focal length of
      // 1500, and past that point the divisor changes sign, which turns the
      // scene inside out. The floor caps how large a near node is drawn instead.
      scale = FOCAL / Math.max(FOCAL * 0.3, FOCAL + rz);
      px[i] = width / 2 + rx * scale;
      py[i] = height / 2 + ry * scale;
      pz[i] = rz;
      ps[i] = scale;

      if (still) continue;

      // The pointer pulls what is near it, and a spring brings it back. The
      // spring is weak and the damping high, so the return is a wander.
      if (pointing) {
        dx = pointerX - (px[i] + node.ox);
        dy = pointerY - (py[i] + node.oy);
        dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MAGNET && dist > 0.5) {
          force = (1 - dist / MAGNET);
          force = force * force * PULL * step;
          node.vx += (dx / dist) * force;
          node.vy += (dy / dist) * force;
        }
      }
      node.vx = (node.vx - node.ox * SPRING * step) * Math.pow(DAMPING, step);
      node.vy = (node.vy - node.oy * SPRING * step) * Math.pow(DAMPING, step);
      node.ox += node.vx * step;
      node.oy += node.vy * step;
      px[i] += node.ox;
      py[i] += node.oy;
    }

    // --- The lines ----------------------------------------------------------
    // Drawn first so the nodes sit on top of them. Depth decides how dark a
    // line is, which is what gives the web its distance.

    var j, lx, ly, lz, d2, near, depth, alpha, band, at;
    var linkSquared = LINK * LINK;

    for (band = 0; band < BANDS; band += 1) bandCount[band] = 0;

    for (i = 0; i < nodes.length; i += 1) {
      for (j = i + 1; j < nodes.length; j += 1) {
        lx = px[i] - px[j];
        ly = py[i] - py[j];
        lz = (pz[i] - pz[j]) * 0.5;
        d2 = lx * lx + ly * ly + lz * lz;
        if (d2 > linkSquared) continue;

        near = 1 - Math.sqrt(d2) / LINK;
        // The pair's own depth, from behind to in front, as 0 to 1. This is
        // what makes the far side of the web darker than the near side.
        depth = clamp01(1 - ((pz[i] + pz[j]) * 0.5 + DEPTH) / (2 * DEPTH));
        alpha = near * near * (0.05 + depth * 0.30);
        if (alpha < 0.006) continue;

        band = Math.min(BANDS - 1, Math.floor(alpha / 0.35 * BANDS));
        at = bandCount[band];
        if (at >= bandX1[band].length) continue;
        bandX1[band][at] = px[i]; bandY1[band][at] = py[i];
        bandX2[band][at] = px[j]; bandY2[band][at] = py[j];
        bandCount[band] = at + 1;
      }
    }

    ctx.lineWidth = 0.6;
    for (band = 0; band < BANDS; band += 1) {
      if (!bandCount[band]) continue;
      // The middle of the band, so a line is drawn at about its own brightness.
      alpha = (band + 0.5) / BANDS * 0.35;
      ctx.strokeStyle = "rgba(150, 185, 235, " + alpha.toFixed(3) + ")";
      ctx.beginPath();
      for (at = 0; at < bandCount[band]; at += 1) {
        ctx.moveTo(bandX1[band][at], bandY1[band][at]);
        ctx.lineTo(bandX2[band][at], bandY2[band][at]);
      }
      ctx.stroke();
    }

    // --- The nodes ----------------------------------------------------------

    var radius;
    for (i = 0; i < nodes.length; i += 1) {
      depth = clamp01(1 - (pz[i] + DEPTH) / (2 * DEPTH));
      radius = (0.7 + depth * 1.5) * ps[i];
      alpha = 0.10 + depth * 0.52;
      ctx.fillStyle = "rgba(186, 212, 246, " + alpha.toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(px[i], py[i], radius, 0, 6.283);
      ctx.fill();
    }
  }

  var running = 0;

  function start() {
    if (running || still) return;
    last = 0;
    due = 0;
    cardLast = 0;
    running = requestAnimationFrame(frame);
  }

  function stop() {
    if (!running) return;
    cancelAnimationFrame(running);
    running = 0;
  }

  // A hidden tab draws nothing. Without this the animation keeps a core warm
  // behind whatever the reader actually went off to look at.
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop(); else start();
  });

  var pending = 0;
  window.addEventListener("resize", function () {
    clearTimeout(pending);
    pending = setTimeout(function () {
      resize();
      if (still) frame(performance.now());
    }, 150);
  }, { passive: true });

  resize();
  if (still) frame(performance.now()); else start();
})();
`;
