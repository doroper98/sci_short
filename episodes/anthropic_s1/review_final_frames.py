"""Extract representative, transition and longest-caption frames from final MP4."""
import concurrent.futures
import json
import math
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw
from episode_paths import EPISODE_ROOT as ROOT
from explainer_scenes import font, BG, INK


def main() -> None:
    shots=json.loads((ROOT/'shots.json').read_text())['shots']
    cues=json.loads((ROOT/'captions.json').read_text())['cues']
    dest=ROOT/'out/qa_frames';dest.mkdir(parents=True,exist_ok=True)
    groups={'chapters':[(f'{i:02d} {s["kind"]}',s['start']+.8*(s['end']-s['start'])) for i,s in enumerate(shots)],
            'transitions':[(f'{s["kind"]} {int(p*100)}%',s['start']+p*(s['end']-s['start'])) for s in shots if s['kind'] in ('sankey','accounting','cash','quarter','governance') for p in (.1,.35,.6,.85)],
            'long_captions':[(f'{c["sid"]} {len(c["text"])} chars',(c['t0']+c['t1'])/2) for c in sorted(cues,key=lambda c:len(c['text']),reverse=True)[:9]]}
    groups['long_captions'].append(('last frame',(math.ceil(shots[-1]['end']*24)-1)/24))
    records=[]
    for group,items in groups.items():
        jobs=[]
        for i,(label,t) in enumerate(items):
            frame=round(t*24);path=dest/f'{group}_{i:02d}.png'
            jobs.append((label,frame/24,path));records.append({'group':group,'label':label,'frame':frame,'time':frame/24})
        def extract(job):
            label,t,path=job
            subprocess.run(['ffmpeg','-v','error','-y','-ss',f'{t:.6f}','-i',str(ROOT/'out/final.mp4'),'-frames:v','1','-threads','1',str(path)],check=True)
            return job
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(extract,jobs))
        cols=4 if group=='transitions' else 3
        sheet=Image.new('RGB',(cols*480,((len(jobs)+cols-1)//cols)*300),BG)
        d=ImageDraw.Draw(sheet)
        for i,(label,t,path) in enumerate(jobs):
            x,y=(i%cols)*480,(i//cols)*300
            sheet.paste(Image.open(path).resize((480,270)),(x,y))
            d.text((x+8,y+273),f'{t:.2f}s · {label}',font=font(17),fill=INK)
        sheet.save(ROOT/'out'/f'review_{group}.png')
    (ROOT/'out/frame_review_index.json').write_text(json.dumps({'schema_version':1,'source':'decoded final MP4','frames':records},ensure_ascii=False,indent=2))
    print(f'Extracted {len(records)} final-video QA frames',flush=True)


if __name__=='__main__':main()
