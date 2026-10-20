# One Sun. Two Colors.

User request: an English-narrated, English-subtitled science animation under two minutes explaining why the high Sun can appear white while the setting Sun appears orange/red.

## Current delivery status

The current deliverable is a **103.14-second visual preview**, with English on-screen captions, original background music, and explanatory sound. **English narration is not yet present**: the environment proxy denies Hugging Face model downloads (CONNECT 403). The narrator script and final assembly workflow are ready, but require approved network access or an explicitly authorized alternative voice. Caption timing in this preview is provisional and will be regenerated from actual speech.

## Explanation and visual approach

The Sun's visible light has a broad spectrum. Molecular (Rayleigh) scattering redirects shorter wavelengths more strongly. A high Sun has a shorter atmospheric path; a low Sun has a longer path, so direct sunlight loses proportionally more blue and violet. The remaining direct beam is richer in red/orange. Scattered skylight is distinct from the direct solar disk. Blue light is not converted into red light.

The film progresses from a landscape observation to separated wavelength components, a molecular close-up, an illuminated globe with a fixed observer, and a sound comparison. Geometry, highlights, wave traces, moving packets, atmospheric branches, and the received spectrum are animated. The globe uses Natural Earth land outlines; lighting, clouds, terrain silhouettes, molecules, and all animation are original procedural graphics.

The user's English-language request overrides the repository's Korean-language default for this episode. The intended narrator remains Supertonic 3 M3, speed 0.95, 16 steps. The Korean `니다` final-fall rule is inapplicable to English. Sentence-level captions use actual individually synthesized clip boundaries; they are not word-level forced alignment.

## Model and limitations

- Relative optical air mass uses Kasten & Young (1989): `1 / (sin(h) + 0.50572 * (h + 6.07995)^-1.6364)`, with apparent solar elevation `h` in degrees.
- Wavelength-dependent transmission uses an illustrative molecular optical depth: `exp(-0.1 * (550 / wavelength_nm)^4 * air_mass)`. This is a teaching model, not a measured sunset.
- Six wavelength samples stand in for the broad visible spectrum. Display RGB is an illustrative normalization of three transmission samples, not a colorimetrically calibrated solar rendering.
- Atmospheric shell thickness, molecular size, wave amplitude, and travel times are exaggerated. The shell drawing and the optical air-mass formula use different scales; the enlarged drawing is not used to calculate a physical distance.
- The model omits a full spectral solar distribution, aerosol/cloud transfer, ozone, multiple scattering, refraction, and eye/camera adaptation. The film acknowledges that dust, haze, and clouds change the exact colors. The high Sun is described as “can look almost white,” not always perfectly white.
- No claim is made that molecules change blue photons into red photons or that only red light survives.

## Sound

`model.mjs` exports a common event list for molecular flashes and corresponding soft audio transients. In the dedicated listening sequence, six fixed musical notes represent the six colors; each note's amplitude uses the same wavelength transmission as the visual. Notes do not change frequency when colors attenuate. The film explicitly explains that these are representational tones and light itself is not audible.

The short-path chord and long-path chord are played during pauses after their explanations. The original ambient score is quiet and reduced further during these comparisons. No reference-video music or audio is reused.

## Reproduce

Requirements: Node.js, Python 3.12+, FFmpeg, DejaVu fonts. On this workspace:

```bash
cd /workspace/sci_short/samples/sunlight-color
npm ci --cache /workspace/.cache/npm --ignore-scripts
python -m venv /workspace/.venv-sunlight
/workspace/.venv-sunlight/bin/pip install -r requirements.txt
/workspace/.venv-sunlight/bin/python make_globe.py
/workspace/.venv-sunlight/bin/python narrate.py
node model.mjs --validate
node render.mjs
/workspace/.venv-sunlight/bin/python sound.py
node render.mjs --video --sample
node render.mjs --video
/workspace/.venv-sunlight/bin/python finish.py
```

`narrate.py` downloads the pinned model revision using the configured HTTPS proxy, verifies every model asset against the existing reference hashes, and refuses a different voice or unchecked fallback. Models remain ignored under `models/`. A blocked Hugging Face host must be enabled through environment settings; the script does not bypass network policy.

Until narration exists, the renderer can generate design previews with provisional caption times. `finish.py` refuses to call such a preview a completed narrated movie. Outputs go to `outputs/sunlight-color/`.

## References and provenance

- User-provided sky/sunset reference: [`references/videos/03-sky-and-sunset.mp4`](../../references/videos/03-sky-and-sunset.mp4), analyzed in [`REFERENCE_ANALYSIS.md`](../../docs/REFERENCE_ANALYSIS.md).
- User-provided thunder reference informed the shared visual/sound timeline, not this episode's physics.
- Kasten, F. & Young, A. T. (1989), “Revised optical air mass tables and approximation formula,” *Applied Optics* 28, 4735–4738, DOI: `10.1364/AO.28.004735`.
- NASA Space Place, [Why is the sky blue?](https://spaceplace.nasa.gov/blue-sky/en/), further reading. This page was not retrieved in the initial production session because the environment proxy denied the host.
- Natural Earth, public-domain [1:110m land geometry](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_land.geojson), downloaded 2026-10-20 into `assets/land.geojson`. Local SHA-256 is recorded in `provenance.json`.
- Voice reference and model revision: [`config/voice-reference.json`](../../config/voice-reference.json).

Visual inspection, encoded-file checks, direct listening, and physical phone playback are recorded separately. Automatic checks do not establish narration pronunciation or perceptual audio quality.
