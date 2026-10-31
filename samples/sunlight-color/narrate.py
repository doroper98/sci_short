"""Pinned Supertonic 3 M3 English narration, with actual clip times for subtitles."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import numpy as np
import soundfile as sf
from supertonic import TTS

BASE=Path(__file__).resolve().parent
ROOT=BASE.parents[1]
OUT=ROOT/"outputs/sunlight-color"
MODEL=ROOT/"models/supertonic-3"
REF=json.loads((ROOT/"config/voice-reference.json").read_text())["synthesis"]

def assets():
    """Use approved HTTPS proxy and verified hashes. No unchecked fallback."""
    for rel,sha1 in REF["assets"].items():
        dest=MODEL/rel
        dest.parent.mkdir(parents=True,exist_ok=True)
        if dest.exists() and hashlib.sha1(dest.read_bytes()).hexdigest()==sha1:
            continue
        url=f'https://huggingface.co/{REF["repo"]}/resolve/{REF["revision"]}/{rel}'
        tmp=dest.with_suffix(dest.suffix+".part")
        subprocess.run(["curl","--fail","--location","--max-time","300","--retry","1",url,"-o",str(tmp)],check=True)
        if hashlib.sha1(tmp.read_bytes()).hexdigest()!=sha1:
            raise ValueError(f"Model integrity mismatch: {rel}")
        tmp.replace(dest)

def stamp(t):
    ms=round(t*1000);return f"{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}"

def main():
    assets()
    OUT.mkdir(parents=True,exist_ok=True)
    tts=TTS(model="supertonic-3",model_dir=MODEL,auto_download=False,intra_op_num_threads=4,inter_op_num_threads=1)
    style=tts.get_voice_style("M3");sr=tts.sample_rate
    data=json.loads((BASE/"script.json").read_text());pieces=[];segments=[];cursor=1.2
    pieces.append(np.zeros(round(cursor*sr),dtype=np.float32))
    for i,s in enumerate(data["segments"]):
        f=OUT/f"voice-{i:02}.wav"
        key=hashlib.sha256((s["text"]+"M3:en:.95:16").encode()).hexdigest()
        meta=OUT/f"voice-{i:02}.json"
        if f.exists() and meta.exists() and json.loads(meta.read_text()).get("key")==key:
            wav,rs=sf.read(f,dtype="float32");assert rs==sr
        else:
            np.random.seed(int(hashlib.sha256((s["text"]+"v1").encode()).hexdigest()[:8],16))
            raw,dur=tts.synthesize(s["text"],voice_style=style,total_steps=16,speed=.95,lang="en",max_chunk_length=300,silence_duration=.3)
            wav=np.asarray(raw).reshape(-1)[:round(float(np.asarray(dur).reshape(-1)[0])*sr)]
            # Remove only edge silence, preserving consonants with 70 ms of padding.
            nonzero=np.where(np.abs(wav)>.003)[0]
            if len(nonzero):wav=wav[max(0,nonzero[0]-round(.07*sr)):min(len(wav),nonzero[-1]+round(.10*sr))]
            sf.write(f,wav,sr,subtype="PCM_16")
            meta.write_text(json.dumps({"key":key,"text":s["text"],"duration":len(wav)/sr}))
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
    tl={"duration":len(full)/sr,"provisional":False,"language":"en","voice":"Supertonic 3 M3","speed":.95,"steps":16,"model_revision":REF["revision"],"final_fall":"Not applicable: English text has no Korean suffix 니다.","caption_alignment":"Individually synthesized sentence boundaries; not word-level forced alignment.","segments":segments}
    (OUT/"timeline.json").write_text(json.dumps(tl,ensure_ascii=False,indent=2))
    (OUT/"captions.srt").write_text("\n\n".join(f'{i+1}\n{stamp(s["start"])} --> {stamp(s["end"])}\n{s["text"]}' for i,s in enumerate(segments))+"\n")
    print(f"Total: {len(full)/sr:.3f}s",flush=True)
    if len(full)/sr>=120:
        raise RuntimeError("Narration exceeds two minutes. Shorten the script, do not speed up the voice.")

if __name__=="__main__":
    main()
