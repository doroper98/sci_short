from __future__ import annotations
from episode_paths import EPISODE_ROOT, OSINT_ROOT

import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import ImageFont
from scipy.io import wavfile

ROOT=EPISODE_ROOT
sys.path.insert(0,str(OSINT_ROOT))
from script.tts import forced_align, align, prosody, trim
from script.schema import Plan, PlanSentence, PlanProsody, PlanAlignment
from rules import load_rules
from synthesize_episode import spoken


def stamp(t:float)->str:
    ms=round(t*1000); h,ms=divmod(ms,3600000);m,ms=divmod(ms,60000);s,ms=divmod(ms,1000)
    return f'{h:02d}:{m:02d}:{s:02d},{ms:03d}'


def main()->None:
    forced_align.require_assets()
    settings=json.loads((ROOT/'episode_settings.json').read_text());rules=load_rules(); rows=json.loads((ROOT/'sentences.json').read_text())['sentences']
    built=[]; cues=[]; starts={}; cursor=settings['lead_sec']
    ft=ImageFont.truetype(str(ROOT/'fonts/IBMPlexSansKR-Medium.ttf'),43)
    for n,r in enumerate(rows):
        mp=Path(r['raw_mp3']); assert mp.is_file(),str(mp)
        al=align.read(mp)
        if al is None:
            al=forced_align.align_file(mp,r['tts']); align.write(mp,al)
        raw=trim.decode(mp)
        y,rec=prosody.final_fall(raw,al,r['tts'],rules.tts_rules.prosody.final_fall)
        out,offset=trim.trim(y,ref=raw); off=offset/trim.SR
        npy=ROOT/'corrected_voice'/(r['id']+'.npy');npy.parent.mkdir(exist_ok=True);np.save(npy,out)
        scene=f"chapter{r['chapter']:02d}"
        if scene not in starts:
            if n:cursor+=settings['scene_gap_sec']
            starts[scene]=cursor
        dur=len(out)/trim.SR
        row=PlanSentence(sid=r['id'],scene=scene,date='2026.10.26',text=r['text'],tts=r['tts'],segments=[(r['text'],0)],mp3=str(mp),npy=str(npy),dur=dur,t0=cursor,t1=cursor+dur,trim_offset=off,alignment=PlanAlignment(source=al['alignment_source'],score_mean=al.get('score_mean'),elapsed_ms=al.get('elapsed_ms')),prosody=PlanProsody(final_fall=rec))
        built.append(row)
        # Split at existing whitespace; exact pronunciation-prefix mapping supplies real char boundaries.
        words=list(re.finditer(r'\S+',r['text'])); groups=[]; current=[];width=0
        for w in words:
            trial=' '.join([x.group() for x in current]+[w.group()])
            if current and ft.getlength(trial)>1470:
                groups.append(current);current=[]
            current.append(w)
        if current:groups.append(current)
        search_pos=0
        for group in groups:
            a,b=group[0].start(),group[-1].end();txt=r['text'][a:b]
            needle=spoken(txt);ia=r['tts'].find(needle,search_pos)
            assert ia>=0,(r['id'],txt,needle)
            ib=ia+len(needle)-1;search_pos=ib+1
            t0=cursor+max(0,al['character_start_times_seconds'][ia]-off)
            t1=cursor+min(dur,al['character_end_times_seconds'][ib]-off)
            cues.append({'sid':r['id'],'text':txt,'t0':round(t0,4),'t1':round(max(t1,t0+.1),4)})
        cursor+=dur+settings['sentence_gap_sec']
        (ROOT/'audio_progress.json').write_text(json.dumps({'schema_version':1,'done':n+1,'total':len(rows),'duration_so_far':cursor,'last_alignment_score':al.get('score_mean'),'last_prosody':rec.model_dump()},ensure_ascii=False,indent=2))
        print(f"CORRECTED {n+1}/{len(rows)} score={al.get('score_mean')} fall={rec.applied} duration={dur:.2f}",flush=True)
    plan=Plan(sentences=built,cards=[],scene_start=starts,total=cursor+settings['credits_sec'],voice='supertonic-3 M3 ×0.95 + configured final_fall',title='Anthropic S-1 — 성장, 회계, 현금, 그리고 통제권',subtitle='2026년 10월 26일 제출 공시',date='2026.10.26')
    (ROOT/'plan.json').write_text(plan.model_dump_json(indent=2))
    (ROOT/'captions.json').write_text(json.dumps({'schema_version':1,'cues':cues},ensure_ascii=False,indent=2))
    (ROOT/'Anthropic_S1_Korean.srt').write_text('\n\n'.join(f"{i+1}\n{stamp(c['t0'])} --> {stamp(c['t1'])}\n{c['text']}" for i,c in enumerate(cues))+'\n',encoding='utf-8')
    print(f'FINAL TIMELINE {plan.total:.3f}s {len(cues)} cues',flush=True)


if __name__=='__main__':main()
