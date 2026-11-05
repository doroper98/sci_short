"""Two-pass audio mastering and H.264/AAC MP4 delivery with burned Korean captions and separate SRT."""
from pathlib import Path
import hashlib
import json
import subprocess

BASE=Path(__file__).resolve().parent
OUT=BASE.parents[1]/"outputs/quartz"
timeline=json.loads((OUT/"timeline.json").read_text())
assert not timeline.get("provisional",True),"Final delivery requires synthesized narration."
assert timeline["duration"]<120
measure=subprocess.run([
    "ffmpeg","-hide_banner","-i",str(OUT/"mix.wav"),"-af",
    "loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json","-f","null","-"
],text=True,capture_output=True,check=True)
block=measure.stderr[measure.stderr.rfind("{"):measure.stderr.rfind("}")+1]
stats=json.loads(block)
filt=("loudnorm=I=-16:TP=-1.5:LRA=9:linear=true:print_format=json"
      f':measured_I={stats["input_i"]}:measured_TP={stats["input_tp"]}'
      f':measured_LRA={stats["input_lra"]}:measured_thresh={stats["input_thresh"]}'
      f':offset={stats["target_offset"]}')
final=OUT/"quartz-growth-ko.mp4"
subprocess.run([
    "ffmpeg","-y","-v","warning","-i",str(OUT/"visual.mp4"),"-i",str(OUT/"mix.wav"),
    "-map","0:v:0","-map","1:a:0",
    "-c:v","copy","-af",filt,"-c:a","aac","-b:a","192k","-ar","48000",
    "-metadata:s:a:0","language=kor","-t",str(timeline["duration"]),
    "-metadata","title=수정은 어떻게 자랄까?","-movflags","+faststart",str(final)
],check=True)
probe=json.loads(subprocess.check_output(["ffprobe","-v","error","-show_format","-show_streams","-of","json",str(final)]))
subprocess.run(["ffmpeg","-v","error","-i",str(final),"-map","0:v","-map","0:a","-f","null","-"],check=True)
report={
 "file":final.name,"bytes":final.stat().st_size,"sha256":hashlib.sha256(final.read_bytes()).hexdigest(),
 "probe":probe,"audio_mastering_input":stats,"voice":timeline["voice"],
 "model_revision":timeline.get("model_revision"),
 "verification":{"full_decode":"passed","direct_listening":"not performed","physical_phone_playback":"not performed"},
}
(OUT/"validation.json").write_text(json.dumps(report,indent=2))
print(final)
