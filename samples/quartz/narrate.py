"""Pinned Supertonic 3 M3 Korean narration, with actual clip times for subtitles."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import shutil
import numpy as np
import soundfile as sf
import sherpa_onnx

BASE=Path(__file__).resolve().parent
ROOT=BASE.parents[1]
OUT=ROOT/"outputs/quartz"
MODEL=Path(os.environ.get("QUARTZ_TTS_MODEL", "/workspace/models/supertonic-sherpa/sherpa-onnx-supertonic-3-tts-int8-2026-05-11"))
REF=json.loads((ROOT/"config/voice-reference.json").read_text())["synthesis"]

def assets():
    """Validate the separately pinned upstream INT8 release; retain original reference hashes."""
    manifest=json.loads((BASE/"assets/voice-model.json").read_text())
    for rel,expected in manifest["sha256"].items():
        dest=MODEL/rel
        if not dest.is_file() or hashlib.sha256(dest.read_bytes()).hexdigest()!=expected:
            raise ValueError(f"Missing or mismatched converted model asset: {rel}")

def stamp(t):
    ms=round(t*1000);return f"{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}"

def main():
    assets()
    OUT.mkdir(parents=True,exist_ok=True)
    cache=OUT/'voice-cache';cache.mkdir(exist_ok=True)
    for meta in OUT.glob('voice-*.json'):
        old=OUT/(meta.stem+'.wav')
        if old.exists():
            old_key=json.loads(meta.read_text()).get('key')
            if old_key and not (cache/(old_key+'.wav')).exists():shutil.copyfile(old,cache/(old_key+'.wav'))
    cfg=sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(
        supertonic=sherpa_onnx.OfflineTtsSupertonicModelConfig(
            duration_predictor=str(MODEL/"duration_predictor.int8.onnx"),
            text_encoder=str(MODEL/"text_encoder.int8.onnx"),
            vector_estimator=str(MODEL/"vector_estimator.int8.onnx"),
            vocoder=str(MODEL/"vocoder.int8.onnx"),
            tts_json=str(MODEL/"tts.json"),unicode_indexer=str(MODEL/"unicode_indexer.bin"),voice_style=str(MODEL/"voice.bin")),
        debug=False,num_threads=4,provider="cpu"))
    assert cfg.validate()
    tts=sherpa_onnx.OfflineTts(cfg)
    assert tts.num_speakers==10
    sr=tts.sample_rate
    gen=sherpa_onnx.GenerationConfig();gen.sid=7;gen.num_steps=16;gen.speed=.95;gen.extra["lang"]="ko"
    data=json.loads((BASE/"script.json").read_text());pieces=[];segments=[];cursor=1.2
    pieces.append(np.zeros(round(cursor*sr),dtype=np.float32))
    for i,s in enumerate(data["segments"]):
        f=OUT/f"voice-{i:02}.wav"
        chunks=s.get('spoken_chunks',[s['text']])
        key=hashlib.sha256(('\x1e'.join(chunks)+"M3:ko:.95:16:sherpa-int8-2026-05-11").encode()).hexdigest()
        meta=OUT/f"voice-{i:02}.json"
        cached=cache/(key+'.wav')
        if cached.exists():
            wav,rs=sf.read(cached,dtype="float32");assert rs==sr
        else:
            np.random.seed(int(hashlib.sha256((s["text"]+"v1").encode()).hexdigest()[:8],16))
            parts=[]
            for j,spoken in enumerate(chunks):
                audio=tts.generate(spoken,gen);assert audio.sample_rate==sr
                parts.append(np.asarray(audio.samples,dtype=np.float32))
                if j<len(chunks)-1:parts.append(np.zeros(round(.22*sr),dtype=np.float32))
            wav=np.concatenate(parts)
            assert len(wav)>sr*.3 and np.isfinite(wav).all()
            # Remove only edge silence, preserving consonants with 70 ms of padding.
            nonzero=np.where(np.abs(wav)>.003)[0]
            if len(nonzero):wav=wav[max(0,nonzero[0]-round(.07*sr)):min(len(wav),nonzero[-1]+round(.10*sr))]
            sf.write(cached,wav,sr,subtype="PCM_16")
        sf.write(f,wav,sr,subtype='PCM_16')
        meta.write_text(json.dumps({"key":key,"text":s["text"],"spoken_chunks":chunks,"duration":len(wav)/sr},ensure_ascii=False))
        length=len(wav)/sr
        segments.append({**s,"index":i,"start":cursor,"end":cursor+length})
        pieces.extend([wav,np.zeros(round(s["gap"]*sr),dtype=np.float32)])
        cursor+=(len(wav)+round(s["gap"]*sr))/sr
        print(f'{i+1}/{len(data["segments"])}: {length:.2f}s',flush=True)
    pieces.append(np.zeros(round(.6*sr),dtype=np.float32))
    full=np.concatenate(pieces)
    # Only global gain; no time compression or pitch substitution.
    peak=float(np.max(np.abs(full)));full*=.8/max(peak,1e-6)
    sf.write(OUT/"narration.wav",full,sr,subtype="PCM_24")
    tl={"duration":len(full)/sr,"provisional":False,"language":"ko","voice":"Supertonic 3 M3","sid":7,"speed":.95,"steps":16,"model_revision":"sherpa-onnx-supertonic-3-tts-int8-2026-05-11","model_variant_note":"Upstream INT8 conversion; preserves M3 preset, not byte-identical to the original FP32 reference.","final_fall":"Not applicable: this conversational Korean script uses 요/죠/까요 endings; no sentence meets the pinned 니다 suffix condition.","caption_alignment":"Individually synthesized sentence boundaries; not word-level forced alignment.","segments":segments}
    (OUT/"timeline.json").write_text(json.dumps(tl,ensure_ascii=False,indent=2))
    (OUT/"captions.srt").write_text("\n\n".join(f'{i+1}\n{stamp(s["start"])} --> {stamp(s["end"])}\n{s["text"]}' for i,s in enumerate(segments))+"\n")
    print(f"Total: {len(full)/sr:.3f}s",flush=True)
    if len(full)/sr>=120:
        raise RuntimeError("Narration exceeds two minutes. Shorten the script, do not speed up the voice.")

if __name__=="__main__":
    main()
