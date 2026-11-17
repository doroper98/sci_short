# Men's 100 m, all-time top 20 — one race

A standalone 18.5-second vertical data-visualisation video (1080×1920, 30 fps, English, no narration). It is **not** part of
the Korean science-shorts series and follows none of its episode rules; it only reuses the repo's render tooling
(`pipeline/render`: stage, fonts, `renderVideo`) and the pixel-layer approach of `samples/look-proposal-pixel/`.

- Video: [sprint-100m-top20.mp4](sprint-100m-top20.mp4) · poster (frame 0): [poster.jpg](poster.jpg) · contact sheet of 12 moments: [stills.jpg](stills.jpg)

## The request (2026-11-17, translated)

"A 3D-feel pixel animation of a 100 m sprint on a track that runs from the top-left to the bottom-right, with characters
racing: the 20 runners holding the 1st to 20th fastest times ever. Show each one's flag, time and year. Probably a short
video. English." The reference the user mentioned (every Olympic 100 m freestyle champion swimming in one pool at his
official time) was not liked for its look; only its idea is kept: **everyone races together at his real time**.

## What is on screen

Twenty men on one 20-lane track, seen obliquely, at night under floodlights. Bolt (No. 1) runs in the lane nearest the
camera, No. 20 in the farthest. Each carries a tag `[flag] SURNAME time year` for the whole video (added 2026-11-17 after the user watched the first version: "이름도 추가 해야지~" — "add the names as well"). Surnames are in capitals; the two Thompsons are "K. THOMPSON" and "R. THOMPSON" (first initial only when a surname is shared). Inside the pill: flag 30×20, name 20 px bold off-white, time 22 px bold in the clock's gold, year 19 px muted grey; pill 28 px high. The widest tag (K./R. THOMPSON) is 298 px. A race clock, a 0–100 m bar
and a badge (SET / REAL TIME / FREEZE / SLOW MOTION) sit at the top.

| video time | what happens |
|---|---|
| 0.00–0.70 | camera glides 2.5 m onto the start line; runners in "set"; headline, clock 0.00 and all tags already visible |
| 1.00 | gun; 1.00–10.58 the race in real time (clock = video time − 1.00) |
| 10.58–11.18 | freeze on Bolt's finish: 2-frame flash, his tag turns gold with a "WR" chip, a bracket shows the gap of No. 20 (**2.8 m**, computed) |
| 11.18–13.58 | slow motion ×0.1 while the other nineteen cross (clock keeps running slowly); each tag flashes as its runner crosses |
| 13.58–14.1 | the playback rate ramps from ×0.1 to ×0.45 as they run through |
| 14.1–14.7 | scene dims to ~30 %, the results board cascades in (30 ms per row); held to 18.5, last 0.3 s fade to black |

## Data

All labels, the race and the board come from one file, [data.json](data.json):
World Athletics all-time list, men's 100 m, best legal mark per athlete, **read 2026-11-17** (the list was verified that day
by the person who commissioned this; ties ordered by date as World Athletics orders them). Shared places print as
"2=", "7=", "10=", "13=", "16=", "18=".

**The tie at 18th.** Four men share 18th at 9.82: Richard Thompson (TTO, 2014), Akani Simbine (RSA, 2024),
Bryan Levell (JAM, 2025) and Courtney Lindsey (USA, 2025-08-01, Eugene). Lindsey is the 21st name on the list, so he is not
in the race — the video shows the first 20 rows. He is recorded in `data.json` as `also_tied`, and the board's footnote says
"Four men share 18th at 9.82 — the first 20 on the list are shown."

## Pace model (stated on screen as "Pace profile: Bolt's 2009 splits scaled to each time")

- Shape: Bolt's 9.58 in Berlin, 2009-08-16, from the IAAF/DLV biomechanics project **as widely reported**: reaction 0.146 s,
  cumulative times at 10…100 m = 1.89, 2.88, 3.78, 4.64, 5.47, 6.29, 7.10, 7.92, 8.75, 9.58 s. The first 60 m and the total
  were confirmed against secondary sources on 2026-11-17, **not against the primary report**; 70–90 m are as given in the brief.
- S(t) = Bolt's distance at race time t: a monotone cubic (Fritsch–Carlson PCHIP) through (0.146 s, 0 m, zero slope) and the
  ten split points. Athlete i is at `S(t · 9.58 / T_i)`, so he covers 100 m in exactly his time T_i. Reaction time scales
  with the same factor (0.146 → 0.149 s for a 9.82) — a simplification.
