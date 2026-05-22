/**
 * graph-renderer.js
 *
 * Cytoscape 인스턴스 생성과 슬라이스 데이터 로딩을 담당.
 *
 * 외부 API:
 *   - window.GraphRenderer.create(containerEl, sliceData) → cy 인스턴스
 *   - window.GraphRenderer.loadSlice(cy, sliceData)       → 기존 cy에 새 슬라이스 로드
 *
 * sliceData 형식 (참고: _workspace/ontology/graph-slices/ch01.json):
 *   {
 *     id, title,
 *     nodes: [{ id, label, type }, ...],     // type: 'class'|'instance'|'literal'
 *     edges: [{ source, target, label, kind }, ...], // kind: 'object'|'is-a'|'data'
 *     highlight: [nodeId, ...],              // 옵션
 *     layoutHint: 'breadthfirst'|'cose'|...  // 옵션
 *   }
 *
 * Cytoscape는 window.cytoscape 로 접근 (CDN/인라인 모두 호환).
 */
(function (global) {
  'use strict';

  // IRI에서 사람이 읽을 수 있는 라벨 추출. "poke:pokemon-25" → "pokemon-25" 등.
  function labelFromIri(iri) {
    return String(iri).replace(/^[^:]+:/, '');
  }

  // 노드 정의가 없는 IRI에 대해 kind 추론. 'pokemon-NN', 'type-xxx', 'gen-N', 'evolution-N'
  // 같은 소문자 슬러그는 인스턴스로, PascalCase("FireType", "NormalTypePokemon")는 클래스로.
  function inferKind(iri) {
    const local = labelFromIri(iri);
    if (/^[A-Z]/.test(local)) return 'class';
    return 'instance';
  }

  /**
   * sliceData → Cytoscape elements 배열로 변환.
   * 엣지의 source/target이 nodes 배열에 누락되어 있어도 자동으로 노드를 생성한다
   * (특히 추론 결과로 도출된 엣지가 신규 클래스를 참조할 때 cytoscape가 죽지 않도록).
   * 원본 데이터를 직접 mutate 하지 않는다.
   */
  function buildElements(sliceData) {
    const nodeMap = new Map();
    (sliceData.nodes || []).forEach((n) => {
      if (!n || !n.id) return;
      nodeMap.set(n.id, {
        id: n.id,
        label: n.label != null ? String(n.label) : labelFromIri(n.id),
        kind: n.type || 'instance'
      });
    });

    const edges = (sliceData.edges || []).map((e, idx) => {
      // 누락 노드 자동 보강
      [e.source, e.target].forEach((iri) => {
        if (iri && !nodeMap.has(iri)) {
          nodeMap.set(iri, { id: iri, label: labelFromIri(iri), kind: inferKind(iri) });
        }
      });
      const id = e.id || `${e.source}--${e.label || e.kind || 'rel'}-->${e.target}#${idx}`;
      return {
        group: 'edges',
        data: {
          id,
          source: e.source,
          target: e.target,
          label: e.label != null ? String(e.label) : '',
          kind: e.kind || 'object'
        }
      };
    });

    const nodes = Array.from(nodeMap.values()).map((data) => ({ group: 'nodes', data }));
    return [...nodes, ...edges];
  }

  // Cytoscape 빌트인 레이아웃 화이트리스트. dagre/cola/elk 같은 확장은 별도 익스텐션이
  // 필요한데 단일 HTML 빌드에서는 미포함이라 noop 처리되어 모든 노드가 (0,0)에 모인다.
  // 알 수 없는 hint는 의도에 가장 가까운 빌트인으로 폴백한다.
  const BUILTIN_LAYOUTS = new Set([
    'null', 'random', 'preset', 'grid', 'circle',
    'concentric', 'breadthfirst', 'cose'
  ]);
  const LAYOUT_FALLBACK = {
    dagre: 'breadthfirst',
    elk: 'breadthfirst',
    klay: 'breadthfirst',
    cola: 'cose',
    fcose: 'cose',
    'cose-bilkent': 'cose',
    euler: 'cose',
    spread: 'cose'
  };
  function resolveLayoutName(hint) {
    if (!hint) return 'cose';
    if (BUILTIN_LAYOUTS.has(hint)) return hint;
    return LAYOUT_FALLBACK[hint] || 'cose';
  }

  // 스타일 동적 생성: theme toggle 시 main.js가 cy.style(currentStyles()).update()로 갱신.
  function currentStyles() {
    return (typeof global.buildGraphStyles === 'function')
      ? global.buildGraphStyles()
      : (global.GRAPH_STYLES || []);
  }

  /**
   * Cytoscape 인스턴스 생성.
   */
  function createGraph(containerEl, sliceData) {
    if (!containerEl) {
      throw new Error('[GraphRenderer.create] containerEl is required');
    }
    if (!global.cytoscape) {
      throw new Error('[GraphRenderer.create] window.cytoscape not found. Did you inline cytoscape.min.js?');
    }
    const slice = sliceData || { nodes: [], edges: [] };
    const layoutName = resolveLayoutName(slice.layoutHint);

    const cy = global.cytoscape({
      container: containerEl,
      elements: buildElements(slice),
      style: currentStyles(),
      layout: {
        name: layoutName,
        animate: true,
        animationDuration: 600,
        padding: 30,
        fit: true,
        // breadthfirst 일 때 루트가 위에 오도록
        directed: true,
        spacingFactor: 1.1
      },
      minZoom: 0.2,
      maxZoom: 3.5,
      wheelSensitivity: 0.3,
      boxSelectionEnabled: false,
      autounselectify: false,
      selectionType: 'single'
    });

    // 슬라이스의 highlight 목록 적용
    if (Array.isArray(slice.highlight)) {
      slice.highlight.forEach((id) => {
        const el = cy.getElementById(id);
        if (el && el.length) el.addClass('highlighted');
      });
    }

    // 메타데이터를 cy 객체에 보존 (외부 모듈에서 참고 가능)
    cy.scratch('_slice', { id: slice.id, title: slice.title, layoutHint: slice.layoutHint });

    return cy;
  }

  /**
   * 기존 cy에 새 슬라이스 로드. 기존 요소를 모두 제거하고 새로 채운다.
   * 레이아웃을 재실행한다.
   */
  function loadSlice(cy, sliceData) {
    if (!cy) throw new Error('[GraphRenderer.loadSlice] cy is required');
    const slice = sliceData || { nodes: [], edges: [] };

    cy.batch(() => {
      cy.elements().remove();
      cy.add(buildElements(slice));
    });

    if (Array.isArray(slice.highlight)) {
      slice.highlight.forEach((id) => {
        const el = cy.getElementById(id);
        if (el && el.length) el.addClass('highlighted');
      });
    }

    const layout = cy.layout({
      name: resolveLayoutName(slice.layoutHint),
      animate: true,
      animationDuration: 600,
      padding: 30,
      fit: true,
      directed: true,
      spacingFactor: 1.1
    });
    layout.run();

    cy.scratch('_slice', { id: slice.id, title: slice.title, layoutHint: slice.layoutHint });
    return cy;
  }

  // 외부에서 테마 토글 후 호출하여 현재 :root CSS 변수 기준으로 스타일을 다시 적용.
  function refreshStyles(cy) {
    if (!cy) return;
    cy.style(currentStyles()).update();
  }

  global.GraphRenderer = {
    create: createGraph,
    loadSlice: loadSlice,
    refreshStyles: refreshStyles,
    _buildElements: buildElements // 테스트/디버그용
  };
})(typeof window !== 'undefined' ? window : globalThis);
