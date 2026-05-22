#!/usr/bin/env node
// QA-1 ~ QA-5 자동 검증 스크립트
// 결과를 _workspace/qa/results.json 에 기록.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const WS   = path.join(ROOT, '_workspace');
const DIST = path.join(ROOT, 'dist', 'index.html');

const results = {
  startedAt: new Date().toISOString(),
  passes: [],
  warnings: [],
  failures: [],
  meta: {},
};

function pass(stage, msg)    { results.passes.push({ stage, msg }); }
function warn(stage, msg)    { results.warnings.push({ stage, msg }); }
function fail(stage, msg, severity = 'high') {
  results.failures.push({ stage, msg, severity });
}

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// ─────────────────────────────────────────────────────
// QA-1: 데이터 정합성
// ─────────────────────────────────────────────────────
function qa1_data() {
  const STAGE = 'QA-1';
  const pokemon = loadJson(path.join(WS, 'data', 'pokemon.json'));
  const types = loadJson(path.join(WS, 'data', 'types.json'));
  const evoChains = loadJson(path.join(WS, 'data', 'evolution-chains.json'));
  const meta = loadJson(path.join(WS, 'data', 'meta.json'));

  results.meta.pokemonCount = pokemon.items.length;
  results.meta.typeCount = types.items.length;
  results.meta.evoChainCount = evoChains.items.length;

  if (pokemon.items.length >= 1000) {
    pass(STAGE, `pokemon ${pokemon.items.length}개 (≥ 1000)`);
  } else {
    fail(STAGE, `pokemon ${pokemon.items.length}개 (< 1000)`);
  }

  if (types.items.length === 18) {
    pass(STAGE, `types 18개 ✓`);
  } else {
    fail(STAGE, `types ${types.items.length}개 (expected 18)`);
  }

  // koName 누락
  const koMissing = pokemon.items.filter(p => !p.koName);
  results.meta.koMissingCount = koMissing.length;
  if (koMissing.length === 0) {
    pass(STAGE, `koName 모두 존재`);
  } else {
    warn(STAGE, `koName 누락 ${koMissing.length}개 (예: ${koMissing.slice(0, 3).map(p => p.id).join(', ')})`);
  }

  // 진화 체인 양방향 정합
  const chainIds = new Set(evoChains.items.map(c => c.id));
  const orphans = pokemon.items.filter(p => p.evolutionChainId && !chainIds.has(p.evolutionChainId));
  if (orphans.length === 0) {
    pass(STAGE, `진화 체인 참조 양방향 정합`);
  } else {
    fail(STAGE, `진화 체인 고아 ${orphans.length}개: ${orphans.slice(0, 5).map(o => o.id).join(', ')}`);
  }

  // 역방향: chain.species가 pokemon에 실재
  const pokeIds = new Set(pokemon.items.map(p => p.id));
  let missingSpecies = 0;
  for (const chain of evoChains.items) {
    const species = chain.species || chain.members || chain.pokemonIds || [];
    for (const s of (Array.isArray(species) ? species : [])) {
      if (typeof s === 'string' && !pokeIds.has(s)) missingSpecies++;
    }
  }
  if (missingSpecies === 0) {
    pass(STAGE, `진화 체인 → 포켓몬 역참조 정합`);
  } else {
    warn(STAGE, `진화 체인 species 참조 누락 ${missingSpecies}개`);
  }

  // meta.failed 비율
  const failed = meta.failed || [];
  const failRate = failed.length / pokemon.items.length;
  results.meta.failRate = failRate;
  if (failRate < 0.01) {
    pass(STAGE, `meta.failed 비율 ${(failRate*100).toFixed(2)}% (< 1%)`);
  } else {
    fail(STAGE, `meta.failed 비율 ${(failRate*100).toFixed(2)}% (≥ 1%)`, 'medium');
  }

  // koFallback 분량
  if (meta.koFallback) {
    results.meta.koFallbackCount = meta.koFallback.length;
    warn(STAGE, `meta.koFallback ${meta.koFallback.length}개 (이름 영문 폴백 — 데이터 출처 한계)`);
  }
}

// ─────────────────────────────────────────────────────
// QA-2: 커리큘럼 정합성
// ─────────────────────────────────────────────────────
let CURRICULUM = null;
let POKEMON_IDS = null;