- After the line each man keeps his final speed (Bolt: 12.05 m/s from the curve's end slope) and slows at a gentle
  1.4 m/s².
- This is a model, not a record of how each man actually ran his race: everyone gets Bolt's *shape*, scaled.
- `test_model.mjs` (`node --test`) asserts: every athlete is at 100.000 m (±1 mm) at his time; the curve passes every split;
  S is monotone with non-negative speed (0–14 s); after 1 s the order always follows the rank (ties run level); the video
  clock maps every crossing back to the listed time; the rank labels; the 20 tag names are unique and each is the athlete's own surname (with initial only if shared). It prints the gap of No. 20 when Bolt finishes:
  **2.821 m** (No. 2= Gay: 1.310 m). The bracket's "2.8 m" is that computed value.

## Not to scale across the track

Along the track the picture is to scale (1 m = 4 + 8 buffer px). Across it, lanes are drawn far wider than 1.22 m and the
runners about twice as tall as scale (31 buffer px ≈ 93 screen px), so the twenty tags and bodies stay legible. Distances
along the track — gaps, the 2.8 m wedge, the 10 m marks and boards — are true to the model.

## How it is built

| file | role |
|---|---|
| `data.json` | the 20 athletes, source, `also_tied`, the pace profile |
| `timeline.json` | video-time constants shared by picture and sound |
| `model.mjs` | pace curve S(t), tag names (`tagName`), each athlete's distance/speed/step phase, video clock ↔ race time, camera |
| `px.mjs` | 360×640 pixel buffer, Bayer dither, integer hash, ×3 nearest-neighbour upscale (adapted from `look-proposal-pixel`) |
| `world.mjs` | ground mapping and the stadium, drawn per pixel from integer world coordinates (track, lane lines, 10 m marks, blocks, finish + checker, aprons, LED boards, stands with flickering crowd, floodlight haze, grass); distance boards in a 3×5 pixel font |
| `runner.mjs` | procedural 3D skeleton driven by a run-cycle phase, projected and rasterised with a 1-px outline; kits; ground shadow |
| `flags.mjs` | six flags as crisp vector shapes (JAM, USA, KEN, ITA, TTO, RSA; simplified — USA has 7 stripes at this size) |
| `scene.mjs` | per-frame state, picture, tags (`TAG_FONT`, `TAG_GAP`, `TAG_DX`),  clock, bar, finish flash, gap bracket, results board |
| `run.mjs` | `video OUT.mp4`, `stills PREFIX --t=…`, `events [OUT.json]`, `check` (every frame: tag/tag and tag/limb overlaps, safe area) |
| `sound.py` | numpy-only sound from `events.json` |
| `events.json` | generated by `node run.mjs events` (crossing times, 907 foot strikes, race time per frame) — input to `sound.py` |
| `build.sh` | tests → check → events → picture → sound → mux → poster + contact sheet → ffprobe |
| `test_model.mjs` | model tests |

Geometry: one metre along the track = (+4, +8) buffer px, one lane across = (−12, +12); the camera moves only along the
track by whole buffer pixels (`off = round(4·d)`, shift `(off, 2·off)`), and every background texture and dither is a
function of integer world coordinates, so the scenery moves rigidly.

Rebuild (from the repo root, with `pipeline/render` node_modules and fonts installed — `python pipeline/render/fetch_fonts.py`):

```bash
samples/sprint-100m-top20/build.sh            # ~45 s; writes sprint-100m-top20.mp4, poster.jpg, stills.jpg, events.json
node --test samples/sprint-100m-top20/test_model.mjs
node samples/sprint-100m-top20/run.mjs stills /tmp/s --t=0,5,10.7   # /tmp/s_0.png …
```

Output: H.264 High, yuv420p, 30 fps, CRF 18; AAC-LC 192 kb/s, 48 kHz stereo; `+faststart`; 18.500 s video and audio;
17.6 MB.

## Sound (no music, no voice)

Hushed crowd bed → starting gun at 1.00 (noise crack + low pitch-dropping thump) → crowd roar swelling through the race with
a light patter of footfalls (every foot strike of every runner from the model, panned by lane) → at Bolt's finish a two-click
camera shutter and the bed turning darker (lower cut-off, steeper tilt, a low rumble) for the freeze and slow motion, a soft
blip at each crossing (20 crossings at 11 distinct instants; runners crossing at the same instant share one blip, 1/√n each)
→ a short whoosh and a two-note chime (E5, B5) as the board lands. Last 0.3 s faded.
Numbers from the last build: 18.500 s, 48 kHz stereo, peak −1.94 dBFS, 0 clipped samples; mono RMS ≈ −41 dBFS before the
gun, −24 dBFS in the gun's half-second, rising −32 → −20 dBFS through the race, ≈ −30 dBFS in the freeze, −20 dBFS as the
board lands, then down to −41 dBFS. **Nobody has listened to it** — it was checked only numerically.

## What was checked by eye, and what was not

Checked by looking at rendered stills (12-moment contact sheet, full-size frames at 0, 1.2, 2.5, 5, 10.7, 12.8, 13.6, 14.8,
15.5, a 320-px-wide copy of the poster, zoomed crops, 8 consecutive frames at 8.0–8.23 s, a 16-pose run-cycle sheet):

- Frame 0 reads as a diagonal of twenty crouched sprinters under the headline, with the staircase of tags; at 320 px the
  figures in "set" are small blobs — readable as a line of athletes, not as detailed people (acceptable, not great).
- Mid-race the figures read as runners (knee lift, heel kick, arm swing; 8 consecutive frames step through the cycle); they
  overlap each other heavily on the diagonal, and arms are small and dark.
- `node run.mjs check` over every frame until the board (with the name tags): no tag–tag overlap (min gap 3.3 px), no
  tag–limb overlap (min gap 2.7 px, tested against each limb's box), all tags inside x 40–940, y 120–1500 (leftmost tag
  edge 42.3 px: Bolt's at t = 0.57; rightmost 940.0 px: Levell's, clamped). Furthest limb box reaches x 1023 px — inside the frame.
- The finish wedge and the 2.8 m bracket are visible at the freeze; the board matches `data.json` including "=" ranks.
- Background rigidity: after shifting by the camera step, 0 background pixels differ between consecutive frames (80 frame
  pairs tested), so lane lines and stands cannot shimmer. The camera moves in whole buffer pixels (1–2 per frame at full
  speed, i.e. 3 or 6 screen px), which may read as a slight judder at top speed — not checked in motion on a phone.

Not checked: the sound by ear; playback on a phone (size of the tags, judder, how platform UI overlaps); whether every flag
is recognisable at 30×20 px to viewers from those countries (they were judged recognisable here); the 70–90 m splits and
the primary biomechanics report.

## Deviations from the brief (and why)

- **Body projection**: the brief asked for limbs projected with the track's forward vector (1,2)/√5. That vector is 63°
  below horizontal, nearly opposite to "up", so strides and knee lifts collapsed into vertical sticks (seen in the first
  render). The body's own forward axis is drawn 25° below horizontal instead (`BODY_FWD_DEG` in `runner.mjs`) — a 3/4 view
  of the figures. Their ground point still moves exactly along the track.
- **Tag offset**: right edge 26 px (not 8) left of the runner's centre, bottom 6 px above his highest head top (31 buffer
  px, including the running bob). With 8 px the kicked heel of the man just behind clipped the leader's tag (found by the
  overlap check).
