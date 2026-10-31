"""Fetch the upstream Sherpa-ONNX Supertonic 3 release through normal HTTPS."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import tarfile

BASE=Path(__file__).resolve().parent
manifest=json.loads((BASE/'assets/voice-model.json').read_text())
model=Path(os.environ.get('QUARTZ_TTS_MODEL','/workspace/models/supertonic-sherpa/sherpa-onnx-supertonic-3-tts-int8-2026-05-11'))
def valid():
    return all((model/name).is_file() and hashlib.sha256((model/name).read_bytes()).hexdigest()==digest for name,digest in manifest['sha256'].items())
if valid():
    print('Verified existing model assets.')
else:
    model.parent.mkdir(parents=True,exist_ok=True)
    archive=model.parent/'release.tar.bz2'
    if not archive.exists() or hashlib.sha256(archive.read_bytes()).hexdigest()!=manifest['archive_sha256']:
        part=archive.with_suffix('.part')
        subprocess.run(['curl','--fail','--location','--max-time','300',manifest['source'],'-o',str(part)],check=True)
        if hashlib.sha256(part.read_bytes()).hexdigest()!=manifest['archive_sha256']:
            raise ValueError('Upstream model archive checksum mismatch')
        part.replace(archive)
    with tarfile.open(archive) as tar:
        expected='sherpa-onnx-supertonic-3-tts-int8-2026-05-11'
        assert model.name==expected,'Set QUARTZ_TTS_MODEL to a directory with the release name.'
        for member in tar.getmembers():
            p=Path(member.name)
            assert not p.is_absolute() and '..' not in p.parts and p.parts[0]==expected
            assert member.isfile() or member.isdir()
        tar.extractall(model.parent,filter='data')
    assert valid(),'Extracted model assets failed verification'
    print('Downloaded and verified upstream model assets.')
