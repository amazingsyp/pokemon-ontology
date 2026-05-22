/**
 * main.js
 *
 * 부트스트랩: 데이터 로드, 사이드바, 그래프, 챕터 라우팅.
 */
(function () {
  'use strict';

  function loadData(id) {
    const el = document.getElementById('data-' + id);
    if (!el) return null;
    try {
      return JSON.parse(el.textContent);
    } catch (e) {
      console.error('[loadData]', id, e);
      return null;
    }
  }

  function loadText(id) {
    const el = document.getElementById('data-' + id);
    return el ? el.textContent : '';
  }

  const DATA = {
    pokemon: loadData('pokemon'),
    types: loadData('types'),
    moves: loadData('moves'),
    abilities: loadData('abilities'),
    habitats: loadData('habitats'),
    generations: loadData('generations'),
    evolutionChains: loadData('evolution-chains'),
    eggGroups: loadData('eggGroups'),
    colors: loadData('colors'),
    shapes: loadData('shapes'),
    meta: loadData('meta'),
    curriculum: loadData('curriculum'),
    schema: loadData('schema'),
    triples: loadData('triples'),
    inferenceRules: loadData('inference-rules'),
    turtle: loadText('turtle'),
    chapters: loadData('chapters'),
    exercises: loadData('exercises'),
    graphSlices: loadData('graphSlices')
  };

  window.__DATA__ = DATA; // 디버깅 편의

  const state = {
    currentChapterId: null,
    cy: null,            // 메인 그래프 cytoscape 인스턴스
    cyMobileTeardown: null
  };

  function applyTheme(t) {
    document.body.setAttribute('data-theme', t);
    try { localStorage.setItem('po-theme', t); } catch (e) {}
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#0F172A' : '#FAFAF7');
  }

  function getChapterIds() {
    const list = (DATA.curriculum && DATA.curriculum.chapters) || [];
    return list.map((c) => c.id);
  }

  function totalChapters() {
    return getChapterIds().length || 14;
  }

  function updateProgress() {
    if (!window.ProgressStore) return;
    const p = window.ProgressStore.load();
    const visited = Object.keys(p.visited || {}).length;
    const total = totalChapters();
    const pct = Math.min(100, Math.round((visited / total) * 100));
    const fill = document.getElementById('progress-fill');
    const label = document.getElementById('progress-label');
    const bar = document.getElementById('progress-bar');
    if (fill) fill.style.width = pct + '%';
    if (label) label.textContent = `${visited} / ${total}`;
    if (bar) bar.setAttribute('aria-valuenow', String(visited));
  }

  function renderChapterList() {
    const nav = document.getElementById('chapter-nav');
    if (!nav) return;
    const chapters = (DATA.curriculum && DATA.curriculum.chapters) || [];
    const p = window.ProgressStore.load();
    nav.innerHTML = '';
    chapters.forEach((c) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chapter-item';
      btn.setAttribute('data-chapter-id', c.id);
      if (state.currentChapterId === c.id) btn.classList.add('active');
      if (p.visited && p.visited[c.id]) btn.classList.add('visited');
      if (p.completed && p.completed[c.id]) btn.classList.add('done');

      const status = document.createElement('span');
      status.className = 'ch-status';
      status.textContent = (p.completed && p.completed[c.id]) ? '✓' : '';

      const num = document.createElement('span');
      num.className = 'ch-number';
      num.textContent = String(c.order).padStart(2, '0');

      const title = document.createElement('span');
      title.className = 'ch-title';
      title.textContent = c.title;

      const mins = document.createElement('span');
      mins.className = 'ch-mins';
      mins.textContent = c.estimatedMinutes ? `${c.estimatedMinutes}분` : '';

      btn.appendChild(status);
      btn.appendChild(num);
      btn.appendChild(title);
      btn.appendChild(mins);
      btn.addEventListener('click', () => loadChapter(c.id));
      nav.appendChild(btn);
    });
  }

  function ensureGraphInstance() {
    const container = document.getElementById('graph-container');
    if (!container || !window.cytoscape || !window.GraphRenderer) return null;
    // QA·디버그 편의용 전역 참조 (학습용 프로그램이므로 노출 허용)
    if (state.cy) return state.cy;
    state.cy = window.GraphRenderer.create(container, { nodes: [], edges: [] });
    window.__cy = state.cy;
    if (window.GraphMobile) {
      state.cyMobileTeardown = window.GraphMobile.setup(state.cy, {});
    }
    return state.cy;
  }

  function loadGraphSlice(chapterId) {
    const cy = ensureGraphInstance();
    if (!cy) return;
    const slice = (DATA.graphSlices || {})[chapterId];
    if (!slice) return;
    // 그래프 패널 제목 업데이트
    const t = document.getElementById('graph-title');
    if (t) t.textContent = slice.title || `${chapterId} 그래프`;
    window.GraphRenderer.loadSlice(cy, slice);
    // 컨테이너가 hidden 상태에서 init된 경우 사이즈 보정
    setTimeout(() => { try { cy.resize(); cy.fit(null, 30); } catch (e) {} }, 50);
  }

  // 모바일(<1024px)에서는 모든 챕터에서 그래프 패널이 본문의 가장 위에 위치하도록
  // article의 first child로 이동시킨다. 챕터에 graph-ref가 있든 없든 동일 — 챕터
  // 진입 시 스크롤 0 지점에 그래프가 즉시 보인다.
  // 데스크탑(≥1024px)은 원래의 grid 3컬럼 sticky 위치를 유지.
  function positionGraphPanel() {
    const panel = document.getElementById('graph-panel');
    const article = document.getElementById('chapter-content');
    const layout = document.querySelector('.layout');
    if (!panel || !article || !layout) return;
    const isMobile = window.matchMedia('(max-width: 1023px)').matches;
    if (isMobile) {
      if (article.firstElementChild !== panel) {
        article.insertAdjacentElement('afterbegin', panel);
        if (state.cy) { try { state.cy.resize(); state.cy.fit(null, 30); } catch (e) {} }
      }
    } else {
      if (panel.parentElement !== layout) {
        layout.appendChild(panel);
        if (state.cy) { try { state.cy.resize(); state.cy.fit(null, 30); } catch (e) {} }
      }
    }
  }

  function loadChapter(id) {
    if (!id) return;
    state.currentChapterId = id;
    try { localStorage.setItem('po-last-chapter', id); } catch (e) {}
    // ChapterRenderer가 article.innerHTML을 통째로 교체하므로, 모바일에서 패널이
    // article 안에 있던 상태라면 미리 layout으로 옮겨 DOM에서 제거되지 않게 보존한다.
    const panelEl = document.getElementById('graph-panel');
    const layoutEl = document.querySelector('.layout');
    if (panelEl && layoutEl && panelEl.parentElement !== layoutEl) {
      layoutEl.appendChild(panelEl);
    }
    // 본문 렌더
    if (window.ChapterRenderer) window.ChapterRenderer.render(id, DATA);
    // 그래프
    loadGraphSlice(id);
    // 실습
    if (window.ExerciseRunner) window.ExerciseRunner.bindExercises(id, DATA);
    // 모바일 viewport이면 패널을 article 최상단으로 이동 (본문 렌더 후)
    positionGraphPanel();
    // 진도
    if (window.ProgressStore) window.ProgressStore.markVisited(id);
    updateProgress();
    renderChapterList();
    updateMobileNav();
    // 모바일에서 사이드바 자동 닫기
    document.getElementById('chapter-list').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');
    document.getElementById('hamburger-btn').setAttribute('aria-expanded', 'false');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateMobileNav() {
    const ids = getChapterIds();
    const idx = ids.indexOf(state.currentChapterId);
    const label = document.getElementById('current-chapter-label');
    if (label) {
      const meta = (DATA.curriculum && DATA.curriculum.chapters || []).find((c) => c.id === state.currentChapterId);
      label.textContent = meta ? `${String(meta.order).padStart(2, '0')}. ${meta.title}` : (state.currentChapterId || '');
    }
    const prev = document.getElementById('prev-chapter');
    const next = document.getElementById('next-chapter');
    if (prev) prev.disabled = idx <= 0;
    if (next) next.disabled = idx < 0 || idx >= ids.length - 1;
  }

  function setupHamburger() {
    const btn = document.getElementById('hamburger-btn');
    const side = document.getElementById('chapter-list');
    const overlay = document.getElementById('sidebar-overlay');
    if (!btn || !side) return;
    function toggle(force) {
      const willOpen = force != null ? force : !side.classList.contains('open');
      side.classList.toggle('open', willOpen);
      overlay.classList.toggle('open', willOpen);
      btn.setAttribute('aria-expanded', String(willOpen));
    }
    btn.addEventListener('click', () => toggle());
    overlay.addEventListener('click', () => toggle(false));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') toggle(false);
    });
  }

  function setupThemeToggle() {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const cur = document.body.getAttribute('data-theme') || 'light';
      applyTheme(cur === 'light' ? 'dark' : 'light');
      // Cytoscape는 CSS 변수를 직접 읽지 못하므로, 테마 토글 후
      // graph-styles를 다시 빌드하여 cy 스타일에 명시 색을 재주입한다.
      if (state.cy && window.GraphRenderer && window.GraphRenderer.refreshStyles) {
        window.GraphRenderer.refreshStyles(state.cy);
      }
    });
  }

  function setupMobileNav() {
    const ids = getChapterIds();
    const prev = document.getElementById('prev-chapter');
    const next = document.getElementById('next-chapter');
    if (prev) prev.addEventListener('click', () => {
      const i = ids.indexOf(state.currentChapterId);
      if (i > 0) loadChapter(ids[i - 1]);
    });
    if (next) next.addEventListener('click', () => {
      const i = ids.indexOf(state.currentChapterId);
      if (i >= 0 && i < ids.length - 1) {
        // 다음으로 가는 시점에 현재 챕터 완료로 마크
        if (window.ProgressStore) window.ProgressStore.markCompleted(state.currentChapterId);
        loadChapter(ids[i + 1]);
      }
    });
  }

  function setupGraphControls() {
    const panel = document.getElementById('graph-panel');
    if (!panel) return;
    panel.querySelectorAll('.graph-controls button').forEach((btn) => {
      const action = btn.getAttribute('data-action');
      btn.addEventListener('click', () => {
        const cy = state.cy;
        if (!cy) return;
        if (action === 'fit') cy.fit(null, 30);
        else if (action === 'reset') {
          const slice = (DATA.graphSlices || {})[state.currentChapterId];
          if (slice && window.GraphRenderer) window.GraphRenderer.loadSlice(cy, slice);
        } else if (action === 'fullscreen') {
          panel.classList.toggle('fullscreen');
          setTimeout(() => { try { cy.resize(); cy.fit(null, 30); } catch (e) {} }, 80);
        }
      });
    });
  }

  function setupResetProgress() {
    const btn = document.getElementById('reset-progress');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (!confirm('정말 진도를 초기화할까요? localStorage 진도 기록이 사라집니다.')) return;
      window.ProgressStore.reset();
      updateProgress();
      renderChapterList();
      // 강제로 ch01 로드
      loadChapter('ch01');
    });
  }

  function setupExerciseDoneListener() {
    window.addEventListener('exercise-done', (e) => {
      const ch = e.detail && e.detail.chapterId;
      if (!ch) return;
      // 챕터의 모든 실습이 완료되면 챕터 자체도 완료로
      const exData = (DATA.exercises || {})[ch];
      const total = exData && exData.exercises ? exData.exercises.length : 0;
      const p = window.ProgressStore.load();
      const done = (p.exercises && p.exercises[ch]) ? p.exercises[ch].length : 0;
      if (total > 0 && done >= total) {
        window.ProgressStore.markCompleted(ch);
        updateProgress();
        renderChapterList();
      }
    });
  }

  function init() {
    const savedTheme = (function () {
      try { return localStorage.getItem('po-theme'); } catch (e) { return null; }
    })() || 'light';
    applyTheme(savedTheme);

    setupHamburger();
    setupThemeToggle();
    setupMobileNav();
    setupGraphControls();
    setupResetProgress();
    setupExerciseDoneListener();
    // 창 크기·화면 회전 변화 시 그래프 패널 위치 재계산 (모바일↔데스크탑 전환)
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(positionGraphPanel, 150);
    });

    renderChapterList();
    updateProgress();

    // 초기 챕터
    let startId = null;
    try { startId = localStorage.getItem('po-last-chapter'); } catch (e) {}
    const ids = getChapterIds();
    if (!startId || !ids.includes(startId)) startId = ids[0] || 'ch01';
    loadChapter(startId);
  }

  // QA/디버그 편의용 — 외부에서 챕터 전환을 직접 호출할 수 있게 노출
  window.__loadChapter = loadChapter;
  window.__positionGraphPanel = positionGraphPanel;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