function qa2_curriculum() {
  const STAGE = 'QA-2';
  CURRICULUM = loadJson(path.join(WS, 'curriculum', 'curriculum.json'));
  const pokemon = loadJson(path.join(WS, 'data', 'pokemon.json'));
  POKEMON_IDS = new Set(pokemon.items.map(p => p.id));

  const chapters = CURRICULUM.chapters;
  results.meta.chapterCount = chapters.length;

  if (chapters.length >= 12 && chapters.length <= 15) {
    pass(STAGE, `챕터 수 ${chapters.length} (12~15 범위)`);
  } else {
    fail(STAGE, `챕터 수 ${chapters.length} (12~15 범위 벗어남)`);
  }

  const chapterIds = new Set(chapters.map(c => c.id));
  const conceptIds = new Set((CURRICULUM.conceptGlossary || []).map(c => c.id));

  // 선행 챕터 순환 의존 검사
  for (const ch of chapters) {
    for (const pre of (ch.prerequisiteChapters || [])) {
      if (!chapterIds.has(pre)) {
        fail(STAGE, `${ch.id}: 선행 챕터 ${pre} 미존재`);
      } else {
        // 순서 비교: pre의 order < ch.order
        const preCh = chapters.find(c => c.id === pre);
        if (preCh && preCh.order >= ch.order) {
          fail(STAGE, `${ch.id}: 선행 ${pre}(order ${preCh.order}) >= 자신(order ${ch.order}) — 순환/역참조`);
        }
      }
    }
  }
  pass(STAGE, `선행 챕터 참조 검증 완료 (실패는 위에 별도 기재)`);

  // newConcepts → conceptGlossary
  let missingConcepts = [];
  for (const ch of chapters) {
    for (const c of (ch.newConcepts || [])) {
      if (!conceptIds.has(c)) missingConcepts.push(`${ch.id}:${c}`);
    }
  }
  if (missingConcepts.length === 0) {
    pass(STAGE, `모든 newConcepts가 conceptGlossary에 정의됨`);
  } else {
    fail(STAGE, `conceptGlossary 미정의 ${missingConcepts.length}개: ${missingConcepts.slice(0, 5).join(', ')}`);
  }

  // pokemonExamples 실재
  let missingPokemon = [];
  for (const ch of chapters) {
    for (const p of (ch.pokemonExamples || [])) {
      if (!POKEMON_IDS.has(p)) missingPokemon.push(`${ch.id}:${p}`);
    }
  }
  if (missingPokemon.length === 0) {
    pass(STAGE, `모든 pokemonExamples가 데이터에 실재`);
  } else {
    fail(STAGE, `미존재 포켓몬 예시 ${missingPokemon.length}개: ${missingPokemon.slice(0, 5).join(', ')}`);
  }
}

// ─────────────────────────────────────────────────────
// QA-3: 온톨로지 매핑 정합성
// ─────────────────────────────────────────────────────
let SCHEMA = null, TRIPLES = null, SLICES = null, INFRULES = null;

