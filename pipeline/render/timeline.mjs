// Timeline v1 reader: scenes, sentences, captions and time references shared by picture and sound.
// The same reference grammar is implemented in pipeline/audio/sfx.py (resolve_at) — keep them in sync.
import fs from 'node:fs';
import {clamp} from './draw.mjs';

/**
 * Time reference grammar ("at"):
 *   12.0                       absolute seconds
 *   "s05"                      start of sentence s05          "s05:end" → its end
 *   "hook"                     start of scene hook            "hook:end" → its end, "hook:mid" → midpoint
 *   ["s05", 0.4]               reference + offset seconds (offset may be negative)
 *   {"sentence":"s05","word":"결합","offset":0.1}   start of the first spoken char of that word (chars[] alignment)
 *   {"scene":"hook","p":0.5,"offset":0}             fraction of the scene
 */
export class Timeline {
  constructor(data, file = null) {
    if (!data || data.schema_version !== 1) throw new Error(`timeline${file ? ' ' + file : ''}: schema_version must be 1`);
    for (const k of ['duration', 'scenes', 'sentences']) if (data[k] == null) throw new Error(`timeline: missing "${k}"`);
    Object.assign(this, data);
    this.file = file;
    this.captions = data.captions || data.sentences.map(s => ({sentence: s.id, text: s.text, start: s.start, end: s.end}));
    this._sent = new Map(this.sentences.map(s => [s.id, s]));
    this._scene = new Map(this.scenes.map((s, i) => [s.id, {...s, index: i}]));
    this.problems = checkTimeline(this);
  }
  isDegraded() { return !!this.degraded; }
  scene(id) { const s = this._scene.get(id); if (!s) throw new Error(`unknown scene "${id}"`); return s; }
  sentence(id) { const s = this._sent.get(id); if (!s) throw new Error(`unknown sentence "${id}"`); return s; }

  /** → {scene, id, index, p (0..1 within scene), local (seconds since scene start), start, end, duration} */
  sceneAt(t) {
    const tt = clamp(t, 0, this.duration);
    let i = this.scenes.findIndex(s => tt >= s.start && tt < s.end);
    if (i < 0) i = tt < this.scenes[0].start ? 0 : this.scenes.length - 1;
    const scene = this.scenes[i], d = Math.max(1e-6, scene.end - scene.start);
    return {scene, id: scene.id, index: i, p: clamp((tt - scene.start) / d), local: tt - scene.start, start: scene.start, end: scene.end, duration: d};
  }
  /** Active spoken sentence at t, or null in pauses. → {sentence, id, p, local} */
  sentenceAt(t) {
    const s = this.sentences.find(x => t >= x.start && t < x.end);
    return s ? {sentence: s, id: s.id, p: clamp((t - s.start) / Math.max(1e-6, s.end - s.start)), local: t - s.start} : null;
  }
  /** Most recent sentence started at or before t (useful in gaps). */
  lastSentence(t) { let r = null; for (const s of this.sentences) if (s.start <= t) r = s; return r; }

