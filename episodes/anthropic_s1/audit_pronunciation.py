from episode_paths import EPISODE_ROOT, OSINT_ROOT
from pathlib import Path
import json,re,hashlib
from PIL import ImageFont
from synthesize_episode import spoken,ROOT
from script.lint import tts_risks,spoken_risks,pronounce_tts

def main():
    old=json.loads((ROOT/'sentences_before_pronunciation_audit.json').read_text())['sentences']
    rows=json.loads((ROOT/'sentences.json').read_text())['sentences']
    changes=[];issues=[];cue_count=0
    ft=ImageFont.truetype(str(ROOT/'fonts/IBMPlexSansKR-Medium.ttf'),43)
    for a,r in zip(old,rows):
        assert a['id']==r['id'] and a['text']==r['text']
        if a['tts']!=r['tts']:changes.append(dict(id=r['id'],screen=r['text'],before=a['tts'],after=r['tts']))
        for kind in tts_risks(r['tts'])+spoken_risks(r['tts']):issues.append([r['id'],kind])
        assert not re.search(r'[0-9A-Za-z%~/:→()\[\]]',r['tts']),r
        assert pronounce_tts(r['tts'])==r['tts'],r['id']
        words=r['text'].split();groups=[];current=[]
        for word in words:
            if current and ft.getlength(' '.join(current+[word]))>1470:groups.append(current);current=[]
            current.append(word)
        if current:groups.append(current)
        pos=0
        for group in groups:
            needle=spoken(' '.join(group));found=r['tts'].find(needle,pos)
            assert found>=0,(r['id'],needle,r['tts']);pos=found+len(needle);cue_count+=1
    assert '구백오십 곳' in rows[30]['tts']
    assert '만천구백 곳' in rows[30]['tts']
    assert '오십쩜일 퍼센트' in rows[118]['tts']
    assert '천백사십오억' in rows[85]['tts']
    result=dict(schema_version=2,sentences=len(rows),changed=len(changes),unchanged=len(rows)-len(changes),changes=changes,issues=issues,caption_groups_mapped=cue_count,screen_text_unchanged=True,numeric_guard='950곳 preserved as 구백오십 곳; avoids repository two-digit counter partial match',listening='No perceptual listening tool available; no listening QA claimed.',mms='Official fetch failed: Tunnel connection failed: 403 Forbidden; no bytes received; no alignment or final fall applied')
    (ROOT/'pronunciation_audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    print(json.dumps({k:v for k,v in result.items() if k!='changes'},ensure_ascii=False))
if __name__=='__main__':main()
