// Ground mapping and the stadium, drawn per pixel from integer WORLD coordinates so nothing shimmers when the camera moves.
//
// World buffer coordinates of a ground point (d metres along the track, u lanes across; lane i spans u = i..i+1):
//   X = 4d - 12u,  Y = 8d + 12u       → one metre = (+4, +8) px, one lane = (-12, +12) px (lane 0 far/upper-right).
// Inverse (integer-friendly): A = X + Y = 12 d,  B = Y - 2X = 36 u.
// The camera only translates along the track by whole buffer pixels: off = round(4 * dcam), shift = (off, 2 off).
import {W, H, C, bayer, ih, shade} from './px.mjs';

export const LANES = 20, ANCHOR = [76, 478], ANCHOR_U = 19.5;          // lane 19 centre sits at buffer (76, 478) = screen (228, 1434); brief said ~(216, 1434), moved 12 px right so the leader's tag clears the left edge
export function camera(dcam) {
  const off = Math.round(4 * dcam);
  // world point (dcam, ANCHOR_U) = (4 dcam - 12 u, 8 dcam + 12 u) must land on ANCHOR; 4 dcam is replaced by the whole number off
  return {x: off - 12 * ANCHOR_U - ANCHOR[0], y: 2 * off + 12 * ANCHOR_U - ANCHOR[1], off};
}
export const toScreen = (cam, d, u) => [4 * d - 12 * u - cam.x, 8 * d + 12 * u - cam.y];

// ---- tiny pixel font (3x5 digits, 5x5 'm') for the distance boards ----
const GLYPH = {
  0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'], 3: ['111', '001', '011', '001', '111'],
  4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'], 6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'],
  8: ['111', '101', '111', '101', '111'], 9: ['111', '101', '111', '001', '111'], m: ['00000', '11110', '10101', '10101', '10101'],
};
function pixText(P, s, x, y, c) { for (const ch of s) { const g = GLYPH[ch]; g.forEach((row, j) => [...row].forEach((b, i) => { if (b === '1') P.px(x + i, y + j, c); })); x += g[0].length + 1; } }

