---
name: pokemon-ontology-builder
description: 포켓몬 PokeAPI 데이터를 한국어로 받아 온톨로지 학습 프로그램(단일 HTML, 모바일 반응형, 12~15 챕터, 그래프 시각화, 인터랙티브 실습)을 구축하는 전체 워크플로우 오케스트레이터. "포켓몬 온톨로지 만들어줘", "온톨로지 학습 프로그램 빌드", "한국어 포켓몬 그래프 학습", "다시 빌드", "챕터 N만 다시", "데이터 새로 받아줘", "특정 챕터 수정", "QA 다시 돌려줘", "모바일 깨짐 고쳐줘" 같은 요청 시 반드시 이 스킬을 사용할 것.
---

# 포켓몬 온톨로지 학습 프로그램 오케스트레이터

PokeAPI에서 전 세대 1000+ 포켓몬 한국어 데이터를 받아, 온톨로지 초보자가 기초부터 고급(SPARQL·OWL·추론·상위 온톨로지)까지 학습할 수 있는 단일 HTML 인터랙티브 프로그램을 구축한다.

## 사용자 요구사항 (고정)

- **대상**: 온톨로지 비전공 한국어 초보자
- **데이터 범위**: 전 세대 1000+ 포켓몬, 풍부한 속성 (종족값·기술·서식지·앨음)
- **챕터 수**: 12~15개 (기초 → 중급 → 고급 → 응용)
- **실습 유형**: 그래프 직접 조작(노드/엣지 만들기) + 분류·매칭 드래그앤드롭 + 기타
- **빌드**: Node.js 빌드 스크립트 + 단일 HTML 산출물
- **UI**: 모던 학습 플랫폼 테마 (라이트/다크), 모바일·태블릿·PC 반응형
- **언어**: 한국어 (PokeAPI ko 로케일 사용)
- **배포**: 단일 `dist/index.html`, 외부 의존성 0, 오프라인 동작

## 실행 모드: 하이브리드

| Phase | 모드 | 이유 |
|-------|------|------|
| 0 | 메인 (오케스트레이터) | 컨텍스트·진척 확인 |
| 1 | 서브 에이전트 1명 | 데이터 수집은 독립적·순차 |
| 2 | 에이전트 팀 (2명) | 커리큘럼-매핑 협업 필요 |
| 3 | 에이전트 팀 (4명) | 콘텐츠·실습·그래프·프론트가 단일 HTML로 합쳐져야 함 |
| 4 | 서브 에이전트 1명 | QA는 독립 검증 |

각 Phase 끝에 산출물을 `_workspace/`에 저장하고, 다음 Phase에서 입력으로 사용한다.

## Phase 0: 컨텍스트 확인 (필수)

워크플로우 시작 시 반드시 `_workspace/` 상태를 확인하여 실행 모드를 결정한다.

```bash
# 확인 순서
1. _workspace/ 디렉토리 존재?
2. 어떤 산출물이 있는가?
   - _workspace/data/        → Phase 1 완료
   - _workspace/curriculum/  → Phase 2 일부 완료
   - _workspace/ontology/    → Phase 2 완료
   - _workspace/content/     → Phase 3 일부 완료
   - _workspace/frontend/    → Phase 3 일부 완료
   - dist/index.html         → 빌드 완료
3. 사용자 요청 분석:
   - "처음부터 다시" → 전체 재실행, 기존 _workspace를 _workspace_prev/로 이동
   - "데이터만 다시" → Phase 1만, 캐시 무시
   - "챕터 N만 다시" → Phase 3의 chapter-content-writer만
   - "모바일 깨짐 고쳐" → Phase 3의 frontend-architect + Phase 4 QA
   - "QA 다시" → Phase 4만
   - 명시 없음 + 기존 산출물 존재 → 무엇을 할지 사용자에게 물음
```

처음 호출이면 (`_workspace/` 없음) → 모든 Phase를 순차 실행.

## Phase 1: 데이터 수집

**실행 모드:** 서브 에이전트 (1명)

```javascript
Agent({
  description: "PokeAPI 한국어 데이터 수집",
  subagent_type: "general-purpose",
  model: "opus",
  prompt: `당신은 .claude/agents/pokedata-engineer.md 에 정의된 pokedata-engineer 에이전트입니다.

목표: PokeAPI에서 전 세대 1000+ 포켓몬의 한국어 데이터를 수집하여 _workspace/data/ 에 정규화 JSON으로 저장.

작업:
1. .claude/skills/pokemon-data-pipeline/SKILL.md 를 읽고 그 가이드를 따르세요.
2. scripts/fetch-data.js 빌드 스크립트를 작성하세요.
3. node scripts/fetch-data.js 를 실행하여 _workspace/data/ 산출물을 생성하세요.
4. 완료 후 산출물 통계(포켓몬 수, 타입 수, 한국어 누락 수, 빌드 시간)를 보고하세요.