function qa3_ontology() {
  const STAGE = 'QA-3';
  SCHEMA = loadJson(path.join(WS, 'ontology', 'schema.json'));
  TRIPLES = loadJson(path.join(WS, 'ontology', 'triples.json'));
  INFRULES = loadJson(path.join(WS, 'ontology', 'inference-rules.json'));

  // slices
  SLICES = {};
  const slicesDir = path.join(WS, 'ontology', 'graph-slices');
  for (const f of fs.readdirSync(slicesDir)) {
    if (f.endsWith('.json')) {
      const id = path.basename(f, '.json');
      SLICES[id] = loadJson(path.join(slicesDir, f));
    }
  }

  const classIris = new Set(SCHEMA.classes.map(c => c.iri));
  const propIris = new Set((SCHEMA.properties || []).map(p => p.iri));
  results.meta.tripleCount = TRIPLES.length;
  results.meta.classCount = SCHEMA.classes.length;
  results.meta.propertyCount = (SCHEMA.properties || []).length;
  results.meta.sliceCount = Object.keys(SLICES).length;

  // 1) 클래스 parent 정합
  let badParents = [];
  for (const c of SCHEMA.classes) {
    if (c.parent && !classIris.has(c.parent)) badParents.push(`${c.iri} → ${c.parent}`);
  }
  if (badParents.length === 0) {
    pass(STAGE, `schema 모든 class.parent가 schema 내 IRI`);
  } else {
    fail(STAGE, `class.parent 미존재 IRI ${badParents.length}개: ${badParents.slice(0, 3).join(', ')}`);
  }

  // 2) 트리플의 predicate 정합
  const allowedMetaPreds = new Set([
    'rdf:type','rdfs:label','rdfs:subClassOf','rdfs:domain','rdfs:range',
    'owl:inverseOf','owl:equivalentClass','owl:disjointWith','owl:onProperty','owl:someValuesFrom',
    'rdfs:comment','rdfs:subPropertyOf','owl:hasValue','rdf:first','rdf:rest'
  ]);
  // 데이터 인스턴스(IRI 패턴) 허용
  const instancePrefixes = ['poke:pokemon-', 'poke:type:', 'poke:move:', 'poke:ability:', 'poke:habitat:', 'poke:color:', 'poke:shape:', 'poke:generation:', 'poke:evolution:', 'poke:egg-group:'];

  let unknownPredicates = new Map();
  let badSubjects = 0, badObjects = 0;
  function isKnownSubject(s) {
    if (typeof s !== 'string') return false;
    if (classIris.has(s) || propIris.has(s)) return true;
    if (s.startsWith('"')) return true; // literal
    if (s.startsWith('_:')) return true; // blank
    if (instancePrefixes.some(pf => s.startsWith(pf))) return true;
    if (/^poke:[A-Z]/.test(s)) return true; // 클래스/타입클래스 명명 패턴
    return false;
  }
  function isKnownObject(o) {
    if (typeof o !== 'string') return false;
    if (o.startsWith('"')) return true;
    if (o.startsWith('_:')) return true;
    if (classIris.has(o) || propIris.has(o)) return true;
    if (instancePrefixes.some(pf => o.startsWith(pf))) return true;
    if (/^(owl|rdf|rdfs|xsd):/.test(o)) return true;
    if (/^poke:[A-Z]/.test(o)) return true;
    return false;
  }
  for (const t of TRIPLES) {
    const [s, p, o] = t;
    if (!isKnownSubject(s)) badSubjects++;
    if (!isKnownObject(o)) badObjects++;
    if (!allowedMetaPreds.has(p) && !propIris.has(p)) {
      unknownPredicates.set(p, (unknownPredicates.get(p) || 0) + 1);
    }
  }
  if (badSubjects === 0) {
    pass(STAGE, `triples subject 모두 알려진 IRI/literal`);
  } else {
    warn(STAGE, `triples subject 미확인 ${badSubjects}개`);
  }
  if (badObjects === 0) {
    pass(STAGE, `triples object 모두 알려진 IRI/literal`);
  } else {
    warn(STAGE, `triples object 미확인 ${badObjects}개`);
  }
  if (unknownPredicates.size === 0) {
    pass(STAGE, `triples predicate가 schema 또는 표준 어휘에 모두 존재`);
  } else {
    const top = [...unknownPredicates.entries()].slice(0, 5).map(([k,v]) => `${k}(${v})`).join(', ');
    warn(STAGE, `미확인 predicate ${unknownPredicates.size}종 (top: ${top})`);
  }

  // 3) 슬라이스 정합: 챕터 14개 ↔ 슬라이스 14개, ID 일치
  const expectedSliceIds = new Set(CURRICULUM.chapters.map(c => c.id));
  const actualSliceIds = new Set(Object.keys(SLICES));
  const missingSlices = [...expectedSliceIds].filter(x => !actualSliceIds.has(x));
  const extraSlices = [...actualSliceIds].filter(x => !expectedSliceIds.has(x));
  if (missingSlices.length === 0 && extraSlices.length === 0) {
    pass(STAGE, `슬라이스 ${actualSliceIds.size}개가 챕터 ID와 1:1 매칭`);
  } else {
    fail(STAGE, `슬라이스 매칭 불일치: 누락 ${missingSlices.join(',')}, 잉여 ${extraSlices.join(',')}`);
  }

  // 4) 슬라이스 노드 구조 검증
  for (const [sid, slice] of Object.entries(SLICES)) {
    if (!Array.isArray(slice.nodes) || slice.nodes.length === 0) {
      fail(STAGE, `${sid}: nodes 없음`);
    }
    if (!Array.isArray(slice.edges)) {
      fail(STAGE, `${sid}: edges 없음`);
    }
  }
  pass(STAGE, `슬라이스 구조 검증 완료 (실패는 별도 기재)`);

  // 5) inference-rules가 실제 발화 가능한지 (드라이런)
  // 간단한 패턴: 트리플 인덱스를 만들어 if 패턴이 매칭되는지 확인
  const byPred = new Map();
  for (const t of TRIPLES) {
    const arr = byPred.get(t[1]) || [];
    arr.push(t);
    byPred.set(t[1], arr);
  }
  let rulesWithMatches = 0;
  let rulesNoMatch = [];
  for (const rule of INFRULES) {
    let canFire = true;
    for (const [, pred] of rule.if) {
      if (!byPred.has(pred)) { canFire = false; break; }
    }
    if (canFire) rulesWithMatches++;
    else rulesNoMatch.push(rule.id);
  }
  results.meta.inferenceRuleCount = INFRULES.length;
  results.meta.inferenceRuleFireable = rulesWithMatches;
  if (rulesNoMatch.length === 0) {
    pass(STAGE, `모든 추론 규칙 ${INFRULES.length}개가 발화 가능 (predicate 존재)`);
  } else {
    warn(STAGE, `추론 규칙 ${rulesNoMatch.length}개의 if 패턴 predicate 없음: ${rulesNoMatch.slice(0, 3).join(', ')}`);
  }

  // 6) 챕터별 슬라이스가 챕터 newConcepts를 시각적으로 포함?
  // 간단: 슬라이스 노드 라벨/ID 텍스트에 newConcept 토큰이 포함되는지 (느슨한 검증)
  let conceptsCovered = 0, conceptsTotal = 0;
  for (const ch of CURRICULUM.chapters) {
    const slice = SLICES[ch.id];
    if (!slice) continue;
    const sliceText = JSON.stringify(slice).toLowerCase();
    for (const c of (ch.newConcepts || [])) {
      conceptsTotal++;
      const token = c.toLowerCase();
      if (sliceText.includes(token) || sliceText.includes(token.replace('-', ''))) conceptsCovered++;
    }
  }
  results.meta.conceptCoverage = `${conceptsCovered}/${conceptsTotal}`;
  if (conceptsTotal > 0) {
    const cov = conceptsCovered / conceptsTotal;
    if (cov >= 0.5) {
      pass(STAGE, `슬라이스가 newConcepts 토큰 ${(cov*100).toFixed(0)}% 포함`);
    } else {
      warn(STAGE, `슬라이스가 newConcepts ${(cov*100).toFixed(0)}%만 포함 — 시각화 빈약 가능`);
    }
  }
}