  /** Resolve any reference (see grammar above) to absolute seconds. at('s05', 0.4) also works. */
  at(ref, offset = 0) {
    if (typeof ref === 'number') return ref + offset;
    if (Array.isArray(ref)) return this.at(ref[0], (ref[1] || 0) + offset);
    if (ref && typeof ref === 'object') {
      if (ref.sentence && ref.word) return this.wordStart(ref.sentence, ref.word) + (ref.offset || 0) + offset;
      if (ref.scene) { const s = this.scene(ref.scene); return s.start + (ref.p ?? 0) * (s.end - s.start) + (ref.offset || 0) + offset; }
      if (ref.sentence) return this.at(ref.sentence, (ref.offset || 0) + offset);
      throw new Error(`bad time reference ${JSON.stringify(ref)}`);
    }
    const [id, edge = 'start'] = String(ref).split(':');
    const s = this._sent.get(id) || this._scene.get(id);
    if (!s) throw new Error(`time reference "${ref}": no sentence or scene with id "${id}"`);
    const v = edge === 'start' ? s.start : edge === 'end' ? s.end : edge === 'mid' ? (s.start + s.end) / 2 : NaN;
    if (Number.isNaN(v)) throw new Error(`time reference "${ref}": edge must be start|end|mid`);
    return v + offset;
  }
  /** Start time of the first spoken character of `word` inside sentence `sid` (uses chars[] alignment). */
  wordStart(sid, word) {
    const s = this.sentence(sid), chars = s.chars || [];
    const joined = chars.map(c => c.c).join(''), i = joined.indexOf(word);
    if (i < 0) {
      const j = chars.filter(c => c.c.trim()).map(c => c.c).join('').indexOf(word.replace(/\s+/g, ''));
      if (j < 0) throw new Error(`word "${word}" not found in chars of ${sid}`);
      return chars.filter(c => c.c.trim())[j].start;
    }
    return chars[i].start;
  }
  /** 0..1 progress of t between two references (clamped). */
  progress(t, from, to) { const a = this.at(from), b = this.at(to); return b === a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a)); }

  /** Caption cue active at t: shown from start until min(next.start, end + hold). → {cue, index, age} | null */
  captionAt(t, hold = 0.15) {
    const cs = this.captions;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i], until = Math.min(i + 1 < cs.length ? cs[i + 1].start : Infinity, c.end + hold);
      if (t >= c.start && t < until) return {cue: c, index: i, age: t - c.start, remaining: until - t};
    }
    return null;
  }

  /**
   * Convert an event spec list into absolute times, sorted. Each item keeps its fields and gains `time`.
   * The returned array has helpers: get(id), age(id,t), pulse(id,t,dur=0.6), active(t,dur).
   */
  events(spec = []) { return makeEvents(spec.map(e => ({...e, time: this.at(e.at ?? e.time ?? 0)}))); }
}

export function makeEvents(list) {
  const E = [...list].sort((a, b) => a.time - b.time);
  const byId = new Map(); for (const e of E) if (e.id != null) { if (!byId.has(e.id)) byId.set(e.id, []); byId.get(e.id).push(e); }
  const def = (k, v) => Object.defineProperty(E, k, {value: v, enumerable: false});
  def('get', id => { const l = byId.get(id); if (!l) throw new Error(`unknown event "${id}"`); return l[0]; });
  def('all', id => byId.get(id) || []);
  def('has', id => byId.has(id));
  /** seconds since the event (negative before it) */
  def('age', (id, t) => t - E.get(id).time);
  /** 1 at the event, decaying to 0 over dur (0 before); good for flashes */
  def('pulse', (id, t, dur = 0.6) => { const a = t - E.get(id).time; return a < 0 || a > dur ? 0 : 1 - a / dur; });
  /** 0 before, ramps to 1 over dur after the event; good for 'after this happened' states */
  def('after', (id, t, dur = 0.4) => clamp((t - E.get(id).time) / dur));
  def('active', (t, dur = 0.6) => E.filter(e => t >= e.time && t < e.time + (e.dur ?? dur)));
  return E;
}

export function checkTimeline(tl) {
  const p = [], eps = 1e-3;
  if (Math.abs(tl.scenes[0].start) > eps) p.push('first scene does not start at 0');
  if (Math.abs(tl.scenes.at(-1).end - tl.duration) > eps) p.push('last scene does not end at duration');
  for (let i = 1; i < tl.scenes.length; i++) if (Math.abs(tl.scenes[i].start - tl.scenes[i - 1].end) > eps) p.push(`scenes ${tl.scenes[i - 1].id}/${tl.scenes[i].id} not contiguous`);
  for (const s of tl.sentences) if (!(s.end > s.start)) p.push(`sentence ${s.id} has end <= start`);
  for (let i = 1; i < tl.captions.length; i++) if (tl.captions[i].start < tl.captions[i - 1].end - eps) p.push(`captions ${i - 1}/${i} overlap`);
  return p;
}

export function loadTimeline(file, {strict = true} = {}) {
  if (!fs.existsSync(file)) throw new Error(`timeline not found: ${file}\n(run the narrate step first: python pipeline/narration/narrate.py --script … --out …)`);
  const tl = new Timeline(JSON.parse(fs.readFileSync(file, 'utf8')), file);
  if (tl.problems.length) { const msg = `timeline problems in ${file}:\n - ${tl.problems.join('\n - ')}`; if (strict) throw new Error(msg); console.warn(msg); }
  if (tl.isDegraded()) console.warn(`WARNING: timeline is marked degraded (${tl.voice || 'voice?'}); finish.py will refuse without --allow-degraded.`);
  return tl;
}
