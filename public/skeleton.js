const REST = {
  headTop: [400, 90], back: [400, 160], hip: [400, 290], /* Dem bones, dem bones, dem...                       */
  rShoulder: [356, 172], lShoulder: [444, 172],          /* ...dry bones!                                      */
  rElbow: [356, 242], lElbow: [444, 242],                /* Dem bones, dem bones, dem...                       */
  rWrist: [356, 312], lWrist: [444, 312],                /* ...dry bones!                                      */
  rHip: [382, 290], lHip: [418, 290],                    /* Dem bones, dem bones, dem...                       */
  rKnee: [382, 380], lKnee: [418, 380],                  /* ...dry bones!                                      */
  rAnkle: [382, 470], lAnkle: [418, 470],                /* ...NOW SHAKE DEM SKELETON BONES!                   */
};

export const PARTS = {
  head:      ['headTop',   'back'],                      /* The head bone's connected to the... back bone...   */
  ribcage:   ['back',      'hip'],                       /* ...the back bone's connected to the... hip bone... */
  rUpperLeg: ['rHip',      'rKnee'],                     /* ...the hip bone's connected to the...              */
  lUpperLeg: ['lHip',      'lKnee'],                     /* ...knee bones...                                   */
  rLowerLeg: ['rKnee',     'rAnkle'],                    /* ...the knee bones're connected to the...           */
  lLowerLeg: ['lKnee',     'lAnkle'],                    /* ...ankle bones...                                  */
  rUpperArm: ['rShoulder', 'rElbow'],                    /* ...the shouler bone's connected to the...          */
  lUpperArm: ['lShoulder', 'lElbow'],                    /* ...elbow bones...                                  */
  rLowerArm: ['rElbow',    'rWrist'],                    /* ...the elbow bones're connected to the...          */
  lLowerArm: ['lElbow',    'lWrist'],                    /* ...wrist bones...                                  */
};                                                       /* ...NOW SHAKE DEM SKELETON BONES!                   */

const STRINGS = [
  { point: 'rWrist', side: 'right', limb: 'arm' },       /* A dem bones, dem bones gonna walk around,          */
  { point: 'lWrist', side: 'left', limb: 'arm' },        /* A dem bones, dem bones gonna walk around,          */
  { point: 'rAnkle', side: 'right', limb: 'leg' },       /* A dem bones, dem bones gonna walk around,          */
  { point: 'lAnkle', side: 'left', limb: 'leg' },        /* I hear the word of the Developer!                  */
];

const TILT_FACTOR = 1.2;        // Exaggerate your wrist movements a little!
const ANCHOR_Y = -40;           // Strings are tied here (off the top!)
const STRING_SLACK = 6;         // How much 'tug' do you need before bones move
const ARM_FULL_DEG = 30;        // Degrees for full lift of arm
const ARM_LIFT = 250;           // Amount of full lift of arm
const FOOT_FULL_DEG = 30;       // Degrees for full lift of foot
const FOOT_LIFT = 230;          // Amount of ful llift of foot
const SIDEWAYS_FULL_DEG = 45;   // Degrees for full sweep across stage
const REACH = 190;              // Max limb reach from centreline/spine
const SHOW_HEAD_STRING = false; // Hi nosy developer! Umm; I added this string because a real puppet would have
                                // one here and I thought it would look weird without one, but actually it looks
                                // weirder WITH it, I think? Maybe you disagree. I flip-flopped. Hence the const.
const GRAVITY = 1800;           // Pixels/sec/sec, downwards. Keep it loose!
const DAMPING = 0.985;          // Inverse of inertia. How much to burn off momentum!
const ITERATIONS = 12;          // Per-frame constraint check counter.
const STEP = 1 / 120;           // Physics step size.
const MOVING_SPEED = 222;       // If you're going this fast, you're "moving" (for music purposes)
const STILL_SECS = 0.2;         // If you're stationary for this long, you're not (ditto)