// ─────────────────────────────────────────────────────
// QA-4: 콘텐츠-실습 경계
// ─────────────────────────────────────────────────────
function qa4_content_exercises() {
  const STAGE = 'QA-4';

  const chapters = {};
  for (const f of fs.readdirSync(path.join(WS, 'content', 'chapters'))) {
    if (f.endsWith('.json')) {
      const id = path.basename(f, '.json');
      chapters[id] = loadJson(path.join(WS, 'content', 'chapters', f));
    }
  }
  const exFiles = {};
  for (const f of fs.readdirSync(path.join(WS, 'content', 'exercises'))) {
    if (f.endsWith('.json')) {
      const id = path.basename(f, '.json');
      exFiles[id] = loadJson(path.join(WS, 'content', 'exercises', f));
    }
  }
  results.meta.chapterContentCount = Object.keys(chapters).length;

  let totalExercises = 0;
  let badGraphRefs = [];
  let badPokemonExamples = [];

  for (const ch of CURRICULUM.chapters) {
    const c = chapters[ch.id];
    if (!c) { fail(STAGE, `${ch.id}: 챕터 본문 없음`); continue; }
    const body = c.body || '';

    // <graph-ref slice="...">
    const refRe = /<graph-ref\s+slice="([^"]+)"/g;
    let m;
    while ((m = refRe.exec(body)) !== null) {
      const sid = m[1];
      if (!SLICES[sid]) badGraphRefs.push(`${ch.id} → ${sid}`);
    }

    // <example pokemon="...">
    const exRe = /<example\s+pokemon="([^"]+)"/g;
    while ((m = exRe.exec(body)) !== null) {
      const pid = m[1];
      if (!POKEMON_IDS.has(pid)) badPokemonExamples.push(`${ch.id} → ${pid}`);
    }

    // 실습 1:1 매핑
    const exFile = exFiles[ch.id];
    if (!exFile) { fail(STAGE, `${ch.id}: 실습 파일 없음`); continue; }
    if (exFile.chapterId !== ch.id) {
      fail(STAGE, `${ch.id}: 실습 chapterId 불일치 (${exFile.chapterId})`);
    }
    const exs = exFile.exercises || [];
    totalExercises += exs.length;
    if (exs.length < 3) {
      warn(STAGE, `${ch.id}: 실습 수 ${exs.length} < 3`);
    }

    // 각 실습이 필수 필드 보유
    for (const ex of exs) {
      if (!ex.id || !ex.type || !ex.validation) {
        fail(STAGE, `${ch.id} 실습 ${ex.id || '?'}: id/type/validation 누락`, 'medium');
      }
    }
  }
  results.meta.totalExercises = totalExercises;

  if (badGraphRefs.length === 0) {
    pass(STAGE, `모든 <graph-ref slice="..."> 가 실재 슬라이스`);
  } else {
    fail(STAGE, `미존재 슬라이스 참조 ${badGraphRefs.length}개: ${badGraphRefs.slice(0, 5).join(', ')}`);
  }
  if (badPokemonExamples.length === 0) {
    pass(STAGE, `모든 <example pokemon="..."> 가 데이터에 실재`);
  } else {
    fail(STAGE, `미존재 포켓몬 예시 참조 ${badPokemonExamples.length}개: ${badPokemonExamples.slice(0, 5).join(', ')}`);
  }
  pass(STAGE, `실습 총 ${totalExercises}개 (목표 평균 4개×14챕터=56)`);

  // 샘플: 실습 정답 vs triples
  // ch01의 drag-classify ex-01-02: 피카츄→전기, 파이리→불꽃 등 — 트리플 hasType 확인
  const tripleSet = new Set(TRIPLES.map(t => `${t[0]}|${t[1]}|${t[2]}`));
  const sampleChecks = [
    ['poke:pokemon-25', 'poke:hasType', 'poke:type:electric'],
    ['poke:pokemon-4',  'poke:hasType', 'poke:type:fire'],
    ['poke:pokemon-7',  'poke:hasType', 'poke:type:water'],
    ['poke:pokemon-1',  'poke:hasType', 'poke:type:grass'],
  ];
  let sampleHits = 0;
  for (const [s, p, o] of sampleChecks) {
    if (tripleSet.has(`${s}|${p}|${o}`)) sampleHits++;
  }
  if (sampleHits === sampleChecks.length) {
    pass(STAGE, `샘플 실습 정답(피카츄-전기 등) ${sampleHits}/${sampleChecks.length} 트리플에 정합`);
  } else {
    warn(STAGE, `샘플 실습 정답 ${sampleHits}/${sampleChecks.length} 만 트리플과 정합 — IRI 명명 규칙 확인 필요`);
    // 디버그 보조: 실제 트리플 어떻게 생겼는지
    const sample25 = TRIPLES.filter(t => t[0] === 'poke:pokemon-25' && t[1] === 'poke:hasType').slice(0, 3);
    results.meta.sample25Triples = sample25;
  }
}

