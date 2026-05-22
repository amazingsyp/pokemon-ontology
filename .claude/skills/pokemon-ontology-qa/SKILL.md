---
name: pokemon-ontology-qa
description: 포켓몬 온톨로지 학습 프로그램의 데이터·콘텐츠·실습·그래프·모바일 반응형 통합 검증 체크리스트와 경계면 교차 QA 패턴. 한국어 누락, 깨진 참조, 정답 오류, 빌드 산출물 무결성, 모바일 뷰포트 깨짐 검출 시 사용.
---

# 포켓몬 온톨로지 QA

각 에이전트가 만든 산출물이 서로 정확히 맞물려 학습자가 끊김 없이 진행 가능한지 검증.

## QA 철학

"각 모듈이 잘 만들어졌다"는 모듈 작성자가 책임. QA는 **경계면(boundary)을 교차 확인**한다.

| 경계면 | 검증 대상 |
|-------|---------|
| 데이터 ↔ 콘텐츠 | 본문에서 인용하는 포켓몬이 데이터에 실재? |
| 콘텐츠 ↔ 실습 | 실습 정답이 본문에서 학습한 트리플과 일치? |
| 실습 ↔ 그래프 | 실습 예상 그래프 구조가 슬라이스와 호환? |
| 빌드 ↔ 런타임 | 임베드된 데이터가 main.js에서 정상 로드? |
| 데스크탑 ↔ 모바일 | 320px~1920px 전 구간 깨짐 없음? |

## 단계별 QA (점진적)

각 Phase 직후 즉시 수행. 마지막에 몰아서 X.

### QA-1: 데이터 정합성 (pokedata-engineer 직후)

```javascript
const pokemon = require('./_workspace/data/pokemon.json');
const types = require('./_workspace/data/types.json');
const evolutionChains = require('./_workspace/data/evolution-chains.json');
const meta = require('./_workspace/data/meta.json');

// 항목 수
assert(pokemon.items.length >= 1000, `포켓몬 수: ${pokemon.items.length}`);
assert(types.items.length === 18, `타입 수: ${types.items.length}`);

// 한국어 누락
const koMissing = pokemon.items.filter(p => !p.koName).length;
console.log(`koName 누락: ${koMissing} (전체의 ${(koMissing/pokemon.items.length*100).toFixed(1)}%)`);

// 진화 체인 양방향
const chainIds = new Set(evolutionChains.items.map(c => c.id));
const orphans = pokemon.items.filter(p => p.evolutionChainId && !chainIds.has(p.evolutionChainId));
assert(orphans.length === 0, `진화 체인 고아: ${orphans.map(o => o.koName).join(', ')}`);

// meta.failed 임계치
assert(meta.failed.length / pokemon.items.length < 0.01, `실패율: ${meta.failed.length}`);
```

### QA-2: 커리큘럼 정합성 (designer 직후)

```javascript
const curriculum = require('./_workspace/curriculum/curriculum.json');
const chapterIds = new Set(curriculum.chapters.map(c => c.id));
const conceptIds = new Set(curriculum.conceptGlossary.map(c => c.id));

assert(curriculum.chapters.length >= 12 && curriculum.chapters.length <= 15);

for (const ch of curriculum.chapters) {
  // 선행 챕터 존재
  for (const pre of ch.prerequisiteChapters) {
    assert(chapterIds.has(pre), `${ch.id}: 미존재 선행 ${pre}`);
  }
  // 새 개념 사전 정의
  for (const c of ch.newConcepts) {
    assert(conceptIds.has(c), `${ch.id}: 미정의 개념 ${c}`);
  }
  // 포켓몬 예시 실재
  for (const p of ch.pokemonExamples) {
    assert(pokemonIds.has(p), `${ch.id}: 미존재 포켓몬 ${p}`);
  }
}
```

### QA-3: 온톨로지 매핑 정합성 (mapper 직후)

```javascript
const schema = require('./_workspace/ontology/schema.json');
const triples = require('./_workspace/ontology/triples.json');
const slices = readSlicesDir('./_workspace/ontology/graph-slices/');

const classIris = new Set(schema.classes.map(c => c.iri));
const propIris = new Set(schema.properties.map(p => p.iri));

// 클래스 parent 정합
for (const c of schema.classes) {
  if (c.parent) assert(classIris.has(c.parent), `${c.iri}: 미존재 parent ${c.parent}`);
}

// 트리플의 predicate 정합 (rdf:type, rdfs:label, poke:* 만 허용)
const allowedPreds = new Set(['rdf:type', 'rdfs:label', 'rdfs:subClassOf', 'owl:inverseOf']);
for (const [s, p, o] of triples) {
  if (!allowedPreds.has(p) && !propIris.has(p)) {
    console.warn(`알 수 없는 predicate: ${p}`);
  }
}

// 챕터 슬라이스가 챕터 newConcepts를 시각적으로 포함
for (const ch of curriculum.chapters) {
  const slice = slices[ch.id];
  if (!slice) {
    console.error(`${ch.id}: 슬라이스 누락`);
    continue;
  }
  // 슬라이스 크기 합리성
  const expectedRange = getExpectedSliceSize(ch.order);
  assert(slice.nodes.length >= expectedRange.min && slice.nodes.length <= expectedRange.max);
}
```

### QA-4: 콘텐츠-실습 경계 (content + exercise 직후)

