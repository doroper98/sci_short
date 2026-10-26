from __future__ import annotations
from episode_paths import EPISODE_ROOT, OSINT_ROOT

import hashlib
import json
import re
import sys
from pathlib import Path

from pydantic import BaseModel

ROOT = EPISODE_ROOT
sys.path.insert(0, str(OSINT_ROOT))
# libcairo runtime is available, but pycairo headers are not; use its supported CFFI binding.
try:
    import cairo
except ImportError:
    import cairocffi as cairo
    sys.modules['cairo']=cairo
from script.tts import supertonic


class Sentence(BaseModel):
    id: str
    chapter: int
    text: str
    tts: str
    raw_mp3: str


def integer(n: int) -> str:
    if n==0: return '영'
    digits='영일이삼사오육칠팔구'; groups=[]
    for big in ('','만','억','조'):
        g=n%10000; n//=10000
        if g:
            s=''
            for value,unit in ((1000,'천'),(100,'백'),(10,'십'),(1,'')):
                q,g=divmod(g,value)
                if q:s+=(digits[q] if q>1 or not unit else '')+unit
            groups.insert(0,s+big)
    return ' '.join(groups)


def spoken(s: str) -> str:
    from bundle.text import tts_of
    from script.lint import pronounce_tts
    # Episode lexical normalization, grounded in TTS-AP-005 and dictionary S-1.
    s=re.sub(r'(?<!\d)([1-4])\s*분기',lambda m:'일이삼사'[int(m.group(1))-1]+'사분기',s)
    s=s.replace('일 분기','일사분기').replace('이 분기','이사분기')
    s=s.replace('에스 원','S-1').replace('티피유','티 피 유').replace('에이아이','에이 아이')
    # Remove numeric thousands separators before repository number conversion.
    s=re.sub(r'(?<=\d),(?=\d{3}(?:\D|$))','',s)
    # Guard repository two-digit native-counter regex from partially consuming 950곳.
    s=re.sub(r"(?<![\d.])(\d{3,})\s*(가지|개(?!월)|곳|척|명|번|살|발|건|차례|대)",lambda m:integer(int(m.group(1)))+" "+m.group(2),s)
    s=tts_of(s)
    # TTS-AP-058: one Sino-Korean numeral has no internal whitespace.
    chars='영일이삼사오육칠팔구십백천만억조'
    s=re.sub(rf'(?<![가-힣])([{chars}]+(?:\s+[{chars}]+)+)(?![가-힣])',lambda m:re.sub(r'\s+','',m.group()),s)
    s=re.sub(r"([영일이삼사오육칠팔구십백천만억조쩜]+)(퍼센트)",r"\1 \2",s)
    return pronounce_tts(s)


def main() -> None:
    rows=[]; chapter=-1
    for line in (ROOT/'narration_ko_v1.txt').read_text().splitlines():
        if line.startswith('['): chapter+=1;continue
        if chapter<0 or not line.strip():continue
        for text in re.split(r'(?<=[.!?])\s+',line):
            text=text.strip()
            if not text:continue
            tts=spoken(text)
            assert not re.search(r'[0-9A-Za-z]',tts),tts
            key=hashlib.sha1(tts.encode()).hexdigest()[:10]
            p=ROOT/'raw_voice'/f'{len(rows):03d}_{key}.mp3'
            rows.append(Sentence(id=f's{len(rows):03d}',chapter=chapter,text=text,tts=tts,raw_mp3=str(p)))
    (ROOT/'sentences.json').write_text(json.dumps({'schema_version':1,'status':'raw synthesis before required MMS alignment and final fall','sentences':[r.model_dump() for r in rows]},ensure_ascii=False,indent=2))
    cfg=supertonic.config()
    for i,row in enumerate(rows):
        p=Path(row.raw_mp3)
        if not p.exists():supertonic.synth_one(row.tts,p,cfg)
        print(f'RAW {i+1}/{len(rows)} {p.name}',flush=True)


if __name__=='__main__':main()
