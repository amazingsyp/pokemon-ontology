/**
 * inference-animator.js
 *
 * 추론 규칙 발화 시각화.
 *
 * 외부 API:
 *   - window.InferenceAnimator.animate(cy, rule, derivedTriples) → Promise<void>
 *
 * rule 형식 (참고: _workspace/ontology/inference-rules.json):
 *   {
 *     id, koLabel, if: [...], then: [...], koExplanation,
 *     matchedEdges?: [{id}, ...]   // 매칭된 기존 엣지(또는 노드) 식별자(옵션)
 *   }
 *
 * derivedTriples 형식:
 *   [{ s, p, o, sLabel?, oLabel?, kind? }, ...]
 *   - s/o: 노드 id (이미 그래프에 존재해야 함)
 *   - p: 술어 라벨 (엣지 label)
 *   - kind: 'object'|'is-a'|'data' (기본 'object')
 *
 * 시퀀스:
 *   1) rule.matchedEdges 강조 (.highlighted 추가)            ─ 800ms
 *   2) derivedTriples 각각을 .inferred .dashed 로 추가       ─ 400ms 간격
 *   3) 600ms 후 .dashed 제거, .solid 추가 (확정 표시)
 *   4) .highlighted 제거 (강조 해제)
 */
(function (global) {
  'use strict';

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  /**
   * matchedEdges 항목을 cy 컬렉션으로 정규화.
   * 항목은 {id} 또는 문자열 id, 또는 {source, target, label} 형태를 허용.
   */
  function resolveMatched(cy, matched) {
    if (!matched || !Array.isArray(matched)) return cy.collection();
    let col = cy.collection();
    matched.forEach((m) => {
      if (!m) return;
      if (typeof m === 'string') {
        const el = cy.getElementById(m);
        if (el && el.length) col = col.union(el);
        return;
      }
      if (m.id) {
        const el = cy.getElementById(m.id);
        if (el && el.length) col = col.union(el);
        return;
      }
      if (m.source && m.target) {
        const edges = cy.edges().filter((e) => {
          return e.data('source') === m.source &&
                 e.data('target') === m.target &&
                 (m.label == null || e.data('label') === m.label);
        });
        col = col.union(edges);
      }
    });
    return col;
  }

  /**
   * derivedTriples 의 트리플을 엣지로 추가. 이미 존재하면 skip하고 기존 것을 반환.
   */
  function addInferredEdge(cy, triple) {
    const kind = triple.kind || 'object';
    const id = triple.id || `inferred-${triple.s}--${triple.p}-->${triple.o}`;
    const existing = cy.getElementById(id);
    if (existing && existing.length) {
      existing.addClass('inferred dashed');
      return existing;
    }
    // s/o 노드가 존재하지 않으면 추가하지 못함
    const sNode = cy.getElementById(triple.s);
    const oNode = cy.getElementById(triple.o);
    if (!sNode.length || !oNode.length) {
      console.warn('[InferenceAnimator] s 또는 o 노드 없음. triple skip:', triple);
      return cy.collection();
    }
    const edge = cy.add({
      group: 'edges',
      data: {
        id,
        source: triple.s,
        target: triple.o,
        label: triple.p != null ? String(triple.p) : '',
        kind
      },
      classes: 'inferred dashed'
    });
    return edge;
  }

  async function animateInference(cy, rule, derivedTriples) {
    if (!cy) throw new Error('[animateInference] cy is required');
    const triples = Array.isArray(derivedTriples) ? derivedTriples : [];

    // 1) matched edges 강조
    const matched = resolveMatched(cy, rule && rule.matchedEdges);
    if (matched.length) {
      matched.addClass('highlighted');
    }
    await delay(800);

    // 2) derived triples를 차례대로 .inferred .dashed 로 추가
    const added = [];
    for (const t of triples) {
      const edge = addInferredEdge(cy, t);
      if (edge && edge.length) added.push(edge);
      await delay(400);
    }

    // 3) 600ms 후 dashed → solid (확정)
    await delay(600);
    added.forEach((edge) => {
      edge.removeClass('dashed').addClass('solid');
    });

    // 4) matched edge 강조 해제
    if (matched.length) {
      // 강조 잔향을 잠시 더 보여주고 해제
      await delay(300);
      matched.removeClass('highlighted');
    }

    return added;
  }

  /**
   * 추론 결과를 모두 일반 엣지로 정착시킴 (.inferred 클래스 제거).
   * 다음 단계로 진행할 때 호출.
   */
  function commit(cy) {
    if (!cy) return;
    cy.edges('.inferred').removeClass('inferred dashed solid');
  }

  /**
   * 마지막 애니메이션을 되돌림 (.inferred 엣지 모두 제거).
   */
  function reset(cy) {
    if (!cy) return;
    cy.edges('.inferred').remove();
    cy.elements('.highlighted').removeClass('highlighted');
  }

  global.InferenceAnimator = {
    animate: animateInference,
    commit,
    reset,
    _delay: delay
  };
})(typeof window !== 'undefined' ? window : globalThis);
