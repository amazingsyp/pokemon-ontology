/**
 * exercise-runner.js
 *
 * 실습 컴포넌트 렌더 + 검증 + 힌트.
 *
 * 지원 type/validation:
 *   - quiz           / select-correct
 *   - drag-classify  / bucket-assignment
 *   - triple-build   / exact-match
 *   - query-build    / query-match
 *   - graph-build    / graph-isomorphism
 *   - matching       / matching-pairs
 *   - reasoning-sim  / select-correct
 *
 * window.ExerciseRunner = { bindExercises(chapterId, DATA) }
 */
(function (global) {
  'use strict';

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function el(tag, opts) {
    const e = document.createElement(tag);
    if (opts) {
      if (opts.className) e.className = opts.className;
      if (opts.text != null) e.textContent = opts.text;
      if (opts.html != null) e.innerHTML = opts.html;
      if (opts.attrs) Object.entries(opts.attrs).forEach(([k, v]) => e.setAttribute(k, v));
      if (opts.on) Object.entries(opts.on).forEach(([k, v]) => e.addEventListener(k, v));
    }
    return e;
  }

  function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // ── 검증 함수 ───────────────────────────────────────
  const Validators = {
    'select-correct': function (answer, expected) {
      // answer: 사용자가 고른 인덱스 배열, expected: 정답 인덱스 배열
      const a = (answer || []).slice().sort();
      const b = (expected || []).slice().sort();
      if (a.length !== b.length) return { ok: false, partial: 0 };
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return { ok: false, partial: 0 };
      return { ok: true, partial: 1 };
    },
    'exact-match': function (answer, expected) {
      // 두 배열의 순서·값 모두 동일해야
      if (!Array.isArray(answer) || !Array.isArray(expected)) return { ok: false, partial: 0 };
      if (answer.length !== expected.length) return { ok: false, partial: 0 };
      for (let i = 0; i < answer.length; i++) {
        if (String(answer[i]).trim() !== String(expected[i]).trim()) return { ok: false, partial: 0 };
      }
      return { ok: true, partial: 1 };
    },
    'bucket-assignment': function (answer, expected, partialCredit) {
      // answer/expected: {itemId: [bucketId,...]} — 단일 정답 가정 (1개)
      const ids = Object.keys(expected || {});
      let correct = 0;
      const itemResult = {};
      ids.forEach((id) => {
        const e = (expected[id] || [])[0];
        const a = (answer[id] || [])[0];
        const ok = a === e;
        itemResult[id] = ok;
        if (ok) correct++;
      });
      const partial = ids.length ? correct / ids.length : 0;
      return {
        ok: correct === ids.length,
        partial,
        detail: itemResult
      };
    },
    'matching-pairs': function (answer, expected) {
      // answer / expected: { left:right, ... } 매칭
      const keys = Object.keys(expected || {});
      let correct = 0;
      const detail = {};
      keys.forEach((k) => {
        const ok = answer[k] === expected[k];
        detail[k] = ok;
        if (ok) correct++;
      });
      return { ok: correct === keys.length, partial: keys.length ? correct / keys.length : 0, detail };
    },
    'graph-isomorphism': function (answer, expected) {
      // answer.edges: [{from, to, label}], expected.edges: [{from, to, label}]
      // 단순 다중집합 비교 (방향 고려)
      const ae = (answer && answer.edges) || [];
      const ee = (expected && expected.edges) || [];
      const norm = (e) => `${e.from}|${e.to}|${(e.label || '').trim()}`;
      const aSet = ae.map(norm).sort();
      const eSet = ee.map(norm).sort();
      // 부분 일치 점수
      let correct = 0;
      const eSetCopy = eSet.slice();
      aSet.forEach((s) => {
        const idx = eSetCopy.indexOf(s);
        if (idx >= 0) { correct++; eSetCopy.splice(idx, 1); }
      });
      return {
        ok: aSet.length === eSet.length && correct === eSet.length,
        partial: eSet.length ? correct / eSet.length : 0
      };
    },
    'query-match': function (answer, expected) {
      // answer: { triplePattern: [[s,p,o], ...], filters: [...]? } → 정규화 후 비교
      const normPattern = (arr) => (arr || []).map((tp) => tp.map((x) => String(x).trim()).join('|')).sort();
      const a = normPattern(answer.triplePattern || answer.patterns || []);
      const e = normPattern(expected.triplePattern || expected.patterns || []);
      if (a.length !== e.length) return { ok: false, partial: 0 };
      let correct = 0;
      for (let i = 0; i < a.length; i++) if (a[i] === e[i]) correct++;
      return { ok: correct === e.length, partial: e.length ? correct / e.length : 0 };
    }
  };

  // ── 렌더러 ─────────────────────────────────────────
  const Renderers = {};

  // Quiz / reasoning-sim (select-correct)
  Renderers.quiz = function (ex, ctx) {
    const wrap = el('div', { className: 'exercise-body' });
    const choices = (ex.init && ex.init.choices) || [];
    const multi = Array.isArray(ex.validation && ex.validation.expected) && ex.validation.expected.length > 1;

    const list = el('div', { className: 'choices' });
    const selected = new Set();

    choices.forEach((text, idx) => {
      const ch = el('label', { className: 'choice', attrs: { 'data-idx': String(idx) } });
      const input = el('input', { attrs: { type: multi ? 'checkbox' : 'radio', name: ex.id, value: String(idx) } });
      input.addEventListener('change', () => {
        if (multi) {
          if (input.checked) selected.add(idx); else selected.delete(idx);
        } else {
          selected.clear();
          selected.add(idx);
          [...list.querySelectorAll('.choice')].forEach((c) => c.classList.remove('selected'));
        }
        ch.classList.toggle('selected', input.checked);
      });
      const span = el('span', { text });
      ch.appendChild(input);
      ch.appendChild(span);
      list.appendChild(ch);
    });

    wrap.appendChild(list);
    ctx.getAnswer = () => Array.from(selected.values()).sort();
    ctx.afterCheck = (res) => {
      [...list.querySelectorAll('.choice')].forEach((c, idx) => {
        c.classList.remove('correct', 'wrong');
        if (!res.ok) return;
        const isExpected = (ex.validation.expected || []).includes(idx);
        if (isExpected) c.classList.add('correct');
      });
    };
    return wrap;
  };
  Renderers['reasoning-sim'] = Renderers.quiz;

  // Drag classify
  Renderers['drag-classify'] = function (ex, ctx) {
    const wrap = el('div', { className: 'exercise-body' });
    const items = (ex.init && ex.init.items) || [];
    const buckets = (ex.init && ex.init.buckets) || [];

    // 보관함 (드래그 출발점)
    const bin = el('div', { className: 'item-bin' });
    bin.appendChild(el('h5', { text: '카드' }));
    const binCards = el('div');
    bin.appendChild(binCards);

    const bucketArea = el('div', { className: 'bucket-area' });

    items.forEach((it) => {
      const card = el('div', {
        className: 'draggable-card',
        text: it.label,
        attrs: { draggable: 'true', 'data-item-id': it.id }
      });
      // HTML5 DnD
      card.addEventListener('dragstart', (e) => {
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', it.id);
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));

      // 터치 지원 (간단 시뮬레이션: 탭으로 다음 버킷 순환)
      card.addEventListener('click', () => {
        // 클릭 시 선택 상태로
        [...wrap.querySelectorAll('.draggable-card.selected-touch')].forEach((c) => c.classList.remove('selected-touch'));
        card.classList.add('selected-touch');
        showToast('박스를 탭해서 이동하세요');
      });

      binCards.appendChild(card);
    });

    buckets.forEach((b) => {
      const box = el('div', { className: 'bucket', attrs: { 'data-bucket-id': b.id } });
      box.appendChild(el('h5', { text: b.label }));
      const content = el('div');
      box.appendChild(content);

      box.addEventListener('dragover', (e) => { e.preventDefault(); box.classList.add('drag-over'); });
      box.addEventListener('dragleave', () => box.classList.remove('drag-over'));
      box.addEventListener('drop', (e) => {
        e.preventDefault();
        box.classList.remove('drag-over');
        const id = e.dataTransfer.getData('text/plain');
        const card = wrap.querySelector(`[data-item-id="${id}"]`);
        if (card) content.appendChild(card);
      });
      // 터치 모드: 박스를 탭하면 selected-touch 카드를 옮김
      box.addEventListener('click', (e) => {
        const sel = wrap.querySelector('.draggable-card.selected-touch');
        if (sel && !box.contains(sel) && e.target.tagName !== 'INPUT') {
          content.appendChild(sel);
          sel.classList.remove('selected-touch');
        }
      });
      bucketArea.appendChild(box);
    });

    wrap.appendChild(bin);
    wrap.appendChild(bucketArea);

    ctx.getAnswer = () => {
      const answer = {};
      items.forEach((it) => {
        const card = wrap.querySelector(`[data-item-id="${it.id}"]`);
        if (!card) return;
        const bucket = card.closest('.bucket');
        if (bucket) answer[it.id] = [bucket.getAttribute('data-bucket-id')];
      });
      return answer;
    };
    ctx.afterCheck = (res) => {
      const detail = res.detail || {};
      items.forEach((it) => {
        const card = wrap.querySelector(`[data-item-id="${it.id}"]`);
        if (!card) return;
        card.classList.remove('placed-correct', 'placed-wrong');
        if (detail[it.id] === true) card.classList.add('placed-correct');
        else if (detail[it.id] === false) card.classList.add('placed-wrong');
      });
    };
    return wrap;
  };

  // Triple build (3 selects 순서대로)
  Renderers['triple-build'] = function (ex, ctx) {
    const wrap = el('div', { className: 'exercise-body' });
    const init = ex.init || {};
    const subjects = init.subjects || [];
    const predicates = init.predicates || [];
    const objects = init.objects || [];

    const builder = el('div', { className: 'triple-builder' });

    function buildSlot(label, options, slotKey) {
      const slot = el('div', { className: 'triple-slot' });
      slot.appendChild(el('label', { text: label }));
      const sel = el('select', { attrs: { 'data-slot': slotKey } });
      sel.appendChild(el('option', { text: '선택…', attrs: { value: '' } }));
      options.forEach((o) => sel.appendChild(el('option', { text: o, attrs: { value: o } })));
      slot.appendChild(sel);
      return slot;
    }

    builder.appendChild(buildSlot('주어 (Subject)', subjects, 's'));
    builder.appendChild(buildSlot('술어 (Predicate)', predicates, 'p'));
    builder.appendChild(buildSlot('목적어 (Object)', objects, 'o'));
    wrap.appendChild(builder);

    ctx.getAnswer = () => {
      const s = builder.querySelector('[data-slot="s"]').value;
      const p = builder.querySelector('[data-slot="p"]').value;
      const o = builder.querySelector('[data-slot="o"]').value;
      return [s, p, o];
    };
    return wrap;
  };

  // Query build — triple pattern 1줄짜리 가정. expected.triplePattern: [[s,p,o]]
  Renderers['query-build'] = function (ex, ctx) {
    const wrap = el('div', { className: 'exercise-body' });
    const init = ex.init || {};
    const subjects = init.subjects || init.variables || [];
    const predicates = init.predicates || [];
    const objects = init.objects || init.classes || [];

    const builder = el('div', { className: 'query-builder' });

    function buildSlot(label, options, slotKey, placeholder) {
      const slot = el('div', { className: 'triple-slot' });
      slot.appendChild(el('label', { text: label }));
      if (options && options.length) {
        const sel = el('select', { attrs: { 'data-slot': slotKey } });
        sel.appendChild(el('option', { text: '선택…', attrs: { value: '' } }));
        options.forEach((o) => sel.appendChild(el('option', { text: o, attrs: { value: o } })));
        slot.appendChild(sel);
      } else {
        const input = el('input', { attrs: { 'data-slot': slotKey, type: 'text', placeholder: placeholder || '' } });
        slot.appendChild(input);
      }
      return slot;
    }
    builder.appendChild(buildSlot('?변수 / 주어', subjects, 's', '?x'));
    builder.appendChild(buildSlot('술어', predicates, 'p'));
    builder.appendChild(buildSlot('목적어', objects, 'o'));
    wrap.appendChild(builder);

    ctx.getAnswer = () => {
      const get = (k) => {
        const e = builder.querySelector(`[data-slot="${k}"]`);
        return e ? e.value : '';
      };
      return { triplePattern: [[get('s'), get('p'), get('o')]] };
    };
    return wrap;
  };

  // Matching: 왼쪽 카드 클릭 → 오른쪽 카드 클릭으로 연결
  Renderers.matching = function (ex, ctx) {
    const wrap = el('div', { className: 'exercise-body' });
    const init = ex.init || {};
    const left = init.left || init.terms || [];
    const right = init.right || init.definitions || [];

    const area = el('div', { className: 'matching-area' });
    const colL = el('div', { className: 'match-col' });
    colL.appendChild(el('h5', { text: '왼쪽' }));
    const colR = el('div', { className: 'match-col' });
    colR.appendChild(el('h5', { text: '오른쪽' }));

    const pairs = {};   // {leftId: rightId} — 같은 rightId가 여러 leftId에 매핑될 수 있음 (N:1)
    let selectedLeft = null;

    function getId(o, i, side) {
      if (typeof o === 'string') return `${side}-${i}`;
      return o.id || `${side}-${i}`;
    }
    function getLabel(o) { return typeof o === 'string' ? o : (o.label || o.text || JSON.stringify(o)); }

    // 매칭 상태 시각 갱신: 왼쪽엔 어떤 오른쪽과 짝지어졌는지, 오른쪽엔 몇 개와 짝지어졌는지.
    function refresh() {
      left.forEach((l, i) => {
        const id = getId(l, i, 'L');
        const card = colL.querySelector(`[data-id="${id}"]`);
        if (!card) return;
        const base = getLabel(l);
        const targetId = pairs[id];
        if (targetId) {
          const r = right.find((rr, j) => getId(rr, j, 'R') === targetId);
          card.textContent = `${base} → ${r ? getLabel(r) : targetId}`;
          card.classList.add('matched');
        } else {
          card.textContent = base;
          card.classList.remove('matched');
        }
        if (selectedLeft !== id) card.classList.remove('selected');
      });
      right.forEach((r, i) => {
        const id = getId(r, i, 'R');
        const card = colR.querySelector(`[data-id="${id}"]`);
        if (!card) return;
        const base = getLabel(r);
        const count = Object.values(pairs).filter((v) => v === id).length;
        card.textContent = count > 0 ? `${base} · ${count}개 매칭` : base;
        if (count > 0) card.classList.add('matched'); else card.classList.remove('matched');
      });
    }

    left.forEach((l, i) => {
      const id = getId(l, i, 'L');
      const card = el('div', { className: 'match-card', text: getLabel(l), attrs: { 'data-id': id } });
      card.addEventListener('click', () => {
        // 같은 카드를 다시 누르면 선택 해제
        if (selectedLeft === id) { selectedLeft = null; refresh(); return; }
        // 이미 매칭된 카드를 누르면 매칭 해제 후 재선택 모드로
        if (pairs[id]) delete pairs[id];
        selectedLeft = id;
        [...colL.querySelectorAll('.match-card')].forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
        refresh();
      });
      colL.appendChild(card);
    });
    right.forEach((r, i) => {
      const id = getId(r, i, 'R');
      const card = el('div', { className: 'match-card', text: getLabel(r), attrs: { 'data-id': id } });
      card.addEventListener('click', () => {
        // 오른쪽 카드는 항상 재사용 가능 (N:1 매칭 허용). 단, 먼저 왼쪽을 선택해야 함.
        if (!selectedLeft) { showToast('먼저 왼쪽 카드를 선택해 주세요.'); return; }
        pairs[selectedLeft] = id;
        selectedLeft = null;
        refresh();
      });
      colR.appendChild(card);
    });

    area.appendChild(colL);
    area.appendChild(colR);
    wrap.appendChild(area);

    ctx.getAnswer = () => ({ ...pairs });
    return wrap;
  };

  // Graph build (Cytoscape 미니 인스턴스 사용)
  Renderers['graph-build'] = function (ex, ctx) {
    const wrap = el('div', { className: 'exercise-body' });
    const init = ex.init || {};
    const givenNodes = init.givenNodes || [];
    const palette = (init.palette && init.palette.edges) || [];

    const toolbar = el('div', { className: 'graph-toolbar' });
    const edgeBtn = el('button', { className: 'btn', text: '엣지 그리기 모드', attrs: { type: 'button' } });
    const labelSel = el('select', { className: 'edge-label-select' });
    palette.forEach((p) => labelSel.appendChild(el('option', { text: p.label, attrs: { value: p.label, 'data-kind': p.kind || 'object' } })));
    const delBtn = el('button', { className: 'btn', text: '선택 삭제', attrs: { type: 'button' } });
    const resetBtn = el('button', { className: 'btn btn-ghost', text: '되돌리기', attrs: { type: 'button' } });
    toolbar.appendChild(edgeBtn);
    toolbar.appendChild(labelSel);
    toolbar.appendChild(delBtn);
    toolbar.appendChild(resetBtn);

    const graphDiv = el('div', { className: 'mini-graph' });
    wrap.appendChild(toolbar);
    wrap.appendChild(graphDiv);

    let cy = null;
    let disableDraw = null;

    function init_cy() {
      if (!global.cytoscape) return;
      cy = global.cytoscape({
        container: graphDiv,
        elements: givenNodes.map((n) => ({ group: 'nodes', data: { id: n.id, label: n.label, kind: n.type || 'instance' } })),
        style: global.GRAPH_STYLES || [],
        layout: { name: 'breadthfirst', directed: true, padding: 20, animate: false, fit: true, spacingFactor: 1.4 },
        minZoom: 0.4, maxZoom: 2, wheelSensitivity: 0.3
      });
    }
    // 컨테이너가 실제로 layout되어야 cytoscape가 정상 init됨 → rAF로 지연
    requestAnimationFrame(init_cy);

    edgeBtn.addEventListener('click', () => {
      if (!cy || !global.GraphInteractions) return;
      if (disableDraw) {
        disableDraw();
        disableDraw = null;
        edgeBtn.textContent = '엣지 그리기 모드';
        edgeBtn.classList.remove('btn-primary');
        return;
      }
      edgeBtn.textContent = '그리기 중… (출발 노드 → 도착 노드)';
      edgeBtn.classList.add('btn-primary');
      disableDraw = global.GraphInteractions.enableEdgeDrawing(cy, (src, tgt, edge) => {
        const sel = labelSel.options[labelSel.selectedIndex];
        const label = sel ? sel.value : '';
        const kind = sel ? (sel.getAttribute('data-kind') || 'object') : 'object';
        edge.data('label', label);
        edge.data('kind', kind);
      });
    });
    delBtn.addEventListener('click', () => {
      if (cy && global.GraphInteractions) global.GraphInteractions.deleteSelected(cy);
    });
    resetBtn.addEventListener('click', () => {
      if (!cy) return;
      cy.batch(() => {
        cy.edges().remove();
        // 사용자가 추가한 노드도 제거
        cy.nodes().filter((n) => !givenNodes.find((g) => g.id === n.id())).remove();
      });
      cy.layout({ name: 'breadthfirst', directed: true, padding: 20, animate: false, fit: true, spacingFactor: 1.4 }).run();
    });

    ctx.getAnswer = () => {
      if (!cy) return { edges: [] };
      const edges = cy.edges().map((e) => ({
        from: e.data('source'),
        to: e.data('target'),
        label: e.data('label') || ''
      }));
      return { edges };
    };
    return wrap;
  };

  // ── 메인: bindExercises ─────────────────────────────
  function renderExerciseCard(ex, chapterId, DATA) {
    const card = el('div', { className: 'exercise-card', attrs: { 'data-ex-id': ex.id } });
    const done = global.ProgressStore && global.ProgressStore.isExerciseDone(chapterId, ex.id);
    if (done) card.classList.add('done');

    const header = el('div', { className: 'exercise-header' });
    header.appendChild(el('span', { className: 'exercise-tag', text: typeLabel(ex.type) }));
    header.appendChild(el('h3', { className: 'exercise-title', text: ex.title || ex.id }));
    header.appendChild(el('span', { className: 'exercise-status', text: done ? '✓ 완료' : '' }));
    card.appendChild(header);

    if (ex.prompt) card.appendChild(el('p', { className: 'exercise-prompt', text: ex.prompt }));

    const ctx = {};
    const renderer = Renderers[ex.type] || Renderers.quiz;
    const body = renderer(ex, ctx);
    card.appendChild(body);

    // 힌트
    const hintList = el('div', { className: 'hint-list' });
    let hintsShown = 0;
    (ex.hints || []).forEach((h, i) => {
      const item = el('div', { className: 'hint-item hidden' });
      item.appendChild(el('span', { className: 'hint-num', text: `힌트 ${i + 1}` }));
      item.appendChild(el('span', { text: ' ' + h }));
      hintList.appendChild(item);
    });

    const feedback = el('div', { className: 'exercise-feedback' });

    const actions = el('div', { className: 'exercise-actions' });
    const checkBtn = el('button', { className: 'btn btn-primary', text: '정답 확인', attrs: { type: 'button' } });
    const hintBtn = el('button', { className: 'btn', text: `힌트 (${(ex.hints || []).length})`, attrs: { type: 'button' } });
    if (!(ex.hints || []).length) hintBtn.disabled = true;
    const resetBtn = el('button', { className: 'btn btn-ghost', text: '다시', attrs: { type: 'button' } });

    checkBtn.addEventListener('click', () => {
      const v = ex.validation || {};
      const validator = Validators[v.kind];
      if (!validator) {
        feedback.className = 'exercise-feedback fail show';
        feedback.textContent = '아직 채점이 준비되지 않은 유형이에요. (kind=' + (v.kind || '?') + ')';
        return;
      }
      const ans = ctx.getAnswer ? ctx.getAnswer() : null;
      const res = validator(ans, v.expected, v.partialCredit);
      if (typeof ctx.afterCheck === 'function') ctx.afterCheck(res);
      if (res.ok) {
        feedback.className = 'exercise-feedback ok show';
        feedback.innerHTML = `<strong>정답!</strong> ${escapeHtml(ex.successMessage || '잘 했어요.')}`;
        card.classList.add('done');
        header.querySelector('.exercise-status').textContent = '✓ 완료';
        if (global.ProgressStore) global.ProgressStore.markExerciseDone(chapterId, ex.id);
        // 챕터 완료 체크
        global.dispatchEvent(new CustomEvent('exercise-done', { detail: { chapterId, exerciseId: ex.id } }));
      } else if (res.partial > 0 && v.partialCredit) {
        feedback.className = 'exercise-feedback fail show';
        feedback.innerHTML = `<strong>부분 정답 (${Math.round(res.partial * 100)}%)</strong> · 다시 시도해 보세요.`;
      } else {
        feedback.className = 'exercise-feedback fail show';
        feedback.innerHTML = '<strong>아직이에요.</strong> 다시 시도하거나 힌트를 열어 보세요.';
      }
    });
    hintBtn.addEventListener('click', () => {
      const items = hintList.querySelectorAll('.hint-item');
      if (hintsShown >= items.length) return;
      items[hintsShown].classList.remove('hidden');
      hintsShown++;
      hintBtn.textContent = `힌트 (${items.length - hintsShown})`;
      if (hintsShown >= items.length) hintBtn.disabled = true;
    });
    resetBtn.addEventListener('click', () => {
      // 카드 전체를 새로 그려서 초기화
      const newCard = renderExerciseCard(ex, chapterId, DATA);
      card.replaceWith(newCard);
    });

    actions.appendChild(checkBtn);
    actions.appendChild(hintBtn);
    actions.appendChild(resetBtn);

    card.appendChild(actions);
    card.appendChild(feedback);
    card.appendChild(hintList);

    return card;
  }

  function typeLabel(t) {
    const map = {
      'quiz': '퀴즈',
      'drag-classify': '분류',
      'triple-build': '트리플',
      'query-build': '쿼리',
      'graph-build': '그래프',
      'matching': '매칭',
      'reasoning-sim': '추론'
    };
    return map[t] || t;
  }

  function bindExercises(chapterId, DATA) {
    const mount = document.getElementById('exercises-mount');
    if (!mount) return;
    const exData = (DATA.exercises || {})[chapterId];
    if (!exData || !exData.exercises || !exData.exercises.length) {
      mount.innerHTML = '<p style="color:var(--text-muted);font-size:14px;">이 챕터는 실습이 없습니다.</p>';
      return;
    }
    mount.innerHTML = '';
    exData.exercises.forEach((ex) => mount.appendChild(renderExerciseCard(ex, chapterId, DATA)));
  }

  global.ExerciseRunner = { bindExercises: bindExercises };
})(typeof window !== 'undefined' ? window : globalThis);
