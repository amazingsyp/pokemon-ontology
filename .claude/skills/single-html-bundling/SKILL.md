---
name: single-html-bundling
description: 모든 JS·CSS·JSON 데이터·라이브러리를 단일 HTML 파일로 인라인하는 빌드 시스템과 모바일 우선 반응형 UI 구현 가이드. build.js Node.js 빌드 스크립트, JSON 데이터 임베드, Cytoscape 인라인, 미디어 쿼리, 햄버거 메뉴, 다크모드, localStorage 진도 저장 작업에 사용.
---

# 단일 HTML 빌드 + 모바일 반응형

오프라인 배포 가능한 단일 HTML 파일로 모든 자산을 패키징하고, 모바일·태블릿·PC에서 자연스러운 UX를 제공한다.

## 디렉토리 구조

```
프로젝트/
├── src/
│   ├── template.html       # 골격
│   ├── styles.css          # 메인 스타일
│   ├── theme.css           # 디자인 토큰
│   ├── main.js             # 부트스트랩
│   ├── chapter-renderer.js # 마크다운·커스텀 태그 렌더
│   ├── exercise-runner.js  # 실습 실행·검증
│   ├── progress-store.js   # localStorage 진도
│   ├── markdown-lite.js    # 가벼운 마크다운 파서 (인라인용)
│   └── vendor/
│       └── cytoscape.min.js
├── scripts/
│   └── build.js
├── _workspace/             # 데이터 산출물 (다른 에이전트가 생성)
└── dist/
    └── index.html          # 최종 산출물
```

## build.js 구조

```javascript
const fs = require('fs');
const path = require('path');

function read(p) { return fs.readFileSync(p, 'utf8'); }

const template = read('src/template.html');
const styles = [read('src/theme.css'), read('src/styles.css')].join('\n');
const scripts = [
  read('src/vendor/cytoscape.min.js'),
  read('src/markdown-lite.js'),
  read('_workspace/frontend/graph/graph-styles.js'),
  read('_workspace/frontend/graph/graph-renderer.js'),
  read('_workspace/frontend/graph/graph-interactions.js'),
  read('_workspace/frontend/graph/graph-mobile.js'),
  read('_workspace/frontend/graph/inference-animator.js'),
  read('src/progress-store.js'),
  read('src/chapter-renderer.js'),
  read('src/exercise-runner.js'),
  read('src/main.js')
].join('\n;\n');

// JSON 데이터 임베드
const dataBlobs = {
  pokemon: read('_workspace/data/pokemon.json'),
  types: read('_workspace/data/types.json'),
  moves: read('_workspace/data/moves.json'),
  curriculum: read('_workspace/curriculum/curriculum.json'),
  schema: read('_workspace/ontology/schema.json'),
  chapters: collectChapters(),    // 모든 ch{N}.json 본문 합치기
  exercises: collectExercises(),
  graphSlices: collectGraphSlices()
};

const dataScripts = Object.entries(dataBlobs)
  .map(([key, json]) => `<script type="application/json" id="data-${key}">${json}</script>`)
  .join('\n');

let html = template
  .replace('<!-- INLINE_STYLES -->', `<style>${styles}</style>`)
  .replace('<!-- INLINE_DATA -->', dataScripts)
  .replace('<!-- INLINE_SCRIPTS -->', `<script>${scripts}</script>`);

fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/index.html', html);

const size = fs.statSync('dist/index.html').size;
console.log(`✓ dist/index.html 생성 (${(size / 1024 / 1024).toFixed(1)} MB)`);
```

## template.html 골격

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>포켓몬으로 배우는 온톨로지</title>
  <meta name="description" content="포켓몬 1000여 마리를 직접 만지며 온톨로지를 처음부터 배우는 인터랙티브 학습 프로그램">
  <!-- INLINE_STYLES -->
</head>
<body data-theme="light">
  <header class="topbar">
    <button class="hamburger" aria-label="챕터 목록 열기">≡</button>
    <h1 class="brand">포켓몬 × 온톨로지</h1>
    <div class="topbar-actions">
      <progress class="progress-bar" value="0" max="15" aria-label="전체 진도"></progress>
      <button class="theme-toggle" aria-label="다크모드 전환">🌙</button>
    </div>
  </header>

  <main class="layout">
    <aside class="sidebar" id="chapter-list" aria-label="챕터 목록">
      <!-- 챕터 목록 (main.js가 채움) -->
    </aside>

    <article class="content" id="chapter-content">
      <!-- 챕터 본문 (chapter-renderer.js가 채움) -->
    </article>

    <aside class="graph-panel" id="graph-panel" aria-label="그래프 시각화">
      <div class="graph-container" id="graph-container"></div>
      <div class="graph-controls">
        <button data-action="fit">화면 맞춤</button>
        <button data-action="reset">초기화</button>
        <button data-action="fullscreen">전체화면</button>
      </div>
    </aside>
  </main>

  <!-- 모바일 하단 네비 -->
  <nav class="mobile-nav">
    <button class="prev-chapter" aria-label="이전 챕터">◀</button>
    <span class="current-chapter-label">챕터 1</span>
    <button class="next-chapter" aria-label="다음 챕터">▶</button>
  </nav>

  <!-- INLINE_DATA -->
  <!-- INLINE_SCRIPTS -->
