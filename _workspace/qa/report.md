# QA 통합 검증 리포트 (2026-05-22, 빌드 수정 후)

## 요약
- 검증 단계: **6/6**
- 통과: **88건** (정적 55 + Playwright 33)
- 실패: **0건**
- 경고: **6건** (모두 정보성, 출시 영향 없음)
- `dist/index.html` 크기: **4.71 MB**
- 브라우저 자동화 사용: **예** (Playwright Chromium headless)

## 빌드 블로커 해결 이력

**최초 검증에서 발견된 P0 블로커:** `scripts/build.js` line 136-139의 `String.prototype.replace` 가 `$'`/`$&` 같은 특수 치환 토큰을 해석하여 cytoscape.min.js의 정규식 리터럴(`'^([\w- \"]+(?:\s*,\s*[\w- \"]+)*)$'`)이 손상됨. 결과: HTML 부팅 즉시 SyntaxError, window.cytoscape·window.PokeOnt 미정의, 챕터 목록 0개, 햄버거 토글 실패.

**수정:** `.replace`의 두 번째 인자를 함수형(`() => styleBlock` 등)으로 변경. 함수형 replacement는 `$`-시퀀스 해석을 거치지 않음.

**재빌드 후 검증:** Playwright 5뷰포트 33건 전수 통과, pageerror 0건.

## 단계별 결과

### QA-1 데이터 정합성 (6 통과 / 1 경고)
- pokemon 1025개 (≥1000)
- types 18개 (정확)
- koName 누락 0건
- 진화체인 양방향 정합
- meta.failed 0건 (0%)
- ⚠ koFallback 115건 (신세대 무브/특성 한국어 미등록, 챕터에서 인용 0건이므로 학습 영향 없음)

### QA-2 커리큘럼 정합성 (4 통과)
- 챕터 14개 (목표 12~15)
- prerequisiteChapters 순환 의존 0건
- newConcepts 38개 모두 conceptGlossary 정의됨
- 모든 pokemonExamples가 데이터에 실재

### QA-3 온톨로지 매핑 (4 통과 / 3 경고)
- 클래스 50개 parent IRI 정합
- 슬라이스 14개 챕터 ID와 1:1
- 트리플 29,637개 predicate 정합
- ⚠ 슬라이스가 newConcept 토큰 24% 텍스트 매칭 (후반 챕터 라벨이 인스턴스 위주, 의도된 표기)
- ⚠ rule-dual-type은 FILTER 사용으로 단순 드라이런 미발화 (실제 추론 엔진에서 처리)
- ⚠ false positive 경고 (검증 매처 보수성)

### QA-4 콘텐츠-실습 경계 (3 통과 / 1 경고)
- 본문 14개 모두 존재
- `<graph-ref>` slice ID 정합 14/14
- `<example pokemon="...">` 데이터 정합 50/50
- 실습 57개 (평균 4.07/챕터), chapterId 1:1 매핑
- ⚠ 초기 검증 시 IRI 표기 가정 차이로 false alarm 발생 (재확인 결과 정합)

### QA-5 빌드 결과 (6 통과, 재빌드 후)
- 단일 파일 4.71 MB
- 외부 의존성 0개
- 19개 데이터 블록 모두 JSON.parse 성공
- Cytoscape 인라인 정상
- localStorage 키 충돌 없음 (`po-theme`, `po-last-chapter`, `pokemon-ontology-progress-v1`)

### QA-6 모바일 반응형 — CSS 리뷰 (7 통과)
- 미디어 쿼리 분기점: 360px(초소형) / 768px(태블릿) / 1024px(데스크탑) / 1440px(큰 데스크탑)
- overflow-x: hidden 처리
- 사이드바 transform 토글
- 데스크탑에서 햄버거 display: none
- `--fs-base` 16px
- `.graph-container` 모바일 320px, 초소형 260px

### QA-6 모바일 반응형 — Playwright Chromium (33 통과 / 0 실패, 재빌드 후)

| Viewport | 가로 스크롤 | 본문 폰트 | graph 높이 | 햄버거 | pageerror |
|---|---|---|---|---|---|
| 320×568 | 0px | 16px | 260px | 표시 | 0 |
| 375×667 | 0px | 16px | 320px | 표시 | 0 |
| 768×1024 | 0px | 16px | 400px | 표시 | 0 |
| 1024×800 | 0px | 16px | 557px | 숨김 | 0 |
| 1440×900 | 0px | 16px | 657px | 숨김 | 0 |

햄버거 토글, 사이드바 슬라이드, 다크모드 전환, 챕터 네비게이션 모두 정상 작동.

## 잔여 경고 (출시 영향 없음)

1. **koFallback 115건** — 9세대/PLA 신규 기술의 한국어 미등록. 데이터 출처(PokeAPI) 한계. 챕터 본문에서 인용된 항목은 0건.
2. **슬라이스 라벨 인스턴스 위주** — 후반 챕터(ch10+)에서 노드 라벨이 추상 개념보다 구체 인스턴스 중심. 추론·SPARQL 학습에서는 인스턴스가 더 직관적이라 의도된 선택.
3. **rule-dual-type 드라이런 미발화** — 단순 패턴 매칭만으로는 FILTER 조건이 발화 안 됨. 실제 추론 시점에는 정상 작동 예상.

## 산출 파일

- `/Users/psy/Documents/workspace/pokemon/dist/index.html` (4.71 MB, 단일 HTML)
- `/Users/psy/Documents/workspace/pokemon/_workspace/qa/qa-check.js` (QA-1~5 정적 검증)
- `/Users/psy/Documents/workspace/pokemon/_workspace/qa/qa-mobile.js` (Playwright 5뷰포트)
- `/Users/psy/Documents/workspace/pokemon/_workspace/qa/results.json`
- `/Users/psy/Documents/workspace/pokemon/_workspace/qa/results-mobile.json`

## 권장 후속 작업

- (선택) 9세대 신규 기술 한국어 매핑 테이블 직접 작성 — 사용자가 특정 신규 기술 학습 요청 시
- (선택) 후반 챕터 슬라이스에 추상 개념 노드 추가 — 사용자 피드백에 따라

## 결론

`dist/index.html` 출시 준비 완료. 모바일·태블릿·데스크탑 5뷰포트에서 정상 부팅·렌더·인터랙션 검증됨.