/* Utility functions */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * Given a string's side and limb, and the phone's tilt, return how much to lift the limb.
 * @param {{side: 'left'|'right', limb: 'arm'|'leg'}
 * @return {number} Amount to lift the limb by, in pixels.
 */
function targetLift({ side, limb }, tilt) {
  // A negative tilt raises right limbs, positive tile raises left.
  const deg = limb === 'arm' ? tilt.beta : tilt.gamma;
  const amount = (side === 'right' ? -deg : deg) * TILT_FACTOR;
  if (limb === 'arm') return clamp(amount / ARM_FULL_DEG, 0, 1) * ARM_LIFT;
  return clamp(amount / FOOT_FULL_DEG, 0, 1) * FOOT_LIFT;
}

/**
 * Spawn the skelly!
 * 🔄 = move
 * ↔️ = legs
 * ↕️ = arms
 */
export function createPuppet(svg) {
  const points = {};
  for (const [name, [x, y]] of Object.entries(REST)) points[name] = { x, y, px: x, py: y };

  const constraints = [];
  function link(a, b, { stiffness = 1, min = false, scale = 1 } = {}) {
    constraints.push({ a: points[a], b: points[b], length: dist(points[a], points[b]) * scale, stiffness, min });
  }

  // The ribcage and hip form one rigid body: brace every pair of its points.
  const torso = ['back', 'hip', 'rShoulder', 'lShoulder', 'rHip', 'lHip'];
  torso.forEach((a, i) => torso.slice(i + 1).forEach((b) => link(a, b)));
  for (const [a, b] of Object.values(PARTS)) if (a !== 'back') link(a, b);
  // A floppy back, and elbows and knees that can't fold flat.
  link('headTop', 'rShoulder', { stiffness: 0.3 });
  link('headTop', 'lShoulder', { stiffness: 0.3 });
  for (const s of ['r', 'l']) {
    link(`${s}Shoulder`, `${s}Wrist`, { min: true, scale: 0.35 });
    link(`${s}Hip`, `${s}Ankle`, { min: true, scale: 0.55 });
  }

  const headString = { point: points.headTop, anchor: { x: REST.headTop[0], y: ANCHOR_Y } };
  headString.length = dist(headString.point, headString.anchor);
  const strings = STRINGS.map((s) => {
    const point = points[s.point];
    const anchor = { x: REST[s.point][0], y: ANCHOR_Y };
    const rest = dist(point, anchor) + STRING_SLACK;
    return { ...s, point, anchor, rest, length: rest };
  });
  const allStrings = [headString, ...strings];
  for (const s of allStrings) s.baseX = s.anchor.x;

  const ns = 'http://www.w3.org/2000/svg';
  const stringLayer = document.createElementNS(ns, 'g');
  stringLayer.setAttribute('class', 'strings');
  svg.append(stringLayer);
  for (const s of SHOW_HEAD_STRING ? allStrings : strings) {
    s.line = document.createElementNS(ns, 'line');
    s.line.setAttribute('y1', s.anchor.y);
    stringLayer.append(s.line);
  }

  // The viewbox is scaled to fit so we can use it to limit lateral drift when we dance sideways:
  let maxOffset = 0;
  function measure() {
    const { width, height } = svg.getBoundingClientRect();
    const box = svg.viewBox.baseVal;
    const scale = Math.min(width / box.width, height / box.height);
    if (scale > 0) maxOffset = Math.max(0, width / scale / 2 - REACH);
  }
  measure();
  window.addEventListener('resize', measure);
  let offset = 0;

  const parts = Object.entries(PARTS).map(([name, [a, b]]) => ({
    el: svg.querySelector(`[data-part="${name}"]`),
    a: points[a],
    b: points[b],
  })).filter((p) => p.el);

  let tilt = { alpha: 0, beta: 0, gamma: 0 };

  function satisfy({ a, b, length, stiffness, min }) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1e-6;
    if (min && d >= length) return;
    const k = ((d - length) / d) * 0.5 * stiffness;
    a.x += dx * k; a.y += dy * k;
    b.x -= dx * k; b.y -= dy * k;
  }

  // Strings pull when taut and do nothing when slack:
  function pull({ point, anchor, length }) {
    const dx = point.x - anchor.x;
    const dy = point.y - anchor.y;
    const d = Math.hypot(dx, dy);
    if (d <= length) return;
    point.x -= dx * (d - length) / d;
    point.y -= dy * (d - length) / d;
  }

  let stillFor = STILL_SECS;

  function step(dt) {
    for (const s of strings) {
      s.length += (s.rest - targetLift(s, tilt) - s.length) * 0.08; // Easing (TODO: sufficient?)
    }
    const targetOffset = clamp(-tilt.alpha / SIDEWAYS_FULL_DEG, -1, 1) * maxOffset;
    offset += (targetOffset - offset) * 0.08;
    for (const s of allStrings) s.anchor.x = s.baseX + offset;
    for (const p of Object.values(points)) {
      const vx = (p.x - p.px) * DAMPING;
      const vy = (p.y - p.py) * DAMPING;
      p.px = p.x; p.py = p.y;
      p.x += vx;
      p.y += vy + GRAVITY * dt * dt;
    }
    for (let i = 0; i < ITERATIONS; i++) {
      constraints.forEach(satisfy);
      pull(headString);
      strings.forEach(pull);
    }
    const speed = Math.max(...Object.values(points).map((p) => Math.hypot(p.x - p.px, p.y - p.py))) / dt;
    stillFor = speed > MOVING_SPEED ? 0 : stillFor + dt;
  }

  function render() {
    for (const { el, a, b } of parts) {
      const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI - 90;
      el.setAttribute('transform', `translate(${a.x.toFixed(2)} ${a.y.toFixed(2)}) rotate(${angle.toFixed(2)})`);
    }
    for (const s of allStrings) {
      if (!s.line) continue;
      s.line.setAttribute('x1', s.anchor.x.toFixed(2));
      s.line.setAttribute('x2', s.point.x.toFixed(2));
      s.line.setAttribute('y2', s.point.y.toFixed(2));
    }
  }

  let last = performance.now();
  let pending = 0;
  function frame(now) {
    // fixed step = 1/120
    pending = Math.min(pending + (now - last) / 1000, 0.1);
    last = now;
    while (pending >= STEP) {
      step(STEP);
      pending -= STEP;
    }
    render();
    requestAnimationFrame(frame);
  }
  render();
  requestAnimationFrame(frame);

  return {
    isMoving() {
      return stillFor < STILL_SECS;
    },
    // { alpha, beta, gamma } relative to calibrated
    setTilt(angles) {
      tilt = angles;
    },
  };
}
