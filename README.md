# Learn Ontology with Pokémon · 포켓몬으로 배우는 온톨로지

[English](#english) · [한국어](#한국어)

An interactive, single-file HTML learning program that teaches **Ontology from scratch** — using all **1,025 Pokémon** as concrete examples. Beginners can move step-by-step from "what is a class?" to **SPARQL, OWL, reasoning, and upper ontologies**.

전 세대 **1,025마리 포켓몬**을 예시로 활용해 **온톨로지를 처음부터** 배우는 인터랙티브 단일 HTML 학습 프로그램입니다. 초보자가 "클래스란 무엇인가?"부터 시작해 **SPARQL · OWL · 추론 · 상위 온톨로지**까지 단계적으로 도달합니다.

![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg) ![Build](https://img.shields.io/badge/build-single%20HTML-brightgreen) ![Pokémon](https://img.shields.io/badge/Pok%C3%A9mon-1025-yellow) ![Chapters](https://img.shields.io/badge/chapters-14-purple) ![Exercises](https://img.shields.io/badge/exercises-57-orange)

---

## English

### Why this project?

Ontology is everywhere — search engines, knowledge graphs, semantic web — but most introductions throw RDF/OWL syntax at beginners before they understand *why* the syntax exists. This program flips that:

- Every abstract concept is introduced through Pokémon **first**, then generalized.
- Every chapter is **70 % hands-on practice**, not lecture.
- You **build graphs, drag-and-drop classifications, write triples, and run SPARQL** as you go.
- No setup, no install. Just open one HTML file in a browser.

### Demo

- **Live:** **https://amazingsyp.github.io/pokemon-ontology/**
- **Offline:** Just open `docs/index.html` in any modern browser (or [build it yourself](#build-it-yourself)). Works offline, mobile-friendly, no server needed.

### Highlights

| | |
|---|---|
| **14 chapters** | From "what is ontology?" to upper ontologies & domain reuse |
| **57 exercises** | Graph building, drag-and-drop, triple builders, SPARQL builders, reasoning simulations |
| **Interactive graphs** | Cytoscape.js with floating nodes, shadows, and live inference animations |
| **Korean-first** | All Pokémon names, types, moves, and explanations use the official Korean locale from PokeAPI |
| **Fully responsive** | 320 px phones to 1440 px desktops, tested with Playwright on 5 viewports |
| **Light & dark mode** | Persistent via `localStorage` |
| **Progress saved** | Your last chapter & completed exercises survive page reloads |
| **Single HTML file** | 4.7 MB, zero external dependencies, works fully offline |

### Curriculum

| # | Chapter | Core concepts |
|---|---------|---------------|
| 1 | What is Ontology? | Why structure knowledge; everyday ontologies |
| 2 | Classes & Instances | Categories vs. individuals (`is-a`) |
| 3 | Properties | Object vs. data properties |
| 4 | Relations & Triples | Subject – predicate – object |
| 5 | Hierarchy (is-a) | Subclass, inheritance |
| 6 | Multi-Classification | Two parents, dual-type Pokémon |
| 7 | Domain & Range | What can fill what slot |
| 8 | Inverse & Symmetry | `evolvesTo` ↔ `evolvesFrom`, transitive |
| 9 | RDF & Turtle | First taste of standard syntax |
| 10 | Intro to SPARQL | `SELECT`, `WHERE`, patterns |
| 11 | Advanced SPARQL | `FILTER`, `OPTIONAL`, aggregations |
| 12 | OWL Expressivity | Class restrictions, defined classes |
| 13 | Reasoning | Asserted vs. derived facts, animations |
| 14 | Upper Ontologies | Reuse beyond the Pokémon domain |

### Tech stack

- **Frontend:** Vanilla JavaScript, no framework. Single HTML bundle.
- **Graph:** [Cytoscape.js](https://js.cytoscape.org/) (inlined)
- **Data:** [PokeAPI](https://pokeapi.co/) Korean locale (`ko`)
- **Build:** Node.js 18+ (no other tooling)
- **QA:** Playwright (headless Chromium) for mobile-responsive verification

### Build it yourself

```bash
# 1. Fetch Korean Pokémon data from PokeAPI (with disk cache & retries; ~2 min)
node scripts/fetch-data.js

# 2. Bundle everything into a single docs/index.html
node scripts/build.js

# 3. Open it
open docs/index.html   # macOS
# or just double-click the file
```

The data fetch is fully reproducible: disk-cached under `_workspace/cache/`, idempotent re-runs.

### Project structure

```
.
├── docs/index.html              # ← The final single-file program (also served by GitHub Pages)
├── scripts/
│   ├── fetch-data.js            # PokeAPI → _workspace/data/
│   └── build.js                 # Bundle everything → docs/index.html
├── src/                         # Frontend source (CSS, JS, template)
├── _workspace/                  # Intermediate artifacts (curriculum, ontology, content)
├── .claude/                     # AI agent harness used to build this project
├── LICENSE                      # Apache 2.0
└── README.md                    # You are here
```

### Contributing

Issues, suggestions, and pull requests are welcome. If you find a pedagogical rough edge ("Chapter 7 felt confusing"), that feedback is especially valuable.

### Acknowledgements & disclaimer

- **PokeAPI** for the wonderful Pokémon dataset.
- **Pokémon** is © Nintendo / Creatures Inc. / GAME FREAK Inc. This is an **unofficial, non-commercial educational project**. No Pokémon imagery or copyrighted assets are bundled; only public structured data (names, types, stats) is used to teach ontology concepts.
- **Cytoscape.js** by The Cytoscape Consortium (MIT).

### License

Apache License 2.0 — see [LICENSE](./LICENSE).

Copyright © 2026 amazingsyp

---

## 한국어

### 왜 이 프로젝트인가요?

온톨로지는 검색 엔진, 지식 그래프, 시맨틱 웹 어디에나 있지만, 대부분의 입문서는 초보자에게 *왜* 이 개념이 필요한지 보여주기도 전에 RDF/OWL 문법부터 들이밉니다. 이 프로그램은 그 순서를 뒤집습니다:

- 모든 추상 개념은 **포켓몬 예시로 먼저** 만나고, 그 다음에 일반화합니다.
- 모든 챕터는 **실습 70 %**, 강의 30 %입니다.
- 직접 **그래프를 그리고, 분류를 드래그하고, 트리플을 짜고, SPARQL을 작성**하면서 배웁니다.
- 설치 없음, 설정 없음. HTML 파일 하나만 브라우저에서 열면 됩니다.

### 실행 방법

- **온라인:** **https://amazingsyp.github.io/pokemon-ontology/**
- **오프라인:** `docs/index.html`을 브라우저에서 열기만 하면 됩니다. 모바일 지원, 서버 불필요.

### 핵심 특징

| | |
|---|---|
| **14 챕터** | "온톨로지란?"부터 상위 온톨로지·도메인 재사용까지 |
| **57 실습** | 그래프 빌더, 드래그 분류, 트리플 빌더, SPARQL 빌더, 추론 시뮬레이션 |
| **인터랙티브 그래프** | Cytoscape.js 기반, 부유 노드 · 그림자 · 실시간 추론 애니메이션 |
| **한국어 우선** | 모든 포켓몬 이름·타입·기술·설명에 PokeAPI 공식 한국어 로케일 사용 |
| **완전 반응형** | 320 px 휴대폰부터 1440 px 데스크탑까지, Playwright로 5 뷰포트 검증 |
| **라이트·다크 모드** | `localStorage`에 저장 |
| **진도 저장** | 마지막으로 본 챕터와 완료한 실습이 새로고침 후에도 유지 |
| **단일 HTML** | 4.7 MB, 외부 의존성 0, 완전 오프라인 동작 |

### 커리큘럼

| # | 챕터 | 핵심 개념 |
|---|------|---------|
| 1 | 온톨로지란 무엇인가? | 왜 지식을 구조화하나, 일상 속 온톨로지 |
| 2 | 클래스와 인스턴스 | 종류 vs 개체 (`is-a`) |
| 3 | 속성(Property) | 객체 속성과 데이터 속성 |
| 4 | 관계와 트리플 | 주어 – 술어 – 목적어 |
| 5 | 계층과 상속 (is-a) | 서브클래스, 상속 |
| 6 | 분류와 다중 상속 | 두 부모, 듀얼타입 포켓몬 |
| 7 | 도메인과 레인지 | 어떤 자리에 무엇이 올 수 있나 |
| 8 | 역관계와 대칭성 | `진화함` ↔ `진화전`, 전이 |
| 9 | RDF와 Turtle | 표준 문법의 첫 맛 |
| 10 | SPARQL 입문 | `SELECT`, `WHERE`, 패턴 |
| 11 | SPARQL 심화 | `FILTER`, `OPTIONAL`, 집계 |
| 12 | OWL과 표현력 | 클래스 제약, 정의된 클래스 |
| 13 | 추론(Reasoning) | 명시 사실 vs 도출 사실, 애니메이션 |
| 14 | 상위 온톨로지·재사용 | 포켓몬 너머의 일반화 |

### 기술 스택

- **프론트엔드:** Vanilla JavaScript, 프레임워크 없음. 단일 HTML 번들.
- **그래프:** [Cytoscape.js](https://js.cytoscape.org/) (인라인)
- **데이터:** [PokeAPI](https://pokeapi.co/) 한국어 로케일 (`ko`)
- **빌드:** Node.js 18+ (그 외 의존성 없음)
- **QA:** Playwright (헤드리스 Chromium) 모바일 반응형 검증

### 직접 빌드하기

```bash
# 1. PokeAPI에서 한국어 데이터 수집 (디스크 캐시 + 재시도, 약 2분)
node scripts/fetch-data.js

# 2. 모든 것을 단일 docs/index.html로 번들
node scripts/build.js

# 3. 실행
open docs/index.html   # macOS
# 또는 파일을 더블클릭
```

데이터 수집은 완전히 재현 가능합니다: `_workspace/cache/`에 디스크 캐싱되며, 재실행해도 결과 동일.

### 프로젝트 구조

```
.
├── docs/index.html              # ← 최종 단일 HTML 프로그램 (GitHub Pages에서도 호스팅)
├── scripts/
│   ├── fetch-data.js            # PokeAPI → _workspace/data/
│   └── build.js                 # 모든 자산을 docs/index.html로 번들
├── src/                         # 프론트엔드 소스 (CSS, JS, 템플릿)
├── _workspace/                  # 중간 산출물 (커리큘럼, 온톨로지, 콘텐츠)
├── .claude/                     # 이 프로젝트를 빌드한 AI 에이전트 하네스
├── LICENSE                      # Apache 2.0
└── README.md                    # 지금 이 파일
```

### 기여

이슈, 제안, PR 모두 환영합니다. "7장 설명이 헷갈렸어요" 같은 **교육적 거친 모서리**에 대한 피드백은 특히 가치 있습니다.

### 감사의 말 · 면책 조항

- **PokeAPI** 의 훌륭한 포켓몬 데이터에 감사드립니다.
- **포켓몬**은 © Nintendo / Creatures Inc. / GAME FREAK Inc. 의 등록상표입니다. 본 프로젝트는 **비공식 · 비영리 교육 목적**이며, 포켓몬 이미지나 저작권 자산을 번들에 포함하지 않고 공개 구조화 데이터(이름, 타입, 종족값)만을 온톨로지 개념 학습에 활용합니다.
- **Cytoscape.js** by The Cytoscape Consortium (MIT).

### 라이선스

Apache License 2.0 — [LICENSE](./LICENSE) 파일 참조.

Copyright © 2026 amazingsyp