</body>
</html>
```

## CSS 토큰 (theme.css)

```css
:root {
  /* 라이트 모드 */
  --bg: #FAFAF7;
  --bg-soft: #F3F3EE;
  --text: #1F2937;
  --text-muted: #6B7280;
  --accent: #14B8A6;
  --accent-strong: #0F766E;
  --border: #E5E7EB;
  --card: #FFFFFF;
  --code-bg: #F3F4F6;

  /* 그래프 노드 색 */
  --node-class-bg: #3B82F6;
  --node-instance-bg: #F59E0B;
  --node-literal-bg: #9CA3AF;

  /* 타이포 */
  --font-sans: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'D2Coding', monospace;
  --fs-base: 16px;
  --line-height: 1.65;

  /* 간격 */
  --space-1: 4px; --space-2: 8px; --space-3: 12px;
  --space-4: 16px; --space-6: 24px; --space-8: 32px;

  /* 둥근 모서리 */
  --radius-sm: 6px; --radius-md: 10px; --radius-lg: 16px;

  /* 그림자 */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.08);
}

[data-theme="dark"] {
  --bg: #0F172A;
  --bg-soft: #1E293B;
  --text: #F1F5F9;
  --text-muted: #94A3B8;
  --accent: #2DD4BF;
  --accent-strong: #5EEAD4;
  --border: #334155;
  --card: #1E293B;
  --code-bg: #0F172A;
  --node-class-bg: #60A5FA;
  --node-instance-bg: #FBBF24;
  --node-literal-bg: #94A3B8;
}
```

## 모바일 우선 styles.css (핵심)

```css
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: var(--fs-base);
  line-height: var(--line-height);
  -webkit-text-size-adjust: 100%;
}

/* 상단바 - 모바일 기본 */
.topbar {
  position: sticky; top: 0; z-index: 50;
  display: flex; align-items: center; gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--card);
  border-bottom: 1px solid var(--border);
}
.brand { font-size: 16px; margin: 0; flex: 1; }
.hamburger { font-size: 24px; background: none; border: none; cursor: pointer; }

/* 레이아웃 - 모바일 (세로 스택) */
.layout {
  display: flex; flex-direction: column;
  min-height: calc(100vh - 56px - 56px); /* topbar - mobile-nav */
}

/* 사이드바 - 모바일: 슬라이드 인 오버레이 */
.sidebar {
  position: fixed; top: 56px; left: 0;
  width: 280px; height: calc(100vh - 56px);
  background: var(--card); border-right: 1px solid var(--border);
  transform: translateX(-100%);
  transition: transform 0.25s ease;
  z-index: 40; overflow-y: auto;
  padding: var(--space-4);
}
.sidebar.open { transform: translateX(0); }

/* 본문 */
.content {
  padding: var(--space-4);
  max-width: 100%;
  overflow-x: hidden;
}
.content h2 { font-size: 22px; margin-top: var(--space-6); }
.content p { font-size: 16px; }
.content pre {
  background: var(--code-bg);
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  overflow-x: auto;
  font-size: 13px;
}

/* 그래프 패널 - 모바일: 본문 사이에 인라인 */
.graph-panel {
  margin: var(--space-4) 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--card);
}
.graph-container {
  width: 100%;
  height: 320px;
}
.graph-controls {
  display: flex; gap: var(--space-2);
  padding: var(--space-2);
  border-top: 1px solid var(--border);
}

/* 모바일 하단 네비 */
.mobile-nav {
  position: fixed; bottom: 0; left: 0; right: 0;
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  background: var(--card); border-top: 1px solid var(--border);
  z-index: 30;
}