```javascript
const chapters = readChapterContents();
const exercises = readExercises();

for (const ch of curriculum.chapters) {
  const body = chapters[ch.id].body;

  // <graph-ref slice="..."> 가 실재
  const graphRefs = body.match(/<graph-ref slice="([^"]+)"/g) || [];
  for (const ref of graphRefs) {
    const sliceId = ref.match(/slice="([^"]+)"/)[1];
    assert(slices[sliceId], `${ch.id} 본문: 미존재 슬라이스 ${sliceId}`);
  }

  // <example pokemon="..."> 가 실재
  const examples = body.match(/<example pokemon="([^"]+)"/g) || [];
  for (const ex of examples) {
    const pid = ex.match(/pokemon="([^"]+)"/)[1];
    assert(pokemonLookup[pid], `${ch.id} 본문: 미존재 포켓몬 예시 ${pid}`);
  }

  // 실습 1:1 매핑
  const exForCh = exercises.filter(e => e.chapterId === ch.id);
  assert(exForCh.length >= 3, `${ch.id}: 실습 수 ${exForCh.length} < 3`);

  // 실습 정답이 triples.json 기반
  for (const exFile of exForCh) {
    for (const ex of exFile.exercises) {
      validateExerciseAnswers(ex, triples, inferenceResults);
    }
  }
}
```

### QA-5: 빌드 결과 검증 (frontend-architect 직후)

```javascript
const html = fs.readFileSync('dist/index.html', 'utf8');

// 외부 의존성 0
const externalLinks = html.match(/(src|href)="https?:\/\/(?!localhost)[^"]+"/g) || [];
assert(externalLinks.length === 0, `외부 참조: ${externalLinks.join(', ')}`);

// 데이터 임베드
['pokemon', 'curriculum', 'chapters', 'exercises', 'graphSlices', 'schema'].forEach(key => {
  assert(html.includes(`id="data-${key}"`), `데이터 누락: ${key}`);
});

// JSON.parse 성공
const dataBlocks = html.match(/<script type="application\/json" id="data-(\w+)">([\s\S]*?)<\/script>/g);
for (const block of dataBlocks) {
  const match = block.match(/id="data-(\w+)">([\s\S]*?)<\/script>/);
  try {
    JSON.parse(match[2]);
  } catch (e) {
    throw new Error(`data-${match[1]} JSON 파싱 실패: ${e.message}`);
  }
}

// 크기
const sizeMB = fs.statSync('dist/index.html').size / 1024 / 1024;
if (sizeMB > 40) console.warn(`⚠ HTML 크기 ${sizeMB.toFixed(1)} MB (목표 < 40MB)`);
if (sizeMB > 60) throw new Error(`HTML 크기 ${sizeMB.toFixed(1)} MB — 너무 큼`);
```

### QA-6: 모바일 반응형 (필수, frontend-architect 후)

브라우저 자동화가 가능하면 Playwright/Puppeteer로:

```javascript
// 가상 검증 (실제 헤드리스 브라우저가 있다면)
const viewports = [
  { name: 'iPhone SE', width: 375, height: 667 },
  { name: 'small mobile', width: 320, height: 568 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 }
];

for (const vp of viewports) {
  // 1. 가로 스크롤 발생 X
  // 2. 햄버거 버튼이 보이는지 (모바일/태블릿) 또는 숨겨졌는지 (데스크탑)
  // 3. 그래프 컨테이너가 0 높이가 아닌지
  // 4. 본문 폰트 사이즈 ≥ 16px
  // 5. 사이드바 토글 동작
}
```

브라우저 자동화 불가 시 CSS 코드 리뷰:
- 미디어 쿼리 분기점 (768px, 1024px)에서 레이아웃 전환 정의?
- `overflow-x` 처리?
- 모바일에서 `position: fixed` 햄버거가 z-index 충돌 없음?
- 폰트 사이즈 `var(--fs-base)` 기준 16px 이상?

## QA 리포트 (`_workspace/qa/report.md`)

```markdown
# QA 리포트 (2026-MM-DD HH:MM)

## 요약
- 검증 단계: 6/6
- 통과: N
- 실패: N
- 경고: N
- 빌드 산출물 크기: 23.4 MB

## 단계별 결과

### QA-1 (데이터)
- ✓ 포켓몬 1025개
- ⚠ koName 누락 12개 (영어 폴백)
- ✓ 진화 체인 정합성

### QA-2 (커리큘럼)
...

### QA-5 (빌드)
- ✓ 외부 의존성 0
- ✓ 모든 데이터 임베드
- ✓ JSON 파싱 성공
- ⚠ 크기 23.4MB (목표 미만)

### QA-6 (모바일)
- ✓ 375px iPhone SE: 가로 스크롤 없음
- ✗ 320px 화면: 챕터 제목 일부 잘림 (sidebar.css 라인 42)
- 권장 수정자: frontend-architect

## 실패 상세
### [심각도: 높음] ch07 실습 ex-07-02 정답 오류
- 위치: _workspace/content/exercises/ch07.json
- 문제: expectedAnswers의 트리플이 triples.json에 없음
- 권장 수정자: interactive-exercise-builder
```

## QA 재실행

수정 후 부분 QA 가능:
- `--only=data` : QA-1만
- `--only=build` : QA-5만
- `--changed` : 마지막 QA 이후 변경된 파일 영역만
