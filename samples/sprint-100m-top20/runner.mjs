// Procedural runner: a small 3D skeleton (forward f, lateral l, up z — in buffer px) driven by a run-cycle phase,
// projected obliquely (far side = (1,-1)/√2 as on the ground, up = screen up) and rasterised as 2-3 px limbs with a dark
// 1-px outline. No sprite frames, no faces.
// Deviation from the ground mapping, on purpose: the ground's forward vector (1,2)/√5 is 63° below horizontal, almost
// opposite to "up", so a knee lift or a stride collapsed into a vertical stick. The body's own forward axis is drawn
// BODY_FWD_DEG below horizontal instead (a 3/4 view of the figures, as if the camera were lower for the people than for
// the ground; figures are already taller than scale). Their ground point still moves exactly along the track.
import {C, hex, shade, bayer} from './px.mjs';

const BODY_FWD_DEG = Number(process.env.BODY_FWD_DEG || 25);
const FX = Math.cos(BODY_FWD_DEG * Math.PI / 180), FY = Math.sin(BODY_FWD_DEG * Math.PI / 180), LX = Math.SQRT1_2, LY = -Math.SQRT1_2;
export const BODY_H = 31;                       // tag reference height (buffer px): highest head top in the cycle, incl. bob
const TAU = Math.PI * 2;
const wrap = x => x - Math.round(x);
const sm = q => { q = Math.max(0, Math.min(1, q)); return q * q * (3 - 2 * q); };

// ---- kits (no brand marks) ----
const K = h => hex(h);
export const KITS = {
  JAM: [{top: K('#F4C430'), shorts: K('#1F8A3B'), trim: K('#111111')}, {top: K('#F4C430'), shorts: K('#161616'), trim: K('#1F8A3B')}],
  USA: [{top: K('#22336F'), shorts: K('#C8202F'), trim: K('#F2F2F2')}, {top: K('#F2F2F2'), shorts: K('#22336F'), trim: K('#C8202F')}],
  KEN: [{top: K('#C1272D'), shorts: K('#161616'), trim: K('#1E8A3E')}],
  ITA: [{top: K('#2A7FDA'), shorts: K('#F2F2F2'), trim: K('#2A7FDA')}],
  TTO: [{top: K('#D0102B'), shorts: K('#161616'), trim: K('#F2F2F2')}],
  RSA: [{top: K('#0B7A3E'), shorts: K('#F2B631'), trim: K('#F2B631')}],
};
export const SKINS = [[K('#7A4A2E'), K('#5C3520')], [K('#8A5838'), K('#683F27')]];
const SHOE = K('#E9E4D8');

// ---- poses: joints in body space {f, l, z} ----
const J = (f, l, z) => ({f, l, z});
const SET = {
  hip: J(-6, 0, 13), sh: J(1, 0, 11), head: J(4, 0, 10.5),
  legF: {hip: J(-6, 1.3, 13), knee: J(-2, 1.3, 7), foot: J(-4, 1.3, 1), toe: J(-2.4, 1.3, 0.6)},
  legN: {hip: J(-6, -1.3, 13), knee: J(-9, -1.3, 6), foot: J(-12, -1.3, 1.2), toe: J(-10.4, -1.3, 0.6)},
  armF: {sh: J(1, 2.4, 11), el: J(1.5, 2.4, 5.6), hand: J(2, 2.4, 0.6)},
  armN: {sh: J(1, -2.4, 11), el: J(1.5, -2.4, 5.6), hand: J(2, -2.4, 0.6)},
};

/** run pose. ph: cycle phase (1 = two steps); lean: torso tilt forward (rad); amp: 0..1 swing amplitude */
function runPose(ph, lean, amp) {
  const hipZ = 15.2 - 2.6 * lean + 0.6 * Math.cos(2 * TAU * ph);
  const hip = J(0, 0, hipZ), tf = Math.sin(lean), tz = Math.cos(lean);
  const at = (o, k, l = 0) => J(o.f + k * tf, l, o.z + k * tz);
  const sh = at(hip, 9.5), head = at(hip, 12.6);
  const leg = (side, l) => {
    const p = ph + side, th = 0.22 + 0.4 * lean + amp * 0.8 * Math.sin(TAU * p);
    const hp = J(0, l, hipZ), knee = J(7 * Math.sin(th), l, hipZ - 7 * Math.cos(th));
    const w = wrap(p + 0.1), kap = 0.25 + amp * 1.6 * Math.exp(-((w / 0.18) ** 2)), sg = th - kap;
    const foot = J(knee.f + 7.6 * Math.sin(sg), l, Math.max(0.6, knee.z - 7.6 * Math.cos(sg)));
    const toe = J(foot.f + 1.9 * Math.sin(sg + 1.5), l, Math.max(0.3, foot.z - 1.9 * Math.cos(sg + 1.5)));
    return {hip: hp, knee, foot, toe};
  };
  const arm = (side, l) => {
    const p = ph + side, s = Math.sin(TAU * p);
    const a = -amp * 0.95 * s + 0.35 * lean, b = a + 1.25 + 0.35 * s;
    const shj = at(hip, 9.5, l), el = J(shj.f + 4.8 * Math.sin(a), l, shj.z - 4.8 * Math.cos(a));
    return {sh: shj, el, hand: J(el.f + 4.4 * Math.sin(b), l, el.z - 4.4 * Math.cos(b))};
  };
  return {hip, sh, head, legF: leg(0, 1.3), legN: leg(0.5, -1.3), armF: arm(0, 2.4), armN: arm(0.5, -2.4)};
}