- **Anchor**: lane 19 sits at screen (279, 1434), 63 px right of the brief's (216, 1434): +12 px in the first version so
  Bolt's tag kept ≥ 40 px from the left edge, then +51 px when the tags got surnames (the measured need was 48.7 px; the
  camera works in whole buffer pixels of 3 screen px, so 17 buffer px = 51). The two or three farthest runners' bodies
  now sit in the right 140 px (up to x ≈ 1010–1023 incl. outline), fully inside the frame; no text there. Most of the
  stands are now off the right edge.
- **Right clamp of tags**: the lane fan is 684 px wide and Bolt's tag is ~207 px, leaving ~9 px of slack between x 40 and
  940, less than the push-in (30 px) and early-race camera lag. So a tag's right edge is clamped at x 940: during the
  push-in and the first ~2.5 s the farthest tags (Levell, at most 24 px) slide left instead of following their runner
  exactly. Nearer runners' heads are ≥ 42 px below those tags, and the overlap check passes on every frame.
- **Push-in**: 2.5 m, not ~6 m — with 6 m Bolt would start frame 0 inside the bottom 420 px.
- **Freeze**: 0.6 s (10.58–11.18) instead of 0.4 s so the gap can be read; slow motion, run-out and board shift by 0.2 s
  (slow motion ends 13.58, board 14.1–14.7); total still 18.5 s.
- **At the freeze** Bolt is on the line at the anchor; the camera then eases forward during the slow motion and rests with
  the finish line 1.5 m short of the anchor.
- **Badge**: also reads "SET" before the gun and "FREEZE" during the freeze. The "WR" chip sits on the tag's top-right
  corner (inside it, it pushed the tag off the left edge).
- **Board**: the top kicker and the runner tags fade out as the board comes in (the kicker repeated the board title);
  footnote split into three lines on a dark panel (one line at ≥ 22 px did not fit 880 px). Names print as "Usain BOLT".
- **Run-out**: after the last crossing the rate ramps ×0.1 → ×0.45 (still slow; the badge stays "SLOW MOTION").

## Suggested upload text (English, not uploaded anywhere)

**Title:** The 20 fastest men in history, in one 100 m race

**Description:**
What if the 20 fastest 100 m sprinters of all time ran in the same race? Each man runs his personal best (wind-legal), from
Usain Bolt's 9.58 world record to the four men tied at 9.82.
When Bolt crosses the line, No. 20 is still 2.8 m behind.
Data: World Athletics all-time list, men's 100 m, best mark per athlete (read Nov 2026). Four men share 18th at 9.82; the
first 20 on the list are shown. Pace model: Bolt's 2009 Berlin split profile scaled to each athlete's time — an
illustration, not a record of each race. Lanes and runners are not to scale across the track.
#athletics #100m #sprint #UsainBolt #dataviz #pixelart
