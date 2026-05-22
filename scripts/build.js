/**
 * scripts/build.js
 *
 * src/ + _workspace/ → docs/index.html 단일 HTML 빌드.
 *
 * - 외부 의존성 0
 * - 데이터는 JSON.stringify (들여쓰기 없이) 로 임베드
 * - 모든 JS/CSS/JSON 인라인
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const WS = path.join(ROOT, '_workspace');
const DIST = path.join(ROOT, 'docs');

function read(p) { return fs.readFileSync(p, 'utf8'); }
function readIfExists(p) { return fs.existsSync(p) ? read(p) : null; }

function minifyJson(text) {
  return JSON.stringify(JSON.parse(text));
}

// 데이터 임베드 시 </script> 가 우연히 끼는 것을 막기 위해 분리.
function safeForScript(s) {
  return String(s).replace(/<\/script/gi, '<\\/script');
}

function embedJson(id, raw) {
  // raw가 JSON 문자열이면 minify해서 임베드. 파싱 실패 시 그대로.
  let body;
  try { body = JSON.stringify(JSON.parse(raw)); }
  catch (e) { body = raw; }
  return `<script type="application/json" id="data-${id}">${safeForScript(body)}</script>`;
}

function embedText(id, raw) {
  // 텍스트(예: turtle)를 JSON-encoded 문자열로 임베드 (loadText는 textContent 직접 사용)
  // → 그냥 텍스트 그대로 두면 HTML 파싱 영향이 있을 수 있으므로 application/json 으로 문자열로 감쌈.
  const body = JSON.stringify(String(raw));
  return `<script type="application/json" id="data-${id}">${safeForScript(body)}</script>`;
}

function collectChapters() {
  const dir = path.join(WS, 'content', 'chapters');
  const out = {};
  fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().forEach((f) => {
    const id = path.basename(f, '.json');
    out[id] = JSON.parse(read(path.join(dir, f)));
  });
  return JSON.stringify(out);
}
function collectExercises() {
  const dir = path.join(WS, 'content', 'exercises');
  const out = {};
  fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().forEach((f) => {
    const id = path.basename(f, '.json');
    out[id] = JSON.parse(read(path.join(dir, f)));
  });
  return JSON.stringify(out);
}
function collectGraphSlices() {
  const dir = path.join(WS, 'ontology', 'graph-slices');
  const out = {};
  fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().forEach((f) => {
    const id = path.basename(f, '.json');
    out[id] = JSON.parse(read(path.join(dir, f)));
  });
  return JSON.stringify(out);
}

function main() {
  console.log('▶ build start');

  // ── 1. template + 스타일 ─────────────────────────────────
  const template = read(path.join(SRC, 'template.html'));
  const styles = [
    read(path.join(SRC, 'theme.css')),
    read(path.join(SRC, 'styles.css'))
  ].join('\n\n');

  // ── 2. 스크립트 (의존성 순서) ────────────────────────────
  const scripts = [
    '/* === cytoscape.min.js === */',
    read(path.join(SRC, 'vendor', 'cytoscape.min.js')),
    '/* === graph-styles.js === */',
    read(path.join(WS, 'frontend', 'graph', 'graph-styles.js')),
    '/* === graph-renderer.js === */',
    read(path.join(WS, 'frontend', 'graph', 'graph-renderer.js')),
    '/* === graph-interactions.js === */',
    read(path.join(WS, 'frontend', 'graph', 'graph-interactions.js')),
    '/* === graph-mobile.js === */',
    read(path.join(WS, 'frontend', 'graph', 'graph-mobile.js')),
    '/* === inference-animator.js === */',
    read(path.join(WS, 'frontend', 'graph', 'inference-animator.js')),
    '/* === markdown-lite.js === */',
    read(path.join(SRC, 'markdown-lite.js')),
    '/* === progress-store.js === */',
    read(path.join(SRC, 'progress-store.js')),
    '/* === chapter-renderer.js === */',
    read(path.join(SRC, 'chapter-renderer.js')),
    '/* === exercise-runner.js === */',
    read(path.join(SRC, 'exercise-runner.js')),
    '/* === main.js === */',
    read(path.join(SRC, 'main.js'))
  ].join('\n;\n');

  // ── 3. 데이터 임베드 ───────────────────────────────────
  const dataParts = [
    embedJson('pokemon',          read(path.join(WS, 'data', 'pokemon.json'))),
    embedJson('types',            read(path.join(WS, 'data', 'types.json'))),
    embedJson('moves',            read(path.join(WS, 'data', 'moves.json'))),
    embedJson('abilities',        read(path.join(WS, 'data', 'abilities.json'))),
    embedJson('habitats',         read(path.join(WS, 'data', 'habitats.json'))),
    embedJson('generations',      read(path.join(WS, 'data', 'generations.json'))),
    embedJson('evolution-chains', read(path.join(WS, 'data', 'evolution-chains.json'))),
    embedJson('eggGroups',        read(path.join(WS, 'data', 'eggGroups.json'))),
    embedJson('colors',           read(path.join(WS, 'data', 'colors.json'))),
    embedJson('shapes',           read(path.join(WS, 'data', 'shapes.json'))),
    embedJson('meta',             read(path.join(WS, 'data', 'meta.json'))),
    embedJson('curriculum',       read(path.join(WS, 'curriculum', 'curriculum.json'))),
    embedJson('schema',           read(path.join(WS, 'ontology', 'schema.json'))),
    embedJson('triples',          read(path.join(WS, 'ontology', 'triples.json'))),
    embedJson('inference-rules',  read(path.join(WS, 'ontology', 'inference-rules.json'))),
    embedText('turtle',           read(path.join(WS, 'ontology', 'turtle.ttl'))),
    `<script type="application/json" id="data-chapters">${safeForScript(collectChapters())}</script>`,
    `<script type="application/json" id="data-exercises">${safeForScript(collectExercises())}</script>`,
    `<script type="application/json" id="data-graphSlices">${safeForScript(collectGraphSlices())}</script>`
  ];
  const dataScripts = dataParts.join('\n');

  // ── 4. 조립 ─────────────────────────────────────────────
  // 함수형 replacement 사용 — 문자열 replacement는 $', $&, $1 등을 특수 치환
  // 토큰으로 해석하여 cytoscape의 정규식 리터럴 같은 인라인 코드를 손상시킨다.
  const styleBlock  = `<style>${styles}</style>`;
  const scriptBlock = `<script>${safeForScript(scripts)}</script>`;
  let html = template
    .replace('<!-- INLINE_STYLES -->', () => styleBlock)
    .replace('<!-- INLINE_DATA -->',   () => dataScripts)
    .replace('<!-- INLINE_SCRIPTS -->', () => scriptBlock);

  // ── 5. 출력 ────────────────────────────────────────────
  if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });
  const outPath = path.join(DIST, 'index.html');
  fs.writeFileSync(outPath, html);

  const size = fs.statSync(outPath).size;
  const sizeMb = (size / 1024 / 1024).toFixed(2);
  console.log(`✓ docs/index.html 생성 (${sizeMb} MB, ${size.toLocaleString()} bytes)`);

  // ── 6. 자체 검증 ───────────────────────────────────────
  const verify = (function () {
    const errors = [];
    const warnings = [];
    const html = fs.readFileSync(outPath, 'utf8');

    // 외부 의존성 (src/href에 http(s):// 인 것)
    const externalRefs = html.match(/(?:src|href)\s*=\s*"https?:\/\/[^"]+"/g) || [];
    // <link rel="icon" href="data:,"> 같은 data: URL은 제외
    if (externalRefs.length) {
      errors.push('외부 참조 ' + externalRefs.length + '개: ' + externalRefs.slice(0, 3).join(', '));
    }

    // 필수 데이터 블록
    const required = [
      'data-pokemon', 'data-types', 'data-moves', 'data-abilities',
      'data-habitats', 'data-generations', 'data-evolution-chains',
      'data-eggGroups', 'data-colors', 'data-shapes', 'data-meta',
      'data-curriculum', 'data-schema', 'data-triples',
      'data-inference-rules', 'data-turtle',
      'data-chapters', 'data-exercises', 'data-graphSlices'
    ];
    required.forEach((id) => {
      if (!html.includes(`id="${id}"`)) errors.push(`데이터 블록 누락: ${id}`);
    });

    // JSON 파싱 시뮬레이션 (모든 application/json 블록)
    const re = /<script type="application\/json" id="data-([^"]+)">([\s\S]*?)<\/script>/g;
    let m;
    let okCount = 0;
    while ((m = re.exec(html)) !== null) {
      try {
        JSON.parse(m[2].replace(/<\\\/script/gi, '</script'));
        okCount++;
      } catch (e) {
        errors.push(`JSON.parse 실패: data-${m[1]} (${e.message.slice(0, 60)})`);
      }
    }

    // 미디어 쿼리 분기점 확인
    const breakpoints = [768, 1024, 1440];
    breakpoints.forEach((bp) => {
      if (!html.includes(`min-width: ${bp}px`) && !html.includes(`min-width:${bp}px`)) {
        warnings.push(`media query min-width: ${bp}px 미발견`);
      }
    });

    // theme dark 토큰 존재
    if (!html.includes('[data-theme="dark"]')) warnings.push('다크모드 토큰 누락');

    // 크기 경고
    if (size > 40 * 1024 * 1024) warnings.push(`크기 초과: ${sizeMb} MB > 40MB`);
    else if (size > 30 * 1024 * 1024) warnings.push(`크기 주의: ${sizeMb} MB > 30MB`);

    return { errors, warnings, jsonBlocksOk: okCount };
  })();

  // 다크모드 셀렉터 사용 횟수
  const darkUsages = (html.match(/\[data-theme="dark"\]/g) || []).length;
  const mediaQueries = (html.match(/@media\s*\([^)]+\)/g) || []);
  const bps = mediaQueries
    .map((q) => {
      const m = q.match(/(min|max)-width:\s*(\d+)px/);
      return m ? `${m[1]}=${m[2]}` : q;
    });

  console.log('');
  console.log('── 검증 ────────────────────────────────────────────');
  console.log(`외부 참조:        ${verify.errors.filter((e) => e.startsWith('외부')).length === 0 ? '0개 (OK)' : '있음'}`);
  console.log(`JSON 블록 OK:     ${verify.jsonBlocksOk}개`);
  console.log(`다크모드 셀렉터:  ${darkUsages}회`);
  console.log(`미디어 쿼리:      ${mediaQueries.length}개 (${[...new Set(bps)].join(', ')})`);
  if (verify.warnings.length) {
    console.log('');
    verify.warnings.forEach((w) => console.warn(`⚠ ${w}`));
  }
  if (verify.errors.length) {
    console.log('');
    verify.errors.forEach((e) => console.error(`✗ ${e}`));
    process.exit(1);
  }
  console.log('');
  console.log('✓ 모든 검증 통과');
}

main();
