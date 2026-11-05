# 생성 영상 클립 (Higgsfield 등)

`pipeline/genvideo/higgsfield.py`로 받은 AI 생성 클립을 `assets/generated/<slug>/<name>.mp4`에 둡니다. 바이너리는 Git에 넣지 않고 같은 이름의 `.json`(모델, 프롬프트, 요청 ID, 견적, 해시, 만료)을 추적합니다.

사용 원칙: 생성 클립은 **훅·분위기·외관**용입니다. 궤도 반지름, 진동수, 파형처럼 수치와 인과가 보이는 메커니즘 장면은 모형으로 그립니다. 생성 클립은 시뮬레이션이나 관측이 아니며, 에피소드 README에 "AI 생성 삽화"로 표기합니다.