/* 커스텀 태그 스타일 */
concept {
  display: inline-block; padding: 2px 8px;
  background: var(--accent); color: white;
  border-radius: var(--radius-sm); font-weight: 600;
}
aha {
  display: block; padding: var(--space-3) var(--space-4);
  background: linear-gradient(90deg, #FEF3C7, #FDE68A);
  border-left: 4px solid #F59E0B;
  border-radius: var(--radius-sm);
  margin: var(--space-4) 0;
}
callout {
  display: block; padding: var(--space-3);
  background: var(--bg-soft);
  border-left: 3px solid var(--accent);
  border-radius: var(--radius-sm);
  margin: var(--space-3) 0;
}

/* 태블릿 */
@media (min-width: 768px) {
  .content { padding: var(--space-6); max-width: 720px; margin: 0 auto; }
  .graph-container { height: 400px; }
}

/* 데스크탑 */
@media (min-width: 1024px) {
  .layout {
    display: grid;
    grid-template-columns: 260px minmax(0, 1fr) 420px;
    gap: var(--space-4);
    padding: var(--space-4);
    align-items: start;
  }
  .sidebar {
    position: sticky; top: 72px;
    transform: none;
    height: calc(100vh - 88px);
    border-right: none;
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
  }
  .hamburger { display: none; }
  .content { padding: var(--space-6); max-width: none; margin: 0; }
  .graph-panel {
    position: sticky; top: 72px;
    margin: 0;
    height: calc(100vh - 88px);
    display: flex; flex-direction: column;
  }
  .graph-container { flex: 1; height: auto; }
  .mobile-nav { display: none; }
}

/* 큰 데스크탑 */
@media (min-width: 1440px) {
  .layout { grid-template-columns: 300px minmax(0, 800px) 480px; max-width: 1600px; margin: 0 auto; }
}
```

## main.js 부트스트랩

```javascript
function loadData(id) {
  const el = document.getElementById(`data-${id}`);
  return JSON.parse(el.textContent);
}

const DATA = {
  pokemon: loadData('pokemon'),
  types: loadData('types'),
  curriculum: loadData('curriculum'),
  schema: loadData('schema'),
  chapters: loadData('chapters'),
  exercises: loadData('exercises'),
  graphSlices: loadData('graphSlices')
};

const state = {
  currentChapterId: null,
  progress: ProgressStore.load(),
  theme: localStorage.getItem('theme') || 'light'
};

function init() {
  applyTheme(state.theme);
  renderChapterList(DATA.curriculum.chapters);
  setupHamburger();
  setupThemeToggle();
  setupMobileNav();

  // 초기 챕터 로드 (마지막 본 챕터 or ch01)
  const start = state.progress.lastChapter || 'ch01';
  loadChapter(start);
}

function loadChapter(id) {
  state.currentChapterId = id;
  ChapterRenderer.render(id, DATA);
  GraphRenderer.loadSlice(DATA.graphSlices[id]);
  ExerciseRunner.bindExercises(id);
  state.progress.lastChapter = id;
  ProgressStore.save(state.progress);
  // 모바일에서 사이드바 자동 닫기
  document.getElementById('chapter-list').classList.remove('open');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.addEventListener('DOMContentLoaded', init);
```

## progress-store.js (localStorage)

```javascript
const KEY = 'pokemon-ontology-progress-v1';

const ProgressStore = {
  load() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '{}');
    } catch { return {}; }
  },
  save(progress) {
    localStorage.setItem(KEY, JSON.stringify(progress));
  },
  markExerciseDone(chapterId, exerciseId) {
    const p = this.load();
    p.exercises ??= {};
    p.exercises[chapterId] ??= [];
    if (!p.exercises[chapterId].includes(exerciseId)) {
      p.exercises[chapterId].push(exerciseId);
    }
    this.save(p);
  },
  reset() {
    localStorage.removeItem(KEY);
  }
};
```

## 단일 HTML 크기 관리

전 세대 1000+ 포켓몬을 다 임베드하면 HTML이 20~40MB까지 갈 수 있다.

**최적화 전략:**
1. JSON은 `JSON.stringify(data)` (들여쓰기 없이) — 빌드 시 자동
2. 학습에 안 쓰는 필드 제외 (스프라이트 URL, 게임 인덱스 등)
3. `moves[]` 같은 큰 배열은 ID만, 본문은 lookup
4. 빌드 결과 크기를 보고서에 출력 (`build.js` 마지막에 stat)
5. 30MB 초과 시 경고

## 검증 (build.js 끝에서)

```javascript
const html = fs.readFileSync('dist/index.html', 'utf8');
// 외부 의존성 검사
const externalRefs = html.match(/(src|href)="https?:\/\/[^"]+"/g);
if (externalRefs?.length) {
  console.warn('⚠ 외부 참조 발견:', externalRefs);
}
// 필수 데이터 임베드 확인
['data-pokemon', 'data-curriculum', 'data-chapters'].forEach(id => {
  if (!html.includes(`id="${id}"`)) console.error(`✗ ${id} 누락`);
});
```