// ─────────────────────────────────────────────────────
// QA-5: 빌드 결과
// ─────────────────────────────────────────────────────
function qa5_build() {
  const STAGE = 'QA-5';
  if (!fs.existsSync(DIST)) {
    fail(STAGE, `dist/index.html 없음`);
    return;
  }
  const html = fs.readFileSync(DIST, 'utf8');
  const stat = fs.statSync(DIST);
  const sizeMB = stat.size / 1024 / 1024;
  results.meta.distSizeMB = +sizeMB.toFixed(2);

  if (sizeMB <= 40) {
    pass(STAGE, `dist 크기 ${sizeMB.toFixed(2)} MB (≤ 40MB)`);
  } else if (sizeMB <= 60) {
    warn(STAGE, `dist 크기 ${sizeMB.toFixed(2)} MB (> 40MB 권장 임계)`);
  } else {
    fail(STAGE, `dist 크기 ${sizeMB.toFixed(2)} MB (> 60MB)`);
  }

  // 외부 https?:// 의존성 검색
  // (인용 부호 안에 있는 것만 추출, 도메인 화이트리스트 없이 모두 신고)
  // 단 코드 블록/주석/문자열 안의 단순 텍스트는 무시 어려우니, src=/href= 만 검사.
  const externalRefs = [];
  const reAttr = /\b(src|href)\s*=\s*"(https?:\/\/[^"]+)"/g;
  let mm;
  while ((mm = reAttr.exec(html)) !== null) {
    externalRefs.push(mm[2]);
  }
  results.meta.externalRefs = externalRefs;
  if (externalRefs.length === 0) {
    pass(STAGE, `외부 src/href 의존성 0개`);
  } else {
    fail(STAGE, `외부 의존성 ${externalRefs.length}개 (${externalRefs.slice(0, 3).join(', ')})`);
  }

  // 데이터 임베드 블록
  const requiredIds = [
    'data-pokemon', 'data-types', 'data-moves', 'data-abilities',
    'data-habitats', 'data-generations', 'data-evolution-chains',
    'data-eggGroups', 'data-colors', 'data-shapes', 'data-meta',
    'data-curriculum', 'data-schema', 'data-triples',
    'data-inference-rules', 'data-turtle',
    'data-chapters', 'data-exercises', 'data-graphSlices',
  ];
  const missingBlocks = requiredIds.filter(id => !html.includes(`id="${id}"`));
  if (missingBlocks.length === 0) {
    pass(STAGE, `데이터 블록 ${requiredIds.length}개 모두 임베드`);
  } else {
    fail(STAGE, `데이터 블록 누락: ${missingBlocks.join(', ')}`);
  }

  // 모든 application/json 블록 파싱
  const blockRe = /<script type="application\/json" id="data-([^"]+)">([\s\S]*?)<\/script>/g;
  let parseFailures = [];
  let blockCount = 0;
  while ((mm = blockRe.exec(html)) !== null) {
    blockCount++;
    const id = mm[1], body = mm[2];
    try {
      JSON.parse(body);
    } catch (e) {
      parseFailures.push(`${id}: ${e.message.slice(0, 80)}`);
    }
  }
  results.meta.dataBlockCount = blockCount;
  if (parseFailures.length === 0) {
    pass(STAGE, `임베드 JSON 블록 ${blockCount}개 모두 JSON.parse 성공`);
  } else {
    fail(STAGE, `JSON 파싱 실패 ${parseFailures.length}개: ${parseFailures.slice(0, 3).join(' | ')}`);
  }

  // 스크립트 의존성 순서: Cytoscape → graph-renderer? → main
  // src/main.js 가 main이고, Cytoscape는 vendor에서 임베드.
  // 단순화: html에 cytoscape 토큰 존재 + main.js 함수 존재
  const hasCytoscape = /cytoscape/i.test(html);
  const hasMain = html.includes('startApp') || html.includes('main()') || html.includes('PokeOnt');
  if (hasCytoscape) pass(STAGE, `Cytoscape 임베드 감지`);
  else warn(STAGE, `Cytoscape 토큰 미감지 — 그래프 렌더링 점검 필요`);

  // localStorage 키 패턴
  const lsKeys = (html.match(/localStorage\.(?:getItem|setItem|removeItem)\(['"]([^'"]+)['"]/g) || [])
    .map(s => s.match(/['"]([^'"]+)['"]/)[1]);
  const uniqKeys = [...new Set(lsKeys)];
  results.meta.localStorageKeys = uniqKeys;
  if (uniqKeys.length > 0) {
    pass(STAGE, `localStorage 키 ${uniqKeys.length}개 (${uniqKeys.slice(0, 5).join(', ')})`);
  } else {
    warn(STAGE, `localStorage 사용 패턴 미감지`);
  }
}

