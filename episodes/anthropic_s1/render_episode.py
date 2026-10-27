from __future__ import annotations
from episode_paths import EPISODE_ROOT, OSINT_ROOT

import argparse
import bisect
import json
import math
import subprocess
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw

from explainer_scenes import SCENES, font, TEAL, INK, BG, MUTED
from narrative_scenes import scene as narrative
from sankey_scene import frame as sankey
from chart_motion import frame as quarter

ROOT=EPISODE_ROOT
# Sentence boundaries derive from measured speech. Do not use nominal chapter times.
CUTS=[(0,'opening'),(6,'filing'),(14,'business'),(18,'mix'),(23,'loop'),(26,'revenue'),(29,'customers'),(35,'nrr'),(39,'runrate'),(41,'quarter'),(46,'sankey'),(51,'adjusted'),(54,'revenue'),(57,'accounting'),(63,'fairvalue'),(71,'cash'),(76,'liquidity'),(82,'commitments'),(93,'risk'),(98,'concentration'),(102,'risk'),(104,'safety'),(107,'concentration'),(110,'pbc'),(113,'governance'),(125,'opening'),(127,'ending')]


def shot_frame(kind:str,t:float)->Image.Image:
    if kind in SCENES:return SCENES[kind](t)
    if kind=='sankey':return sankey(t)
    if kind=='quarter':return quarter(t)
    return narrative(t,kind)


@lru_cache(maxsize=35)
def settled(kind:str)->Image.Image:
    return shot_frame(kind,8)


def caption_lines(text:str)->list[str]:
    ft=font(43);lines=[];line=''
    for word in text.split():
        trial=(line+' '+word).strip()
        if line and ft.getlength(trial)>1640:lines.append(line);line=word
        else:line=trial
    if line:lines.append(line)
    assert all(ft.getlength(line)<=1640 for line in lines)
    return lines


def compose(kind:str,local:float,text:str='',draft:bool=False)->Image.Image:
    im=(shot_frame(kind,local) if local<7 else settled(kind).copy())
    d=ImageDraw.Draw(im)
    # Original source reference stays above the removed internal-preview footer.
    d.rectangle((0,1008,1920,1080),fill=BG)
    if draft:d.text((100,1016),'화면 배치 검수 · 실제 자막 시각은 MMS 정렬 후 확정',font=font(22),fill=MUTED)
    else:d.text((100,1016),'AI 합성 음성: Supertonic 3 M3  ·  Music: Chris Zabriskie (CC BY 4.0)  ·  음악 편집·저음 보강·믹스',font=font(22),fill=MUTED)
    if text:
        lines=caption_lines(text)
        # Final cues are one line from aligned audio; frame tests use representative excerpt only.
        assert len(lines)==1,('caption must be split before rendering',text)
        d.rounded_rectangle((95,899,1825,962),radius=13,fill=INK)
        w=d.textlength(lines[0],font=font(43));d.text(((1920-w)/2,905),lines[0],font=font(43),fill='#ffffff')
    return im


def animation_phase(shot:dict, t:float, rows:list[dict])->float:
    anchors={
        26:[(26,0),(27,3.4),(28,6.5)],
        41:[(41,0),(42,2.0),(43,6.0),(44,8.0)],
        46:[(46,0),(47,3.5),(48,6.5)],
        57:[(57,0),(58,1.6),(59,2.2),(60,3.0),(61,3.8),(62,6.5)],
        71:[(71,0),(72,2.0),(73,5.5),(74,7.0)],
        82:[(82,0),(84,1.4),(85,2.3),(86,3.2),(87,3.6),(88,4.5),(90,6.5)],
        113:[(113,0),(114,1.1),(115,1.7),(118,3.2),(120,4.5),(122,7.5)]
    }
    import numpy as np
    key=shot['sentence_index']
    if key in anchors:
        pairs=anchors[key];times=[rows[i]['t0'] for i,p in pairs];phases=[p for i,p in pairs]
        times.append(shot['end']);phases.append(8.0)
        return float(np.interp(t,times,phases))
    return min(8.0,8*(t-shot['start'])/max(6,min(18,(shot['end']-shot['start'])*.8)))


def main()->None:
    ap=argparse.ArgumentParser();ap.add_argument('--frames-only',action='store_true');ap.add_argument('--video-only',action='store_true');args=ap.parse_args()
    if args.frames_only:
        data=json.loads((ROOT/'raw_timing.json').read_text());rows=data['sentences'];total=data['duration']
    else:
        data=json.loads((ROOT/'plan.json').read_text());rows=data['sentences'];total=data['total']
        for r in rows:
            if r['tts'].rstrip('.!? ').endswith('니다'):
                assert r.get('prosody',{}).get('final_fall',{}).get('applied'),r['sid']
        assert all(r.get('alignment',{}).get('source')=='mms_forced_alignment' for r in rows)
        from mix_final import validated_plan
        from rules import load_rules
        validated_plan()
        total+=load_rules().audio.tail_sec
    shots=[]
    for j,(idx,kind) in enumerate(CUTS):
        a=rows[idx]['t0'];b=rows[CUTS[j+1][0]]['t0'] if j+1<len(CUTS) else total
        shots.append({'sentence_index':idx,'kind':kind,'start':a,'end':b})
    settings=json.loads((ROOT/'episode_settings.json').read_text())
    credit_start=rows[-1]['t1']+settings['sentence_gap_sec']
    shots[-1]['end']=credit_start
    shots.append({'sentence_index':None,'kind':'credits','start':credit_start,'end':total})
    (ROOT/'shots.json').write_text(json.dumps({'schema_version':1,'timing_source':'measured raw' if args.frames_only else 'corrected aligned plan','shots':shots},ensure_ascii=False,indent=2))
    if args.frames_only:
        dest=ROOT/'integration_frames';dest.mkdir(exist_ok=True)
        sheet=Image.new('RGB',(1440,math.ceil(len(shots)/3)*270),BG)
        for j,s in enumerate(shots):
            text=caption_lines(rows[s['sentence_index']]['text'])[0] if s['sentence_index'] is not None else ''
            im=compose(s['kind'],8,text,draft=True);im.save(dest/f'{j:02d}_{s["kind"]}.png')
            sheet.paste(im.resize((480,270)),((j%3)*480,(j//3)*270))
        sheet.save(dest/'contact_sheet.png')
        print(f'FRAME INTEGRATION PASS: {len(shots)} shots, duration {total:.3f}s')
        return
    cues=json.loads((ROOT/'captions.json').read_text())['cues'];ct=[c['t0'] for c in cues];st=[s['start'] for s in shots]
    out=ROOT/'video_only.mp4'
    p=subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s','1920x1080','-r','24','-i','-','-an','-c:v','libx264','-threads','3','-preset','fast','-crf','19','-pix_fmt','yuv420p',str(out)],stdin=subprocess.PIPE)
    for n in range(math.ceil(total*24)):
        t=n/24;j=max(0,bisect.bisect_right(st,t)-1);s=shots[j];cidx=bisect.bisect_right(ct,t)-1
        text=cues[cidx]['text'] if cidx>=0 and t<=cues[cidx]['t1'] else ''
        im=compose(s['kind'],animation_phase(s,t,rows),text)
        p.stdin.write(im.tobytes())
        if n%(24*15)==0:print(f'RENDER {t:.0f}/{total:.0f}s',flush=True)
    p.stdin.close();assert p.wait()==0
    if not args.video_only:
        from mix_final import main as mix_main
        mix_main()


if __name__=='__main__':main()
