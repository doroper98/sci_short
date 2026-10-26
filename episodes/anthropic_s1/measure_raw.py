from __future__ import annotations
from episode_paths import EPISODE_ROOT, OSINT_ROOT
import json,sys
from pathlib import Path
import numpy as np
ROOT=EPISODE_ROOT;sys.path.insert(0,str(OSINT_ROOT))
from script.tts.trim import decode,trim,SR
from rules import load_rules

def main()->None:
    settings=json.loads((ROOT/'episode_settings.json').read_text());records=[];cursor=settings['lead_sec'];chapter=-1;chapters={}
    for r in json.loads((ROOT/'sentences.json').read_text())['sentences']:
        a=decode(Path(r['raw_mp3']));x,off=trim(a)
        if chapter!=r['chapter']:
            if chapter>=0:cursor+=settings['scene_gap_sec']
            chapter=r['chapter'];chapters[str(chapter)]=cursor
        duration=len(x)/SR
        records.append({**r,'dur':duration,'t0':cursor,'t1':cursor+duration,'trim_offset':off/SR,'rms':float(np.sqrt(np.mean(x*x))),'peak':float(abs(x).max()),'clipped_fraction':float(np.mean(abs(a)>=.999))})
        cursor+=duration+settings['sentence_gap_sec']
    result={'schema_version':1,'status':'raw timing measured; corrected voice NOT ready; final-fall uses identical original trim reference so durations expected stable','duration':cursor+settings['credits_sec'],'chapter_start':chapters,'sentences':records}
    (ROOT/'raw_timing.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    print(json.dumps({'sentences':len(records),'speech_sec':sum(r['dur'] for r in records),'timeline_sec':cursor+settings['credits_sec'],'zero_audio':sum(r['rms']<=.001 for r in records),'clipped_samples_fraction_max':max(r['clipped_fraction'] for r in records),'chapter_start':chapters}))
if __name__=='__main__':main()
