"""Retry low-score MMS inputs using the identical seeded TTS PCM before MP3.

No new voice, seed, speed, phonetic text, alignment method or score threshold.
The original MP3 remains preserved. Only an input that passes upstream MMS is
registered; both WORLD and trim then operate on that same lossless raw input.
"""
import argparse
import hashlib
import json
from pathlib import Path
from scipy.io import wavfile
from synthesize_episode import supertonic, ROOT
from script.tts import forced_align, align


def main() -> None:
    ap=argparse.ArgumentParser();ap.add_argument('--sid',action='append');args=ap.parse_args()
    ids=args.sid or [f['sid'] for f in json.loads((ROOT/'alignment_failures.json').read_text())['failures']]
    rows={r['id']:r for r in json.loads((ROOT/'sentences.json').read_text())['sentences']}
    registry=ROOT/'audio_input_overrides.json'
    entries=json.loads(registry.read_text())['sentences'] if registry.exists() else {}
    cfg=supertonic.config()
    model=forced_align.asset_dir()/'model.pt';assert model.stat().st_size==1262047414
    forced_align.require_assets()
    for sid in ids:
        r=rows[sid];p=ROOT/'raw_voice'/f'{sid}_lossless.wav'
        old=json.loads((ROOT/r['raw_mp3']).with_suffix('.provenance.json').read_text())
        assert old['config']==cfg.model_dump(mode='json') and old['tts']==r['tts']
        y,sr,_=supertonic.synth_wav(r['tts'],cfg)
        wavfile.write(p,sr,y.astype('float32'))
        al=forced_align.align_file(p,r['tts'])  # Same min_score, no suppression.
        sha=hashlib.sha256(p.read_bytes()).hexdigest()
        al.update(audio_sha256=sha,tts_sha256=hashlib.sha256(r['tts'].encode()).hexdigest(),model_sha1='0300fd9ae57a63e3bd239ae1337e32127a587214')
        align.write(p,al)
        entries[sid]={'path':str(p.relative_to(ROOT)),'sha256':sha,'tts':r['tts'],'synthesis_fingerprint':old['fingerprint'],
            'sample_rate':sr,'alignment_score':al['score_mean'],'reason':'MMS score on MP3 fell below upstream threshold; identical seeded PCM before lossy encoding passed unchanged MMS threshold.'}
        registry.write_text(json.dumps({'schema_version':1,'sentences':entries},ensure_ascii=False,indent=2))
        print(f'LOSSLESS RECOVERY {sid} MMS={al["score_mean"]}',flush=True)


if __name__=='__main__':main()
