# 38 `submarine-detection` — 잠수함은 어떻게 찾을까

계획: `PLAN.md`(정본), 기획: `brief.md`. 실행은 `run.sh`(템플릿 그대로).

| 파일 | 내용 |
|---|---|
| `model.mjs` | 물리 모형(그림 없음): 소리 빠르기 `c(z)`, 음선 `traceRay`/`aimRay`, 부표 세기 `levelDb`·`barH`, 자기 이상 `S(x,d)`·`fieldLines` |
| `kit.mjs` | 팔레트·도우미(`wd` 낱말 기준점 포함)·카메라/`surfY`·배경·무광 물체 6+1종·신호(Glow)·계기 띠·머리글·포스터·소리 사건 도우미 |
| `scenes_core.mjs` | sonar, layer 장면 (`planCore`, `soundCore`, `titles`) |
| `scenes_intro.mjs` / `scenes_air.mjs` | hook·origin·essence·close / buoy·mad·mast (있으면 `scenes.mjs`가 자동으로 읽음, 없으면 임시 장면) |
| `scenes.mjs` | 모음: `theme, captionLayout, scenes, overlays, background, plan, soundEvents`; `--emit-sound` |
| `sound.json` | `node episodes/submarine-detection/scenes.mjs --emit-sound`가 씀(손으로 고치지 않음) |

```bash
node episodes/submarine-detection/scenes.mjs --emit-sound
SCISHORT_ROOT=$PWD node episodes/submarine-detection/render.mjs --stills
node outputs/submarine-detection/check.mjs bodies layer layer2 sonar   # 미리보기 (outputs/…/preview/)
```
