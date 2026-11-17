// Six simplified national flags as crisp vector shapes (drawn on the HD layer, not the pixel layer).
// drawFlag(ctx, code, x, y, w, h) — (x, y) top-left. Proportions are fitted to the tag box (3:2); designs simplified.
const R = (ctx, c, x, y, w, h) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
const P = (ctx, c, pts) => { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]); ctx.closePath(); ctx.fill(); };

const FLAGS = {
  // Jamaica: gold saltire, green top/bottom, black hoist/fly triangles
  JAM(ctx, x, y, w, h) {
    R(ctx, '#009B3A', x, y, w, h);
    P(ctx, '#111111', [[x, y], [x + w / 2, y + h / 2], [x, y + h]]);
    P(ctx, '#111111', [[x + w, y], [x + w / 2, y + h / 2], [x + w, y + h]]);
    ctx.save(); ctx.strokeStyle = '#FED100'; ctx.lineWidth = h * 0.2; ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); ctx.moveTo(x + w, y); ctx.lineTo(x, y + h); ctx.stroke(); ctx.restore();
  },
  // USA: 7 stripes at this size (13 would be sub-pixel), blue canton with a few white dots
  USA(ctx, x, y, w, h) {
    const n = 7, sh = h / n;
    for (let k = 0; k < n; k++) R(ctx, k % 2 ? '#FFFFFF' : '#B22234', x, y + k * sh, w, sh + 0.5);
    const cw = w * 0.44, ch = sh * 4;
    R(ctx, '#3C3B6E', x, y, cw, ch);
    ctx.fillStyle = '#FFFFFF';
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { ctx.beginPath(); ctx.arc(x + cw * (0.14 + 0.24 * c + (r % 2) * 0.1), y + ch * (0.2 + 0.3 * r), Math.max(0.8, h * 0.035), 0, Math.PI * 2); ctx.fill(); }
  },
  // Kenya: black / red / green with white fimbriation and a red-black shield
  KEN(ctx, x, y, w, h) {
    R(ctx, '#111111', x, y, w, h / 3); R(ctx, '#FFFFFF', x, y + h / 3, w, h / 3); R(ctx, '#006600', x, y + 2 * h / 3, w, h / 3);
    R(ctx, '#BB0000', x, y + h * 0.4, w, h * 0.2);
    ctx.save(); ctx.fillStyle = '#BB0000'; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w * 0.12, h * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111111'; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w * 0.045, h * 0.28, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = Math.max(1, h * 0.05); ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w * 0.12, h * 0.4, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  },
  // Italy: green / white / red vertical
  ITA(ctx, x, y, w, h) { R(ctx, '#009246', x, y, w / 3 + 0.5, h); R(ctx, '#FFFFFF', x + w / 3, y, w / 3 + 0.5, h); R(ctx, '#CE2B37', x + 2 * w / 3, y, w / 3, h); },
  // Trinidad and Tobago: red with a white-edged black diagonal from top-left to bottom-right
  TTO(ctx, x, y, w, h) {
    R(ctx, '#CE1126', x, y, w, h);
    ctx.save(); ctx.lineCap = 'butt'; ctx.beginPath(); ctx.moveTo(x - w * 0.1, y - h * 0.1); ctx.lineTo(x + w * 1.1, y + h * 1.1);
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = h * 0.5; ctx.stroke(); ctx.strokeStyle = '#111111'; ctx.lineWidth = h * 0.34; ctx.stroke(); ctx.restore();
  },
  // South Africa: red top, blue bottom, white-edged green Y, gold-edged black hoist triangle
  RSA(ctx, x, y, w, h) {
    R(ctx, '#E03C31', x, y, w, h / 2); R(ctx, '#001489', x, y + h / 2, w, h / 2);
    const cx = x + w * 0.42, cy = y + h / 2;
    const Y = (lw, c) => { ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x - 1, y - 1); ctx.lineTo(cx, cy); ctx.lineTo(x + w + 1, cy); ctx.moveTo(x - 1, y + h + 1); ctx.lineTo(cx, cy); ctx.stroke(); };
    ctx.save(); ctx.lineJoin = 'miter'; Y(h * 0.44, '#FFFFFF'); Y(h * 0.27, '#007749'); ctx.restore();
    P(ctx, '#FFB81C', [[x, y + h * 0.12], [x + w * 0.3, cy], [x, y + h * 0.88]]);
    P(ctx, '#111111', [[x, y + h * 0.22], [x + w * 0.22, cy], [x, y + h * 0.78]]);
  },
};

export function drawFlag(ctx, code, x, y, w = 30, h = 20) {
  const f = FLAGS[code]; if (!f) throw new Error(`no flag for ${code}`);
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  f(ctx, x, y, w, h);
  ctx.restore();
  ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); ctx.restore();
}
export const FLAG_CODES = Object.keys(FLAGS);
