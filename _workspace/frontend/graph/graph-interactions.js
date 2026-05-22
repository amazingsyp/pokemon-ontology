/**
 * graph-interactions.js
 *
 * 학습자가 직접 그래프를 만들고/수정할 수 있게 하는 API.
 * graph-build, reasoning-sim 실습에서 사용된다.
 *
 * 외부 API (window.GraphInteractions):
 *   - addNode(cy, label, kind)              → 새 노드 id 반환
 *   - enableEdgeDrawing(cy, onComplete)     → 두 노드 클릭 모드 활성화. disable 함수 반환
 *   - deleteSelected(cy)                    → :selected 요소 제거
 *   - getCurrentEdges(cy)                   → [{source, target, label, kind}] (label 기준)
 *   - getCurrentNodes(cy)                   → [{id, label, kind}]
 *   - clearGraph(cy)                        → 모든 요소 제거
 *   - highlightNodes(cy, ids)               → 해당 노드에 .highlighted
 *   - clearHighlight(cy)                    → 모든 .highlighted/.faded 제거
 *
 * cytoscape-edgehandles 플러그인 없이 자체 구현: 노드 클릭 → 다른 노드 클릭.
 */
(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // 1. 노드 추가
  // ─────────────────────────────────────────────────────────────
  let _nodeCounter = 0;

  function addNode(cy, label, kind, position) {
    if (!cy) throw new Error('[addNode] cy is required');
    _nodeCounter += 1;
    const id = `user-${Date.now().toString(36)}-${_nodeCounter}`;
    const data = {
      id,
      label: label != null ? String(label) : `노드 ${_nodeCounter}`,
      kind: kind || 'instance'
    };

    const def = { group: 'nodes', data };
    if (position && typeof position.x === 'number' && typeof position.y === 'number') {
      def.position = position;
    } else {
      // 현재 viewport 중심 근처에 약간의 랜덤 오프셋
      const extent = cy.extent();
      const cx = (extent.x1 + extent.x2) / 2;
      const cy_ = (extent.y1 + extent.y2) / 2;
      def.position = {
        x: cx + (Math.random() - 0.5) * 60,
        y: cy_ + (Math.random() - 0.5) * 60
      };
    }

    cy.add(def);
    return id;
  }

  // ─────────────────────────────────────────────────────────────
  // 2. 엣지 그리기 (자체 구현)
  //    노드 클릭 → 다른 노드 클릭 → onComplete(sourceId, targetId, edge)
  // ─────────────────────────────────────────────────────────────
  let _edgeCounter = 0;

  function enableEdgeDrawing(cy, onComplete) {
    if (!cy) throw new Error('[enableEdgeDrawing] cy is required');

    let sourceNode = null;

    const onTapNode = (evt) => {
      const node = evt.target;
      if (!sourceNode) {
        // 1단계: 출발 노드 선택
        sourceNode = node;
        node.addClass('edge-source');
        return;
      }
      // 2단계: 도착 노드 선택
      if (node.id() === sourceNode.id()) {
        // 같은 노드 다시 탭 → 취소
        sourceNode.removeClass('edge-source');
        sourceNode = null;
        return;
      }

      _edgeCounter += 1;
      const id = `user-edge-${Date.now().toString(36)}-${_edgeCounter}`;
      const edge = cy.add({
        group: 'edges',
        data: {
          id,
          source: sourceNode.id(),
          target: node.id(),
          label: '',
          kind: 'object'
        }
      });

      const src = sourceNode;
      src.removeClass('edge-source');
      sourceNode = null;

      if (typeof onComplete === 'function') {
        try {
          onComplete(src, node, edge);
        } catch (err) {
          console.error('[enableEdgeDrawing.onComplete]', err);
        }
      }
    };

    const onTapBackground = (evt) => {
      // 빈 캔버스 탭 → 진행 중인 엣지 그리기 취소
      if (evt.target === cy && sourceNode) {
        sourceNode.removeClass('edge-source');
        sourceNode = null;
      }
    };

    cy.on('tap', 'node', onTapNode);
    cy.on('tap', onTapBackground);

    // 비활성화 함수 반환
    return function disable() {
      cy.off('tap', 'node', onTapNode);
      cy.off('tap', onTapBackground);
      if (sourceNode) {
        sourceNode.removeClass('edge-source');
        sourceNode = null;
      }
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 3. 삭제 / 추출 / 클리어
  // ─────────────────────────────────────────────────────────────
  function deleteSelected(cy) {
    if (!cy) return 0;
    const selected = cy.$(':selected');
    const count = selected.length;
    selected.remove();
    return count;
  }

  function getCurrentEdges(cy) {
    if (!cy) return [];
    return cy.edges().map((e) => ({
      source: e.source().data('label') || e.source().id(),
      target: e.target().data('label') || e.target().id(),
      label: e.data('label') || '',
      kind: e.data('kind') || 'object'
    }));
  }

  function getCurrentNodes(cy) {
    if (!cy) return [];
    return cy.nodes().map((n) => ({
      id: n.id(),
      label: n.data('label') || n.id(),
      kind: n.data('kind') || 'instance'
    }));
  }

  function clearGraph(cy) {
    if (!cy) return;
    cy.elements().remove();
  }

  // ─────────────────────────────────────────────────────────────
  // 4. 강조
  // ─────────────────────────────────────────────────────────────
  function highlightNodes(cy, ids) {
    if (!cy || !Array.isArray(ids)) return;
    cy.batch(() => {
      ids.forEach((id) => {
        const el = cy.getElementById(id);
        if (el && el.length) el.addClass('highlighted');
      });
    });
  }

  function clearHighlight(cy) {
    if (!cy) return;
    cy.elements().removeClass('highlighted').removeClass('faded');
  }

  global.GraphInteractions = {
    addNode,
    enableEdgeDrawing,
    deleteSelected,
    getCurrentEdges,
    getCurrentNodes,
    clearGraph,
    highlightNodes,
    clearHighlight
  };
})(typeof window !== 'undefined' ? window : globalThis);
