"""Use the pinned upstream mixer and two-pass loudness/mux implementation."""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import numpy as np
from episode_paths import EPISODE_ROOT as ROOT, OSINT_ROOT
sys.path.insert(0,str(OSINT_ROOT))
from audio.mix import Sound, decode_bgm, mix, SR
from audio.registry import bgm_path
from audio.qa import measure_loudnorm
from engine.mux import mux
from rules import load_rules
from script.schema import Plan


def validated_plan() -> Plan:
    plan=Plan.model_validate_json((ROOT/'plan.json').read_text())
    assert len(plan.sentences)==132
    for r in plan.sentences:
        assert r.alignment.source=='mms_forced_alignment',r.sid
        if r.tts.rstrip('.!? ').endswith('니다'):
            assert r.prosody.final_fall.applied,r.sid
        a=np.load(r.npy,mmap_mode='r')
        assert abs(len(a)/SR-r.dur)<1/SR,r.sid
        assert np.isfinite(a).all() and np.max(np.abs(a))>0,r.sid
    assert json.loads((ROOT/'source_validation.json').read_text())['pass']
    return plan


def main() -> None:
    plan=validated_plan();rules=load_rules();settings=json.loads((ROOT/'episode_settings.json').read_text())
    assert settings['bgm']=='music.zabriskie_patriarch'
    total=plan.total+rules.audio.tail_sec
    intensity=settings.get('bgm_intensity',1.0)
    sound=Sound(bgm=settings['bgm'],intensity=[(0,intensity),(total,intensity)],cues=[])
    path=bgm_path(settings['bgm'])  # Registry checks file SHA1.
    out=ROOT/'out';out.mkdir(exist_ok=True)
    stats={}
    y,peak=mix(plan,sound,decode_bgm(path),stats)
    assert len(y)==int(total*SR)
    y.tofile(out/'mix.f32')
    stats['mix_samples']=len(y)
    (out/'bed_stats.json').write_text(json.dumps(stats,ensure_ascii=False,indent=2))
    del y
    video=out/'video_noaudio.mp4'
    if video.is_symlink():video.unlink()
    if not video.exists():video.symlink_to(ROOT/'video_only.mp4')
    final,loudness=mux(ROOT,total)
    measured=measure_loudnorm(final)
    record={'schema_version':1,'upstream_commit':'7d85942e536e0eb0796292aa628540d8319cf9af',
      'bgm':settings['bgm'],'sound':sound.model_dump(mode='json'),'audio_rules':rules.audio.model_dump(mode='json'),
      'intensity_reason':settings.get('bgm_intensity_reason'),
      'mix_peak_before_master_normalization':peak,'loudnorm':loudness,'final_measured_loudness':measured.model_dump(),
      'duration_sec':total,'music_edits':{'start_at_sec':0,'used_sec':total,'looped':total>931.814,
       'processing':'upstream bass shelf + sub-octave + scene swells + peak reference normalization + narration ducking + fades + two-pass loudnorm + limiter'},
      'listening_qa':'No perceptual audio input tool available; no full listening approval claimed.'}
    (ROOT/'mix_provenance.json').write_text(json.dumps(record,ensure_ascii=False,indent=2))
    shutil.copy2(ROOT/'Anthropic_S1_Korean.srt',out/'final.srt')
    print(f'FINAL MP4 {final} {total:.3f}s {measured.model_dump()}',flush=True)


if __name__=='__main__':main()