산출물:
- _workspace/data/pokemon.json (1000+ 항목, 한국어 이름 포함)
- _workspace/data/types.json (18개 타입)
- _workspace/data/moves.json
- _workspace/data/abilities.json
- _workspace/data/habitats.json
- _workspace/data/generations.json
- _workspace/data/evolution-chains.json
- _workspace/data/eggGroups.json
- _workspace/data/meta.json (빌드 메타데이터)

제약:
- 네트워크 호출은 동시성 8 이하
- 디스크 캐싱 사용 (_workspace/cache/)
- 한국어 누락 시 영어 폴백 + meta.koFallback[] 기록
- 작업 디렉토리는 /Users/psy/Documents/workspace/pokemon`
});
```

완료 후 즉시 QA-1 실행 (qa-integration-validator로):
- 포켓몬 수 ≥ 1000
- 타입 수 = 18
- 한국어 누락 비율 < 5%
- 진화 체인 양방향 정합성

QA 실패 시 pokedata-engineer 재호출, 누락 항목 보충 요청.

## Phase 2: 커리큘럼 + 온톨로지 매핑

**실행 모드:** 에이전트 팀 (2명)

```javascript
TeamCreate({
  team_name: "ontology-design-team",
  members: ["ontology-curriculum-designer", "pokemon-ontology-mapper"]
});
```

작업 분배:
- `ontology-curriculum-designer`: 12~15 챕터 커리큘럼 설계 → `_workspace/curriculum/curriculum.json`
- `pokemon-ontology-mapper`: 데이터를 RDF/OWL로 매핑 + 챕터별 그래프 슬라이스 생성 → `_workspace/ontology/`

두 에이전트는 SendMessage로 협업:
- 커리큘럼 designer가 챕터별 `newConcepts` 결정
- mapper가 그 concepts를 매핑 가능한지 확인, 필요 시 designer에게 조정 요청
- mapper가 graph-slices/ 생성 시 designer의 pokemonExamples 참조

완료 후 QA-2, QA-3 즉시 실행.

## Phase 3: 콘텐츠 + 실습 + 그래프 + 프론트엔드 (병렬 협업)

**실행 모드:** 에이전트 팀 (4명, Phase 2 팀 해체 후 재구성)

```javascript
TeamDelete({ team_name: "ontology-design-team" });
TeamCreate({
  team_name: "build-team",
  members: ["chapter-content-writer", "interactive-exercise-builder", "graph-visualization-engineer", "frontend-architect"]
});
```

작업 흐름:
1. `chapter-content-writer`: 챕터 본문 한국어 집필 → `_workspace/content/chapters/`
2. `interactive-exercise-builder`: 실습 설계·정답 검증 로직 → `_workspace/content/exercises/`
3. `graph-visualization-engineer`: Cytoscape 모듈 → `_workspace/frontend/graph/`
4. `frontend-architect`: src/ 작성, build.js 작성, 모든 산출물 통합 → `dist/index.html`

협업 패턴:
- content-writer ↔ exercise-builder: 본문의 `<graph-ref>` 위치에서 실습 진입점 정렬
- graph-engineer ↔ exercise-builder: graph-build·reasoning-sim 실습 시 graph-interactions API 정의 합의
- frontend-architect는 다른 3명의 산출물이 어느 정도 모이면 build.js 작업 시작 가능

frontend-architect가 마지막으로 build.js를 실행하여 `dist/index.html` 생성.

완료 후 QA-4, QA-5, QA-6 즉시 실행.

## Phase 4: QA 통합 검증

**실행 모드:** 서브 에이전트 (1명, Phase 3 팀 해체 후)

```javascript
TeamDelete({ team_name: "build-team" });
Agent({
  description: "통합 QA 검증",
  subagent_type: "general-purpose",
  model: "opus",
  prompt: `당신은 .claude/agents/qa-integration-validator.md 에 정의된 qa-integration-validator 에이전트입니다.

목표: 전체 산출물의 경계면 정합성과 모바일 반응형을 검증.

작업:
1. .claude/skills/pokemon-ontology-qa/SKILL.md 의 QA-1 ~ QA-6 모두 수행.
2. _workspace/qa/report.md 에 결과 작성.
3. 실패 항목별로 권장 수정자(에이전트)를 명시.
4. 모바일 검증은 CSS 코드 리뷰 + (가능하면) Playwright/Puppeteer로 320/375/768/1280 뷰포트 확인.

만약 헤드리스 브라우저 사용 불가하면 코드 리뷰만 수행하고 그 사실을 사용자에게 명시.

