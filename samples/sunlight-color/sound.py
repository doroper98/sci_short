"""Original ambient score and pedagogical sonification driven by visual events."""
import json
import sys
from pathlib import Path
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
from math import gcd

BASE=Path(__file__).resolve().parent
OUT=BASE.parents[1]/"outputs/sunlight-color"
SR=48000
events=json.loads((OUT/"sound-events.json").read_text())
duration=events["duration"]
n=round(duration*SR)
bed=np.zeros((n,2),dtype=np.float32)
fx=np.zeros_like(bed)
notes=[220,277.18,329.63,440,554.37,659.25]

def insert(dest,arr,time,pan=0):
    i=round(time*SR)
    if i>=len(dest):return
    arr=arr[:len(dest)-i]
    dest[i:i+len(arr),0]+=arr*np.sqrt((1-pan)/2)
    dest[i:i+len(arr),1]+=arr*np.sqrt((1+pan)/2)

def tone(freq,length,amp):
    t=np.arange(round(length*SR))/SR
    attack=np.clip(t/.025,0,1)
    env=attack*np.exp(-t/(length*.35))*np.clip((length-t)/.12,0,1)
    return (np.sin(2*np.pi*freq*t)+.18*np.sin(2*np.pi*freq*2*t))*env*amp

# Quiet original tonal bed. Slow fixed harmony does not encode the physics.
tt=np.arange(n,dtype=np.float32)/SR
fade=np.minimum(np.clip(tt/3,0,1),np.clip((duration-tt)/3,0,1))
for k,f in enumerate([110,164.81,220,277.18]):
    a=np.sin(2*np.pi*f*tt+np.sin(tt*.11+k)*.12)*.003*fade
    bed[:,0]+=a*(.9+.1*np.sin(tt*.13+k))
    bed[:,1]+=a*(.9+.1*np.cos(tt*.13+k))

for e in events["events"]:
    if e["type"]=="scatter":
        # Exact flash times match render.mjs. Soft enough to leave narration clear.
        insert(fx,tone(notes[e["band"]],.30,.018),e["time"],.15 if e["band"]==4 else -.15)
    elif e["type"]=="chord":
        h=e["elevation"];mass=1/(np.sin(np.deg2rad(h))+.50572*(h+6.07995)**-1.6364)
        for i,nm in enumerate([650,610,580,530,460,420]):
            transmission=np.exp(-.1*(550/nm)**4*mass)
            insert(fx,tone(notes[i],e["duration"],.085*transmission),e["time"],(i-2.5)*.08)
        # Lower the music in the teaching/listening windows.
        start=max(0,round((e["time"]-.2)*SR));end=min(n,round((e["time"]+e["duration"]+.3)*SR))
        bed[start:end]*=.18

sf.write(OUT/"music.wav",bed,SR,subtype="PCM_24")
sf.write(OUT/"explanatory-sound.wav",fx,SR,subtype="PCM_24")
preview="--preview-without-narration" in sys.argv
if preview:
    voice=np.zeros(n,dtype=np.float32);vr=SR
else:
    voice,vr=sf.read(OUT/"narration.wav",dtype="float32")
if voice.ndim>1:voice=voice.mean(axis=1)
if vr!=SR:
    g=gcd(SR,vr);voice=resample_poly(voice,SR//g,vr//g)
v=np.zeros(n,dtype=np.float32);v[:min(n,len(voice))]=voice[:n]
# Speech-level normalization happens in final ffmpeg mastering, not in the model.
mix=bed+fx+v[:,None]*.85
peak=float(np.max(np.abs(mix)))
if peak>.94:mix*=.94/peak
sf.write(OUT/("preview-mix.wav" if preview else "mix.wav"),mix,SR,subtype="PCM_24")
(OUT/"sound-design.json").write_text(json.dumps({
    "sample_rate":SR,"duration":duration,"peak_before_master":float(np.max(np.abs(mix))),
    "voice":"MISSING / preview only" if preview else "Supertonic 3 M3, English, 0.95, 16 steps",
    "events":events["events"],"mapping":"Red-to-violet wavelengths map to low-to-high fixed notes; tone amplitude equals modeled direct-beam transmission. This is explanatory sonification, not audible light.",
    "music":"Original additive synthesis, independent quiet bed; reduced during teaching chords."
},indent=2))
print("Wrote explanatory sounds + original music; narration is absent." if preview else "Wrote voice + explanatory sounds + original music mix.")