// LED board colours (abstract blocks only)
const LED = ['#2A6FD6', '#E0533A', '#F2B632', '#1E9E7A', '#7A4FD0', '#E8E2D0', '#D23C6E', '#2BB3C9'].map(h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
const CROWD = ['#3B4A72', '#5A3F63', '#6B4B3A', '#355E63', '#7A3A4A', '#4C5A3A', '#6A6F86', '#8A6A3E', '#2F3B5E', '#583A3A'].map(h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
const SKIN_DIM = [[120, 86, 66], [92, 64, 50], [150, 112, 86]];

const U0 = -4.5, TIER_A = 0.5, TIER_B = 8, WALL = 10, TIERS = 9;
const B_BOARD = -108, BOARD_H = 11;

/**
 * Background for one frame. crowd: 0..1 excitement (flicker density); t: video time (crowd flicker clock).
 */
export function drawWorld(P, cam, t, crowd = 0.3) {
  const b = P.buf, fl = Math.floor(t * 7);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const X = x + cam.x, Y = y + cam.y, A = X + Y, B = Y - 2 * X;
      let c;
      if (B >= 0 && B < 720) {                                         // ---- the track ----
        const m = B % 36;
        if (m < 2 || B >= 718) c = C.line;
        else if (A >= -2 && A <= 0) c = C.line;                            // start line
        else if (A >= 1196 && A <= 1200) c = C.white;                      // finish line (bold)
        else if (A > 1200 && A <= 1209) c = (((A - 1201) / 3 | 0) + (B / 6 | 0)) & 1 ? C.black : C.white;   // checker strip
        else if (A > 0 && A < 1200 && A % 120 >= 118 && (m < 6 || m > 32)) c = C.line;   // 10 m cross-marks at each lane line
        else if (A >= -15 && A <= -6 && ((m >= 10 && m <= 15) || (m >= 21 && m <= 26))) c = A >= -8 ? C.block2 : C.block;   // starting blocks
        else { const n = ih(X, Y); c = n > 0.9 ? C.track2 : n < 0.05 ? C.track3 : C.track; }
      } else if (B >= 720) {                                              // ---- near side: apron, kerb, infield ----
        if (B < 756) { const n = ih(X, Y, 3); c = n > 0.88 ? C.apron2 : C.apron; }
        else if (B < 762) c = C.kerb;
        else { const s = (Math.floor(A / 60) & 1) ? C.grass : C.grass2; c = ih(X, Y, 5) > 0.93 ? C.grass3 : s; }
      } else if (B >= B_BOARD) {                                          // ---- far apron ----
        const n = ih(X, Y, 7); c = n > 0.9 ? C.apron2 : C.apron;
        if (B < -96 && bayer(X, Y) < 0.5) c = shade(C.apron, 0.7);        // board shadow on the apron
      } else if (B > B_BOARD - BOARD_H) {                                 // ---- LED boards standing on the apron edge ----
        const h = B_BOARD - B, Af = A + h, seg = Math.floor(Af / 72);
        const k = (seg + Math.floor(t * 0.8)) % LED.length;               // slow colour cycle (an LED wall, no logos)
        c = LED[(k + LED.length) % LED.length];
        if (h === BOARD_H - 1) c = shade(c, 1.15).map(v => Math.min(255, v));
        else if (h < 2) c = shade(c, 0.55);
        else if ((ih(seg, 9) > 0.5) && ((Af >> 2) & 1)) c = shade(c, 0.78);
        if (Af % 72 < 2) c = C.ink;
      } else {
        const q = -B + B_BOARD - BOARD_H;                                // 0 at the board top line, grows into the stands
        if (q < 54 - BOARD_H) { const n = ih(X, Y, 11); c = n > 0.85 ? C.walk2 : C.walk; }   // walkway between boards and stands
        else {
          const qq = q - (54 - BOARD_H);
          if (qq < WALL) c = qq < 2 ? C.slate2 : C.navy2;                // front wall of the stands
          else {
            const k = (qq - WALL) / (36 * TIER_A + TIER_B), tier = Math.floor(k), f = k - tier;
            if (tier < TIERS) {
              const dS = (X + 12 * (U0 - TIER_A * k)) / 4, cell = Math.floor(dS / 0.5), fade = tier / TIERS;
              if (f < 0.3) c = f < 0.08 ? C.navy3 : C.navy;                // riser
              else {
                const r = ih(cell, tier, 1);
                if (r < 0.12) c = C.navy2;                                  // empty seat
                else if (f > 0.74) c = (cell & 1) ? C.navy : SKIN_DIM[(r * 30 | 0) % 3];   // heads
                else c = CROWD[(r * 97 | 0) % CROWD.length];
                if (ih(cell, tier, fl) > 0.997 - 0.012 * crowd && f > 0.5) c = C.cream;   // phone flashes / waving
              }
              if (fade * 0.7 > bayer(X, Y)) c = C.night;                   // upper tiers sink into the dark
            } else {
              const top = (k - TIERS) * (36 * TIER_A + TIER_B);             // px above the last tier: roof edge, then sky
              if (top < 3) c = C.slate; else if (top < 7) c = C.navy2;
              else {
                c = C.ink;
                // floodlight glow: a soft amber haze rising from the lamp rows at the stand roof (world-anchored dither)
                const lamp = Math.abs(((X + 12 * U0) / 4) % 40 + 40) % 40 - 20, gl = Math.max(0, 0.45 - top / 90) * Math.exp(-(lamp * lamp) / 60);
                if (gl > bayer(X, Y)) c = C.navy3;
                if (top < 13 && Math.abs(lamp) < 3 && (X & 1)) c = top < 10 ? C.cream : C.amber;   // lamp banks
              }
            }
          }
        }
      }
      const o = (y * W + x) * 4; b[o] = c[0]; b[o + 1] = c[1]; b[o + 2] = c[2]; b[o + 3] = 255;
    }
  }
}

/** distance boards "10 m" … "90 m" on the far apron (camera-facing signs on a post) */
export function drawDistanceBoards(P, cam) {
  for (let k = 1; k <= 9; k++) {
    const [sx, sy] = toScreen(cam, 10 * k, -1.7), x = Math.round(sx), y = Math.round(sy);
    if (x < -30 || x > W + 30 || y < -30 || y > H + 30) continue;
    if (y - 16 < 72) continue;                                        // not drawn under the headline block (it is dark there anyway)
    const s = `${10 * k}m`, w = 3 + 1 + 3 + 1 + 5 + 4;
    P.rect(x, y - 6, 1, 6, C.slate2);
    P.rect(x - w / 2 | 0, y - 16, w, 10, C.ink); P.rect((x - w / 2 | 0) + 1, y - 15, w - 2, 8, C.navy2);
    pixText(P, s, (x - w / 2 | 0) + 2, y - 14, C.cream);
  }
}