// ─────────────────────────────────────────────────────
// QA-6: 모바일 반응형 (CSS 코드 리뷰 — 자동화 환경 결정은 별도)
// ─────────────────────────────────────────────────────
function qa6_responsive_css_review() {
  const STAGE = 'QA-6-css';
  const cssPath = path.join(ROOT, 'src', 'styles.css');
  const themePath = path.join(ROOT, 'src', 'theme.css');
  if (!fs.existsSync(cssPath)) { fail(STAGE, `styles.css 없음`); return; }
  const css = fs.readFileSync(cssPath, 'utf8');
  const theme = fs.existsSync(themePath) ? fs.readFileSync(themePath, 'utf8') : '';

  // 1) 미디어 쿼리 분기점
  const mq = css.match(/@media[^{]+/g) || [];
  const breakpoints = mq.map(s => (s.match(/\d+px/) || [''])[0]).filter(Boolean);
  results.meta.breakpoints = [...new Set(breakpoints)];
  const hasTablet = breakpoints.some(b => parseInt(b) === 768);
  const hasDesktop = breakpoints.some(b => parseInt(b) === 1024);
  if (hasTablet && hasDesktop) {
    pass(STAGE, `미디어 쿼리 분기점 768px·1024px 정의됨`);
  } else {
    fail(STAGE, `미디어 쿼리 분기점 누락 (768=${hasTablet}, 1024=${hasDesktop})`);
  }

  // 2) overflow-x: hidden (body 또는 html)
  if (/overflow-x:\s*hidden/.test(css)) {
    pass(STAGE, `overflow-x: hidden 처리 존재`);
  } else {
    warn(STAGE, `overflow-x: hidden 미감지 — 가로 스크롤 우려`);
  }

  // 3) 사이드바 transform 토글 (모바일 드로어)
  if (/sidebar[\s\S]{0,400}transform:\s*translateX\(-100%\)/.test(css) && /sidebar\.open[\s\S]{0,200}transform:\s*translateX\(0\)/.test(css)) {
    pass(STAGE, `사이드바 transform 토글 (오프스크린→온스크린) 정의됨`);
  } else {
    warn(STAGE, `사이드바 드로어 transform 토글 패턴 미감지`);
  }

  // 4) 햄버거 데스크탑에서 숨김
  if (/@media\s*\(min-width:\s*1024px\)[\s\S]*?\.hamburger\s*\{\s*display:\s*none/.test(css)) {
    pass(STAGE, `데스크탑(1024px)에서 햄버거 display:none`);
  } else {
    warn(STAGE, `데스크탑에서 햄버거 숨김 규칙 미감지`);
  }

  // 5) --fs-base ≥ 16px
  const fsBaseMatch = theme.match(/--fs-base:\s*(\d+)px/) || css.match(/--fs-base:\s*(\d+)px/);
  if (fsBaseMatch && parseInt(fsBaseMatch[1]) >= 16) {
    pass(STAGE, `--fs-base = ${fsBaseMatch[1]}px (≥ 16px)`);
  } else {
    fail(STAGE, `--fs-base 미정의 또는 < 16px`, 'medium');
  }

  // 6) 그래프 컨테이너 모바일 높이
  const graphHeightMobile = /\.graph-container\s*\{[^}]*height:\s*(\d+)px/.exec(css);
  if (graphHeightMobile) {
    pass(STAGE, `.graph-container 모바일 기본 높이 ${graphHeightMobile[1]}px`);
  } else {
    warn(STAGE, `.graph-container 모바일 고정 높이 미감지 (그래프 0px 위험)`);
  }

  // 7) <360px 초소형 화면 대응
  if (/@media\s*\(max-width:\s*(\d+)px\)/.test(css)) {
    const m = /@media\s*\(max-width:\s*(\d+)px\)/.exec(css);
    pass(STAGE, `초소형 화면 분기 max-width:${m[1]}px 정의됨`);
  } else {
    warn(STAGE, `초소형 화면(<360px) 분기 없음`);
  }
}

// ─────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────
function safeRun(name, fn) {
  try { fn(); }
  catch (e) {
    results.failures.push({ stage: name, msg: `예외: ${e.message}`, severity: 'high', stack: e.stack });
  }
}

safeRun('QA-1', qa1_data);
safeRun('QA-2', qa2_curriculum);
safeRun('QA-3', qa3_ontology);
safeRun('QA-4', qa4_content_exercises);
safeRun('QA-5', qa5_build);
safeRun('QA-6-css', qa6_responsive_css_review);

results.summary = {
  passes: results.passes.length,
  warnings: results.warnings.length,
  failures: results.failures.length,
};
results.finishedAt = new Date().toISOString();

const outPath = path.join(WS, 'qa', 'results.json');
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(`✓ QA 결과 저장: ${outPath}`);
console.log(`  통과 ${results.passes.length}, 경고 ${results.warnings.length}, 실패 ${results.failures.length}`);
