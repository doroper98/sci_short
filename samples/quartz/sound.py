"""Quiet original score; binding events drive synchronized explanatory chimes."""
from pathlib import Path
import json
from math import gcd
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

BASE=Path(__file__).resolve().parent
OUT=BASE.parents[1]/'outputs/quartz'
tl=json.loads((OUT/'timeline.json').read_text())
assert not tl.get('provisional',True)
data=json.loads((OUT/'sound-events.json').read_text())
assert abs(data['duration']-tl['duration'])<.001
SR=48000;n=round(tl['duration']*SR);tt=np.arange(n,dtype=np.float32)/SR
voice,sr=sf.read(OUT/'narration.wav',dtype='float32')
if sr!=SR:
 g=gcd(sr,SR);voice=resample_poly(voice,SR//g,sr//g)
v=np.zeros(n,dtype=np.float32);v[:min(n,len(voice))]=voice[:n]
bed=np.zeros((n,2),dtype=np.float32);fx=np.zeros_like(bed)
fade=np.minimum(np.clip(tt/3,0,1),np.clip((tl['duration']-tt)/2,0,1))
for i,f in enumerate([130.81,196,261.63]):
 a=np.sin(2*np.pi*f*tt+np.sin(tt*.09+i)*.10)*.0025*fade
 bed[:,0]+=a*(.9+.1*np.sin(tt*.1+i));bed[:,1]+=a*(.9+.1*np.cos(tt*.1+i))
def chime(at,f,amp=.018,length=.35):
 t=np.arange(round(length*SR))/SR;env=np.minimum(1,t/.007)*np.exp(-t/.09)*np.clip((length-t)/.04,0,1)
 a=(np.sin(2*np.pi*f*t)+.25*np.sin(2*np.pi*2.01*f*t))*env*amp
 start=round(at*SR);a=a[:max(0,n-start)];fx[start:start+len(a)]+=a[:,None]*.7071
for e in data['events']:
 chime(e['time'],e['note'],.018 if e['type']=='attach' else .025)
last=tl['segments'][-1]
for i,f in enumerate([261.63,329.63,392]):chime(last['end']+.12+i*.12,f,.026,.9)
# Duck the bed during measured sentence intervals; explanatory effects remain distinct.
for s in tl['segments']:
 a=max(0,round((s['start']-.08)*SR));b=min(n,round((s['end']+.1)*SR));bed[a:b]*=.45
mix=v[:,None]*.85+bed+fx
peak=float(np.max(np.abs(mix)))
if peak>.94:mix*=.94/peak
sf.write(OUT/'mix.wav',mix,SR,subtype='PCM_24')
sf.write(OUT/'explanatory-sound.wav',fx,SR,subtype='PCM_24')
sf.write(OUT/'music.wav',bed,SR,subtype='PCM_24')
(OUT/'sound-design.json').write_text(json.dumps({'sample_rate':SR,'duration':tl['duration'],'events':data['events'],'mapping':'Each attach event drives the same visual highlight and a chime. A recurring three-note motif represents repetition, not literal sounds emitted by atoms.','original_music':True,'narration':'Korean Supertonic 3 M3, upstream INT8 runtime, speed .95, 16 steps','pre_master_peak':float(np.max(np.abs(mix)))},ensure_ascii=False,indent=2)+'\n')
print('Mixed Korean narration, event-synchronized sounds and original music.')