const mixJ = (a, b, q) => J(a.f + (b.f - a.f) * q, a.l + (b.l - a.l) * q, a.z + (b.z - a.z) * q);
function mixPose(a, b, q) {
  const out = {};
  for (const k of Object.keys(a)) out[k] = a[k].f !== undefined ? mixJ(a[k], b[k], q) : Object.fromEntries(Object.keys(a[k]).map(j => [j, mixJ(a[k][j], b[k][j], q)]));
  return out;
}

/**
 * Pose for one runner. st: {tau, react, d, v, ph, finished}. Returns body-space joints.
 * "set" before the gun, drive phase (strong lean rising to upright by ~27 m), upright sprint, easing after the line.
 */
export function poseFor(st) {
  if (st.tau < st.react) return SET;
  const lean = st.finishedFor > 0 ? 0.12 - 0.17 * sm(st.finishedFor / 1.2) : 0.12 + 0.6 * (1 - sm(st.d / 27));
  const amp = 0.82 + 0.18 * Math.min(1, st.v / 9);
  const run = runPose(st.ph, lean, amp);
  const q = sm((st.tau - st.react) / 0.32);
  return q >= 1 ? run : mixPose(SET, run, q);
}

/** project body-space joint to buffer px around ground point (gx, gy); s = body scale */
export const proj = (gx, gy, j, s = 1) => [gx + s * (j.f * FX + j.l * LX), gy + s * (j.f * FY + j.l * LY - j.z)];

/** dithered ground shadow (an ellipse on the ground plane, longer along the track) */
export function drawShadow(P, gx, gy) {
  for (let y = -6; y <= 6; y++) for (let x = -8; x <= 8; x++) {
    const a = (x + y) / 12, b = (y - 2 * x) / 36, e = (a / 0.75) ** 2 + (b / 0.22) ** 2;   // metres, lanes
    if (e < 1) P.pxA(gx + x, gy + y, C.shadow, 0.65 * (1 - e * 0.6));
  }
}

const OUTLINE = hex('#1A0F14');
/** draw the runner; kit {top, shorts, trim}; skin [light, dark]; returns bbox [x0,y0,x1,y1] in buffer px.
 *  Painted in groups, far to near (far leg, far arm, torso + head, near leg, near arm); each group gets its dark outline
 *  first, so a near limb stays readable in front of the torso. */
export function drawRunner(P, gx, gy, pose, kit, skin, s = 1) {
  const pr = j => proj(gx, gy, j, s), xs = [], ys = [], segs = [];
  const group = strokes => {
    for (const ol of [true, false]) for (const [a, b, w, c] of strokes) {
      if (a === 'head') { const hd = pr(b), r = 3.4 * s; if (ol) { xs.push(hd[0]); ys.push(hd[1] - r); segs.push([hd[0] - r, hd[1] - r, hd[0] + r, hd[1] + r]); } P.disc(hd[0], hd[1], (ol ? 3.4 : 2.4) * s, ol ? OUTLINE : c); continue; }
      const p = pr(a), q = pr(b), e = (w + 2) / 2 + 0.5;
      if (ol) { xs.push(p[0], q[0]); ys.push(p[1], q[1]); segs.push([Math.min(p[0], q[0]) - e, Math.min(p[1], q[1]) - e, Math.max(p[0], q[0]) + e, Math.max(p[1], q[1]) + e]); }
      P.thick(p[0], p[1], q[0], q[1], ol ? w + 2 : w, ol ? OUTLINE : c);
    }
  };
  const leg = (lg, far) => {
    const sk = far ? skin[1] : skin[0], sh = far ? shade(kit.shorts, 0.72) : kit.shorts;
    return [[lg.knee, lg.foot, 2, sk], [lg.foot, lg.toe, 2, far ? shade(SHOE, 0.7) : SHOE], [lg.hip, lg.knee, 3, sk], [lg.hip, mixJ(lg.hip, lg.knee, 0.32), 3, sh]];
  };
  const arm = (am, far) => { const sk = far ? skin[1] : skin[0]; return [[am.sh, am.el, 2, sk], [am.el, am.hand, 2, sk]]; };
  group(leg(pose.legF, true)); group(arm(pose.armF, true));
  group([[pose.sh, mixJ(pose.sh, pose.head, 0.5), 2, skin[0]], [mixJ(pose.hip, pose.sh, 0.3), pose.sh, 5, kit.top], [pose.hip, mixJ(pose.hip, pose.sh, 0.25), 5, kit.shorts], ['head', pose.head, 0, skin[0]]]);
  const tr = pr(mixJ(pose.hip, pose.sh, 0.32)); P.px(Math.round(tr[0]) - 1, Math.round(tr[1]), kit.trim); P.px(Math.round(tr[0]), Math.round(tr[1]), kit.trim);
  group(leg(pose.legN, false)); group(arm(pose.armN, false));
  const bb = [Math.min(...xs) - 2, Math.min(...ys) - 2, Math.max(...xs) + 2, Math.max(...ys) + 2];
  bb.segs = segs;                                   // per-stroke boxes (buffer px) — what the overlap check tests against
  return bb;
}
