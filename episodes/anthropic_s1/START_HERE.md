# Anthropic S-1 한국어 영상

**실제 내레이션·BGM을 포함한 10분 40.708초 영상과 동기 SRT를 생성했습니다.** 1920×1080, 24fps입니다. 실제 청취 검토는 0/132문장으로 남아 있습니다.

- 영상: `out/final.mp4`
- 자막: `out/final.srt`
- [이번 실행과 남은 제한](HANDOFF.txt)
- [최종 실측 요약](out/VERIFICATION_KO.txt)
- [재현 방법](RUN_PRODUCTION.txt), [출처와 자산 표기](SOURCE_CREDITS.txt)
- [자동 검증](validation_results.json), [화면 검토](visual_review.json), [SEC 대조](source_validation.json)
- [현재 소스와 해시](MANIFEST.json), [원 인계 변경 기록](file_changes.json)

미디어는 Git에서 제외된 로컬 산출물이므로 새 체크아웃에는 포함되지 않습니다. 모델·폰트·음악·음성과 전체 SEC 원문도 소스 패키지에서 제외했습니다. 지정 채팅 output 경로는 OS 권한 때문에 생성되지 않아 파일은 에피소드 `out/`에 보존했습니다.

원 인계 커밋은 `0c87669c678f9cf00fecd92cca78bc182c945532`입니다. 이번에 132문장을 새로 합성하고 원 MMS 정렬·WORLD 보정·원 믹서·최종 디코딩 검사를 실행했습니다. `CONTINUE_CODEX_KO.txt`의 미완성 상태는 과거 기록입니다.

다음 검토에서는 `final.mp4`를 재생해 숫자·월·분기·회사명·약어·끊김·말끝을 실제로 듣고 기록해야 합니다. 자동 신호 검사를 청취 완료로 해석하지 마세요. Gmarket 폰트의 현재 전체 약관은 공식 사이트 정상화 뒤 재확인할 수 있습니다.