산출물:
- _workspace/qa/report.md`
});
```

QA 결과 분석 후:
- 통과: 사용자에게 완료 보고 + dist/index.html 사용법 안내
- 실패: 권장 수정자에게 재작업 요청 (Phase 3 일부 재실행)

## 데이터 전달 프로토콜

- **파일 기반**: 모든 Phase 산출물은 `_workspace/` 하위 약속된 경로에 저장
- **메시지 기반**: 팀 내부 협업 (Phase 2, 3)
- **태스크 기반**: TaskCreate로 작업 분배·진행률 추적

파일 명명 컨벤션:
```
_workspace/
├── data/                  # Phase 1
├── curriculum/            # Phase 2 (designer)
├── ontology/              # Phase 2 (mapper)
├── content/
│   ├── chapters/          # Phase 3 (content-writer)
│   └── exercises/         # Phase 3 (exercise-builder)
├── frontend/
│   └── graph/             # Phase 3 (graph-engineer)
└── qa/                    # Phase 4
```

최종 산출물: `dist/index.html`. 중간 산출물(`_workspace/`)은 보존 — 후속 수정 시 부분 재실행 가능하도록.

## 에러 핸들링

| 에러 유형 | 대응 |
|---------|------|
| PokeAPI 네트워크 실패 | 지수 백오프 3회 → meta.failed에 기록, 학습에 영향 없으면 진행 |
| 한국어 로케일 누락 | 영어 폴백 + meta.koFallback에 기록, 본문에서는 가능한 다른 포켓몬 사용 |
| 챕터 본문 집필 실패 (한 챕터) | 해당 챕터만 재호출, 다른 챕터는 진행 |
| 빌드 결과 단일 HTML > 60MB | 데이터 축소 옵션 (moves/koFlavor 삭제) 후 재빌드 |
| 모바일 뷰포트 깨짐 | frontend-architect에 구체적 깨짐 위치 + CSS 경로 전달, 재작업 |

## 후속 작업 (부분 재실행)

| 사용자 요청 | 실행할 Phase |
|---------|------------|
| "데이터 새로 받아줘" | Phase 1 (캐시 무시) |
| "챕터 N만 다시 써줘" | Phase 3의 chapter-content-writer 단일 챕터 |
| "실습 너무 어려워" | Phase 3의 interactive-exercise-builder, 난이도 조정 |
| "그래프가 모바일에서 작아" | Phase 3의 graph-visualization-engineer (graph-mobile.js) |
| "다크모드 색이 이상해" | Phase 3의 frontend-architect (theme.css) |
| "다시 빌드만" | Phase 3의 frontend-architect (build.js만) |
| "QA 다시" | Phase 4 |
| "전체 다시" | _workspace/ → _workspace_prev/ 백업 후 모든 Phase |

## 진행 상황 보고

각 Phase 시작·완료 시 사용자에게 짧게 보고:

```
[Phase 1/4] 데이터 수집 중... (예상 5~8분)
✓ Phase 1 완료: 1025마리, 18타입, 한국어 누락 12개

[Phase 2/4] 커리큘럼 설계 + 온톨로지 매핑 중...
✓ Phase 2 완료: 14 챕터, 287 클래스/속성, 12 추론 규칙

[Phase 3/4] 콘텐츠·실습·그래프·UI 빌드 중...
✓ Phase 3 완료: dist/index.html (23.4 MB)

[Phase 4/4] 통합 QA 검증 중...
✓ Phase 4 완료: 통과 42, 경고 3, 실패 0
```

## 테스트 시나리오

### 정상 흐름
1. 사용자: "포켓몬 온톨로지 학습 프로그램 만들어줘"
2. Phase 0: `_workspace/` 없음 → 전체 신규 빌드
3. Phase 1 → 4 순차 실행
4. dist/index.html 생성, QA 리포트 전달

### 부분 재실행
1. 사용자: "챕터 7만 다시 써줘. 너무 딱딱해"
2. Phase 0: `_workspace/content/chapters/ch07.json` 존재 확인
3. chapter-content-writer만 호출, ch07만 재집필
4. frontend-architect의 build.js 재실행
5. QA-4, QA-5만 부분 검증

### 에러 흐름
1. PokeAPI 502 에러 빈발
2. pokedata-engineer가 3회 재시도 후 실패 항목 기록
3. 실패 비율 < 5%면 계속 진행, 사용자에 경고
4. 실패 비율 ≥ 5%면 사용자에게 보고하고 일시 정지

## 변경 이력 갱신

이 워크플로우 실행 후 의미 있는 학습 또는 사용자 피드백이 있으면 CLAUDE.md 변경 이력에 추가.
