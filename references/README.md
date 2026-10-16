# 보관한 참고자료

## 영상 원본과 장면 모음

사용자가 2026-10-16에 제공한 7개 MP4를 바이트 변경 없이 복사했습니다. 파일명만 읽기 쉽게 정리했습니다.
원래 첨부 파일명, 바이트 수, SHA-256, 스트림 정보는 [manifest.json](manifest.json)에 있습니다.

| 번호 | 원본 | 주요 장면 |
|---|---|---|
| 1 | [망막](videos/01-retina.mp4) | [장면 모음](contact-sheets/01-retina.jpg) |
| 2 | [도플러](videos/02-doppler.mp4) | [장면 모음](contact-sheets/02-doppler.jpg) |
| 3 | [하늘·노을](videos/03-sky-and-sunset.mp4) | [장면 모음](contact-sheets/03-sky-and-sunset.jpg) |
| 4 | [입자 소나기](videos/04-cosmic-ray-shower.mp4) | [장면 모음](contact-sheets/04-cosmic-ray-shower.jpg) |
| 5 | [블랙홀 병합](videos/05-black-hole-merger.mp4) | [장면 모음](contact-sheets/05-black-hole-merger.jpg) |
| 6 | [전자레인지](videos/06-microwave-heating.mp4) | [장면 모음](contact-sheets/06-microwave-heating.jpg) |
| 7 | [우주 평탄성](videos/07-flat-universe.mp4) | [전반](contact-sheets/07-flat-universe-part-1.jpg) · [후반](contact-sheets/07-flat-universe-part-2.jpg) |

[전체 비교 이미지](contact-sheets/overview.jpg)는 각 영상의 초반·중반·후반을 세로로 놓았습니다.
장면 모음은 프레임 추출 결과이며 원본 MP4를 대체하지 않습니다.
3번 원본은 파일 말미 디코딩 경고가 있습니다. 분석에서는 약 18.9초까지의 프레임을 확인했습니다. 임의로 복구·덮어쓰기하지 않았습니다.

## 음성 참고

[osint-final-voice-0-25s.m4a](narration/osint-final-voice-0-25s.m4a)는 사용자가 지정한 저장소의 최종 MP4에서 추출한 첫 25초 오디오입니다.
출처 커밋 `2e39d4160080739ceedc74f16a6dc4a852664fca`, 원본 경로 `final.mp4`, 원본 Git blob `79b6fa643c1a380b5fc38a81f63ad89daac86b3f`.
`ffmpeg -i final.mp4 -t 25 -map 0:a:0 -c:a copy -map_metadata -1 excerpt.m4a`로 추출했습니다.
AAC 패킷 경계 때문에 실제 컨테이너 길이는 요청한 25초와 조금 다를 수 있습니다.
음악이 섞여 있으며, 새로 합성한 과학 나레이션이나 순수 음성 샘플이 아닙니다.
설정과 최종 적용 근거는 [음성 문서](../docs/NARRATION_AND_CAPTIONS.md)와 [기준값](../config/voice-reference.json)을 참고하세요.

## 무결성과 용도

저장소 루트에서 `sha256sum -c references/SHA256SUMS`로 원본·이미지·음성 발췌의 보관 상태를 확인합니다.
파일을 분석 목적으로 보관한 것이며, 원본 콘텐츠의 권리·라이선스를 변경하지 않습니다.
새 완성작은 참고자료의 설명 방식을 연구해 별도 제작합니다.
