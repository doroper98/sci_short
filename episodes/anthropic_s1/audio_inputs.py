"""Select only provenance-checked raw audio, including exact lossless re-synthesis."""
import hashlib
import json
from episode_paths import EPISODE_ROOT as ROOT


def raw_input(row: dict):
    registry=ROOT/'audio_input_overrides.json'
    entries=json.loads(registry.read_text())['sentences'] if registry.exists() else {}
    entry=entries.get(row['id'])
    if entry is None:return ROOT/row['raw_mp3']
    assert entry['tts']==row['tts']
    provenance=json.loads((ROOT/row['raw_mp3']).with_suffix('.provenance.json').read_text())
    assert entry['synthesis_fingerprint']==provenance['fingerprint']
    path=ROOT/entry['path']
    assert hashlib.sha256(path.read_bytes()).hexdigest()==entry['sha256']
    return path
