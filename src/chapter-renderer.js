/**
 * chapter-renderer.js
 *
 * 챕터 본문 마크다운 + 커스텀 태그 렌더링.
 *
 * window.ChapterRenderer = {
 *   render(chapterId, DATA, mountEl)
 * }
 */
(function (global) {
  'use strict';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function escapeAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }
  function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function findPokemon(DATA, id) {
    if (!DATA.pokemon || !DATA.pokemon.items) return null;
    return DATA.pokemon.items.find((p) => p.id === id || p.id === id.replace('pokemon:', 'pokemon:'));
  }

  function findType(DATA, id) {
    if (!DATA.types || !DATA.types.items) return null;
    return DATA.types.items.find((t) => t.id === id);
  }

  // ── 커스텀 태그 후처리 ────────────────────────────────
  // 임시 컨테이너 안에서 <concept>, <example>, <aha>, <callout>, <triple/>, <graph-ref/> 를 변환.
  function transformCustomTags(rootEl, DATA, ctx) {
    // 1) concept → span.concept-tag + tooltip
    rootEl.querySelectorAll('concept').forEach((node) => {
      const ko = node.getAttribute('ko') || node.textContent.trim();
      const en = node.getAttribute('en') || '';
      const tooltip = node.textContent.trim();
      const span = document.createElement('span');
      span.className = 'concept-tag';
      span.setAttribute('tabindex', '0');
      span.innerHTML = `${escapeHtml(ko)}${en ? `<span class="concept-en">${escapeHtml(en)}</span>` : ''}<span class="concept-tooltip">${escapeHtml(tooltip)}</span>`;
      node.replaceWith(span);
    });

    // 2) example → div.example-card  (속성 pokemon="pokemon:25")
    rootEl.querySelectorAll('example').forEach((node) => {
      const pokeId = node.getAttribute('pokemon') || '';
      const poke = pokeId ? findPokemon(DATA, pokeId) : null;
      const body = node.innerHTML;
      const div = document.createElement('div');
      div.className = 'example-card';
      const typesHtml = poke
        ? (poke.types || []).map((t) => {
            const tObj = findType(DATA, t);
            return tObj ? `<span style="opacity:.85">${escapeHtml(tObj.koName || tObj.enName)}</span>` : '';
          }).join(' · ')
        : '';
      const pokeBadge = poke
        ? `<span class="example-pokemon" title="${escapeAttr(poke.enName)}">▣ ${escapeHtml(poke.koName)}${typesHtml ? ' / ' + typesHtml : ''}</span>`
        : '';
      div.innerHTML = `
        <div class="example-header">예시${pokeBadge}</div>
        <div class="example-body">${body}</div>`;
      node.replaceWith(div);
    });

    // 3) aha → div.aha-block
    rootEl.querySelectorAll('aha').forEach((node) => {
      const div = document.createElement('div');
      div.className = 'aha-block';
      div.innerHTML = node.innerHTML;
      node.replaceWith(div);
    });

    // 4) callout → div.callout-block (type=tip|warn|info)
    rootEl.querySelectorAll('callout').forEach((node) => {
      const type = (node.getAttribute('type') || 'info').toLowerCase();
      const labelMap = { tip: '팁', warn: '주의', info: '메모' };
      const div = document.createElement('div');
      div.className = 'callout-block';
      div.setAttribute('data-type', type);
      div.setAttribute('data-type-label', labelMap[type] || type);
      div.innerHTML = node.innerHTML;
      node.replaceWith(div);
    });

    // 5) triple → 시각화
    rootEl.querySelectorAll('triple').forEach((node) => {
      const s = node.getAttribute('s') || '?';
      const p = node.getAttribute('p') || '?';
      const o = node.getAttribute('o') || '?';
      const span = document.createElement('span');
      span.className = 'triple-viz';
      span.innerHTML = `<span class="triple-s">${escapeHtml(s)}</span><span class="triple-arrow">—</span><span class="triple-p">${escapeHtml(p)}</span><span class="triple-arrow">→</span><span class="triple-o">${escapeHtml(o)}</span>`;
      node.replaceWith(span);
    });

    // 6) graph-ref → 점프 버튼
    rootEl.querySelectorAll('graph-ref').forEach((node) => {
      const slice = node.getAttribute('slice') || ctx.chapterId || '';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'graph-ref-btn';
      btn.textContent = '그래프 패널에서 보기';
      btn.setAttribute('data-slice', slice);
      btn.addEventListener('click', () => {
        // 모바일/태블릿: 그래프 패널로 스크롤. 데스크탑: sticky라서 이미 보임.
        const panel = document.getElementById('graph-panel');
        if (panel) {
          panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
          panel.classList.add('attention');
          setTimeout(() => panel.classList.remove('attention'), 1200);
        }
      });
      node.replaceWith(btn);
    });
  }

  /**
   * 챕터 본문을 렌더.
   * chapterId: 'ch01' 등
   * DATA: 전역 데이터
   * mountEl: 본문이 들어갈 article
   */
  function render(chapterId, DATA, mountEl) {
    if (!mountEl) mountEl = document.getElementById('chapter-content');
    if (!mountEl) return;

    const ch = (DATA.chapters || {})[chapterId];
    const meta = (DATA.curriculum && DATA.curriculum.chapters || []).find((c) => c.id === chapterId);

    if (!ch) {
      mountEl.innerHTML = `<div class="loading">챕터 ${escapeHtml(chapterId)} 데이터를 찾지 못했어요.</div>`;
      return;
    }

    const title = ch.title || (meta && meta.title) || chapterId;
    const subtitle = (meta && meta.subtitle) || '';
    const goalsHtml = (meta && meta.learningGoals && meta.learningGoals.length)
      ? `<div class="chapter-goals"><h4>학습 목표</h4><ul>${meta.learningGoals.map((g) => `<li>${escapeHtml(g)}</li>`).join('')}</ul></div>`
      : '';
    const order = meta ? meta.order : null;
    const mins = meta ? meta.estimatedMinutes : null;

    const metaPills = [];
    if (order) metaPills.push(`<span class="chapter-meta-pill">챕터 ${order}/14</span>`);
    if (mins) metaPills.push(`<span class="chapter-meta-pill">⏱ 약 ${mins}분</span>`);
    if (meta && meta.newConcepts && meta.newConcepts.length) {
      metaPills.push(`<span class="chapter-meta-pill">+ ${meta.newConcepts.length}개 새 개념</span>`);
    }

    // 본문 마크다운 → HTML
    const bodyHtml = global.MarkdownLite ? global.MarkdownLite.render(ch.body || '') : escapeHtml(ch.body || '');

    // 정리 카드: ch.summary 가 있으면 별도 박스. body 안에 "## 이 챕터에서 배운 것"이 있으면 그대로 두고
    // 추가로 summary 배열을 카드로 표시.
    const summaryHtml = (ch.summary && ch.summary.length)
      ? `<aside class="summary-card"><h2>요약</h2><ul>${ch.summary.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul></aside>`
      : '';

    mountEl.innerHTML = `
      <div class="chapter-title-block">
        <div class="chapter-meta">${metaPills.join('')}</div>
        <h1 class="chapter-title">${escapeHtml(title)}</h1>
        ${subtitle ? `<p class="chapter-subtitle">${escapeHtml(subtitle)}</p>` : ''}
        ${goalsHtml}
      </div>
      <div class="chapter-body" id="chapter-body"></div>
      ${summaryHtml}
      <section class="exercises-section" id="exercises-section">
        <h2>실습</h2>
        <div id="exercises-mount"></div>
      </section>
    `;

    const bodyEl = document.getElementById('chapter-body');
    bodyEl.innerHTML = bodyHtml;
    transformCustomTags(bodyEl, DATA, { chapterId });
  }

  global.ChapterRenderer = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
