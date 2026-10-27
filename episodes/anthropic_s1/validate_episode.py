"""Validate the actual corrected timeline, captions and optional final MP4."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from fontTools.ttLib import TTFont
from episode_paths import EPISODE_ROOT as ROOT
from mix_final import validated_plan
from synthesize_episode import spoken
from explainer_scenes import font
from script.tts import align, trim
from rules import load_rules


def main() -> None:
    ap=argparse.ArgumentParser();ap.add_argument('--final',action='store_true');args=ap.parse_args()
    plan=validated_plan();rules=load_rules();cues=json.loads((ROOT/'captions.json').read_text())['cues']
    rows={r.sid:r for r in plan.sentences};by_sid=defaultdict(list)
    cmap=TTFont(ROOT/'fonts/IBMPlexSansKR-Regular.ttf').getBestCmap()
    al_by_sid={};scores=[];raw_records=[]
    for r in plan.sentences:
        al=align.read(Path(r.mp3));al_by_sid[r.sid]=al
        assert ''.join(al['characters'])==r.tts
        assert al['audio_sha256']==hashlib.sha256(Path(r.mp3).read_bytes()).hexdigest()
        assert al['tts_sha256']==hashlib.sha256(r.tts.encode()).hexdigest()
        assert al['model_sha1']=='0300fd9ae57a63e3bd239ae1337e32127a587214'
        starts=np.array(al['character_start_times_seconds']);ends=np.array(al['character_end_times_seconds'])
        assert len(starts)==len(ends)==len(r.tts) and np.all(ends>=starts)
        assert np.all(np.diff(starts)>=-1e-4) and np.all(starts[1:]>=ends[:-1]-1e-4)
        scores.append(al['score_mean'])
        raw=trim.decode(Path(r.mp3));raw_trim,offset=trim.trim(raw)
        corrected=np.load(r.npy)
        assert len(corrected)==len(raw_trim) and abs(offset/trim.SR-r.trim_offset)<1e-8
        raw_records.append({'sid':r.sid,'rms':float(np.sqrt(np.mean(corrected**2))),
          'peak':float(np.max(np.abs(corrected))),'clipped_fraction':float(np.mean(np.abs(corrected)>=.999)),
          'raw_sha256':al['audio_sha256'],'corrected_sha256':hashlib.sha256(Path(r.npy).read_bytes()).hexdigest(),
          'alignment_score':al['score_mean'],'trim_offset':r.trim_offset,'final_fall':r.prosody.final_fall.model_dump()})
    previous=0.;caption_records=[]
    for c in cues:
        r=rows[c['sid']];assert r.t0<=c['t0']+1e-4<c['t1']<=r.t1+1e-4
        assert c['t0']>=previous,('caption overlap',c)
        previous=c['t1'];by_sid[c['sid']].append(c)
        assert not [x for x in c['text'] if not x.isspace() and ord(x) not in cmap],c
        width=font(43).getlength(c['text']);assert width<=1640,(c,width)
        cps=len(re.sub(r'\s','',c['text']))/(c['t1']-c['t0'])
        caption_records.append({'sid':c['sid'],'t0':c['t0'],'t1':c['t1'],'width_px':round(width,2),'chars_per_second':round(cps,2)})
    for sid,r in rows.items():
        assert re.sub(r'\s','',' '.join(c['text'] for c in by_sid[sid]))==re.sub(r'\s','',r.text),sid
        al=al_by_sid[sid];pos=0
        for c in by_sid[sid]:
            needle=spoken(c['text']);a=r.tts.find(needle,pos);assert a>=0
            b=a+len(needle)-1;pos=b+1
            expected0=r.t0+max(0,al['character_start_times_seconds'][a]-r.trim_offset)
            expected1=r.t0+min(r.dur,al['character_end_times_seconds'][b]-r.trim_offset)
            assert abs(c['t0']-expected0)<.00011 and abs(c['t1']-max(expected1,expected0+.1))<.00011
    srt=(ROOT/'Anthropic_S1_Korean.srt').read_text().strip().split('\n\n')
    assert len(srt)==len(cues)
    from finish_audio import stamp
    for i,(block,c) in enumerate(zip(srt,cues),1):
        assert block==f"{i}\n{stamp(c['t0'])} --> {stamp(c['t1'])}\n{c['text']}"
    report={'schema_version':1,'checked_at':datetime.now(timezone.utc).isoformat(),
      'sentences':len(rows),'speech_sec':sum(r.dur for r in rows.values()),'timeline_sec':plan.total,
      'mms_score_min':min(scores),'mms_score_mean':float(np.mean(scores)),
      'nida_target_count':sum(r.tts.rstrip('.!? ').endswith('니다') for r in rows.values()),
      'final_fall_applied_count':sum(r.prosody.final_fall.applied for r in rows.values()),
      'raw_reference_trim_verified':True,'character_alignment_and_caption_mapping_verified':True,
      'caption_count':len(cues),'caption_overlap_count':0,'caption_missing_sentence_count':0,
      'caption_max_width_px':max(x['width_px'] for x in caption_records),
      'caption_max_chars_per_second':max(x['chars_per_second'] for x in caption_records),
      'caption_over_15_cps':[x for x in caption_records if x['chars_per_second']>15],
      'caption_over_20_cps':[x for x in caption_records if x['chars_per_second']>20],
      'zero_audio_count':sum(x['rms']<=.001 for x in raw_records),
      'corrected_clipped_fraction_max':max(x['clipped_fraction'] for x in raw_records),
      'sentence_records':raw_records,
      'listening':{'sentences_perceptually_reviewed':0,'status':'No perceptual listening tool available; signal and text checks do not establish listening approval.'}}
    if args.final:
        final=ROOT/'out/final.mp4'
        final_srt=ROOT/'out/final.srt'
        assert final_srt.read_bytes()==(ROOT/'Anthropic_S1_Korean.srt').read_bytes()
        report['final_srt_sha256']=hashlib.sha256(final_srt.read_bytes()).hexdigest()
        probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(final)]))
        v=next(x for x in probe['streams'] if x['codec_type']=='video');a=next(x for x in probe['streams'] if x['codec_type']=='audio')
        assert (v['width'],v['height'],v['avg_frame_rate'])==(1920,1080,'24/1')
        assert int(a['channels'])==2 and int(a['sample_rate'])==44100
        av_delta=abs(float(v['duration'])-float(a['duration']));assert av_delta<=1/24+.005
        assert abs(float(probe['format']['duration'])-(plan.total+rules.audio.tail_sec))<=1/24+.005
        decoded=subprocess.run(['ffmpeg','-v','error','-xerror','-i',str(final),'-map','0:v:0','-map','0:a:0','-f','null','-'],capture_output=True,text=True)
        assert decoded.returncode==0 and not decoded.stderr.strip(),decoded.stderr
        from audio.qa import audio_qa
        aq=audio_qa(ROOT/'out',plan.sentences)
        pcm=subprocess.check_output(['ffmpeg','-v','error','-i',str(final),'-map','0:a:0','-f','f32le','-ac','2','-ar','44100','-'])
        samples=np.frombuffer(pcm,dtype=np.float32)
        report['final_decoded_sample_peak']=float(np.max(np.abs(samples)))
        report['final_decoded_clipped_sample_count']=int(np.sum(np.abs(samples)>=1.0))
        assert report['final_decoded_clipped_sample_count']==0
        from scipy.signal import correlate
        mono=samples.reshape(-1,2).mean(axis=1)
        lags=[];step=10;pad=4410
        for r in plan.sentences:
            expected=int(r.t0*44100);reference_audio=np.load(r.npy)
            observed=mono[expected-pad:expected+len(reference_audio)+pad:step]
            ref=reference_audio[::step]
            correlation=correlate(observed,ref,mode='valid',method='fft')
            lag=(int(np.argmax(correlation))*step-pad)/44100
            lags.append({'sid':r.sid,'lag_sec':lag})
        report['decoded_narration_sync_max_abs_sec']=max(abs(x['lag_sec']) for x in lags)
        report['decoded_narration_sync']=lags
        assert report['decoded_narration_sync_max_abs_sec']<=.02
        report['audio_qa']=aq.model_dump(mode='json');report['audio_issues']=aq.issues();report['audio_warnings']=aq.warnings()
        report['final']={'width':v['width'],'height':v['height'],'fps':24,'video_codec':v['codec_name'],'audio_codec':a['codec_name'],
          'sample_rate':44100,'channels':2,'duration_sec':float(probe['format']['duration']),
          'av_duration_difference_sec':av_delta,'av_start_difference_sec':abs(float(v.get('start_time',0))-float(a.get('start_time',0))),
          'full_audio_video_decode':'pass','size_bytes':final.stat().st_size,
          'sha256':hashlib.sha256(final.read_bytes()).hexdigest()}
    report['automated_pass']=report['zero_audio_count']==0 and not report['caption_over_20_cps'] and not report.get('audio_issues',[])
    (ROOT/'validation_results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps({k:v for k,v in report.items() if k not in ('sentence_records','audio_qa')},ensure_ascii=False,indent=2))
    assert report['automated_pass'],'See validation_results.json'


if __name__=='__main__':main()
