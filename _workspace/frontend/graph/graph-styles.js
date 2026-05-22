/**
 * graph-styles.js
 *
 * Cytoscape.js 스타일시트. 노드/엣지의 종류(kind)별 시각적 구분을 정의한다.
 * - class:    둥근 사각형, 파랑
 * - instance: 원, 노랑
 * - literal:  태그(꼬리표) 모양, 회색
 * - object:   실선 청록 화살표
 * - is-a:     두꺼운 보라 화살표
 * - data:     점선 회색 화살표
 *
 * 강조 클래스: .highlighted (테두리 강조), .inferred (빨강), :selected
 *
 * **중요:** Cytoscape는 스타일 값에서 `var(--css-var)` 문법을 해석하지 못한다.
 * 그래서 다크모드 토큰을 그대로 var()로 넘기면 색이 undefined로 처리되어
 * "까만 배경에 까만 글씨" 같은 가독성 사고가 난다. 따라서 buildGraphStyles()
 * 함수가 호출되는 시점에 :root의 CSS 변수를 getComputedStyle로 읽어
 * 명시적 hex 값을 cytoscape에 전달한다. 테마 토글 시 main.js가 이 함수를
 * 다시 호출하여 cy.style(...)을 갱신한다.
 */
(function (global) {
  'use strict';

  // CSS 변수 → 실제 색 문자열로 resolve. 브라우저가 :root에서 계산한 값 사용.
  // 빈 문자열이면 fallback 적용.
  function v(name, fallback) {
    if (typeof document === 'undefined' || !document.documentElement) return fallback;
    const value = getComputedStyle(document.documentElement).getPropertyValue(name);
    const trimmed = value && value.trim();
    return trimmed || fallback;
  }

  function buildGraphStyles() {
    return [
      // ── 노드: 클래스 ─────────────────────────────────────────────
      // shadow-* 속성으로 "둥둥 떠 있는" 깊이감 부여. 그림자가 노드 아래쪽에
      // 살짝 떨어진 위치에 깔려야 부유감이 생긴다.
      {
        selector: 'node[kind="class"]',
        style: {
          'shape': 'round-rectangle',
          'background-color': v('--node-class-bg', '#3B82F6'),
          'color': v('--node-class-fg', '#FFFFFF'),
          'label': 'data(label)',
          'text-valign': 'center',
          'text-halign': 'center',
          'font-size': '14px',
          'font-weight': 600,
          'width': 'label',
          'height': 36,
          'padding': '12px',
          'border-width': 2,
          'border-color': v('--node-class-border', '#1E40AF'),
          'border-opacity': 0.6,
          'text-wrap': 'wrap',
          'text-max-width': '160px',
          'shadow-blur': 18,
          'shadow-color': '#1E3A8A',
          'shadow-offset-x': 0,
          'shadow-offset-y': 8,
          'shadow-opacity': 0.35
        }
      },

      // ── 노드: 인스턴스 ──────────────────────────────────────────
      {
        selector: 'node[kind="instance"]',
        style: {
          'shape': 'ellipse',
          'background-color': v('--node-instance-bg', '#F59E0B'),
          'color': v('--node-instance-fg', '#1F2937'),
          'label': 'data(label)',
          'text-valign': 'center',
          'text-halign': 'center',
          'font-size': '13px',
          'font-weight': 500,
          'width': 'label',
          'height': 32,
          'padding': '10px',
          'border-width': 2,
          'border-color': v('--node-instance-border', '#B45309'),
          'border-opacity': 0.55,
          'text-wrap': 'wrap',
          'text-max-width': '140px',
          'shadow-blur': 14,
          'shadow-color': '#92400E',
          'shadow-offset-x': 0,
          'shadow-offset-y': 6,
          'shadow-opacity': 0.32
        }
      },

      // ── 노드: 리터럴 (데이터값) ─────────────────────────────────
      {
        selector: 'node[kind="literal"]',
        style: {
          'shape': 'tag',
          'background-color': v('--node-literal-bg', '#9CA3AF'),
          'color': v('--node-literal-fg', '#1F2937'),
          'label': 'data(label)',
          'text-valign': 'center',
          'text-halign': 'center',
          'font-size': '12px',
          'font-style': 'italic',
          'width': 'label',
          'height': 28,
          'padding': '8px',
          'border-width': 1,
          'border-color': v('--node-literal-border', '#4B5563'),
          'shadow-blur': 10,
          'shadow-color': '#1F2937',
          'shadow-offset-x': 0,
          'shadow-offset-y': 5,
          'shadow-opacity': 0.25
        }
      },

      // ── 엣지: 객체 속성 (object property) ────────────────────────
      // 라벨은 항상 흰배경 + 짙은 색 글씨로 통일 → 라이트/다크 무관 가독성 보장.
      {
        selector: 'edge[kind="object"]',
        style: {
          'curve-style': 'bezier',
          'line-color': v('--edge-object', '#14B8A6'),
          'target-arrow-color': v('--edge-object', '#14B8A6'),
          'target-arrow-shape': 'triangle',
          'arrow-scale': 1.2,
          'width': 2,
          'label': 'data(label)',
          'font-size': '11px',
          'font-weight': 600,
          'color': '#0F766E',
          'text-rotation': 'autorotate',
          'text-background-color': '#FFFFFF',
          'text-background-opacity': 0.95,
          'text-background-padding': '3px',
          'text-background-shape': 'roundrectangle',
          'text-border-width': 1,
          'text-border-color': '#14B8A6',
          'text-border-opacity': 0.4,
          'text-margin-y': -2
        }
      },

      // ── 엣지: is-a (subclass / type) ─────────────────────────────
      {
        selector: 'edge[kind="is-a"]',
        style: {
          'curve-style': 'bezier',
          'line-color': v('--edge-isa', '#8B5CF6'),
          'target-arrow-color': v('--edge-isa', '#8B5CF6'),
          'target-arrow-shape': 'triangle',
          'arrow-scale': 1.3,
          'width': 3,
          'line-style': 'solid',
          'label': 'data(label)',
          'font-size': '11px',
          'font-weight': 700,
          'color': '#6D28D9',
          'text-rotation': 'autorotate',
          'text-background-color': '#FFFFFF',
          'text-background-opacity': 0.95,
          'text-background-padding': '3px',
          'text-background-shape': 'roundrectangle',
          'text-border-width': 1,
          'text-border-color': '#8B5CF6',
          'text-border-opacity': 0.4,
          'text-margin-y': -2
        }
      },

      // ── 엣지: 데이터 속성 (data property) ───────────────────────
      {
        selector: 'edge[kind="data"]',
        style: {
          'curve-style': 'bezier',
          'line-style': 'dashed',
          'line-color': v('--edge-data', '#6B7280'),
          'target-arrow-color': v('--edge-data', '#6B7280'),
          'target-arrow-shape': 'triangle',
          'width': 1.5,
          'label': 'data(label)',
          'font-size': '10px',
          'font-weight': 500,
          'color': '#374151',
          'text-rotation': 'autorotate',
          'text-background-color': '#FFFFFF',
          'text-background-opacity': 0.95,
          'text-background-padding': '3px',
          'text-background-shape': 'roundrectangle',
          'text-margin-y': -2
        }
      },

      // ── 강조: highlighted (규칙 매칭, 검색 결과 등) ─────────────
      {
        selector: '.highlighted',
        style: {
          'border-width': 4,
          'border-color': v('--highlight-color', '#F59E0B'),
          'border-opacity': 1,
          'overlay-color': v('--highlight-color', '#F59E0B'),
          'overlay-opacity': 0.15,
          'overlay-padding': '6px',
          'transition-property': 'border-width, border-color, overlay-opacity',
          'transition-duration': '300ms'
        }
      },
      {
        selector: 'edge.highlighted',
        style: {
          'width': 4,
          'line-color': v('--highlight-color', '#F59E0B'),
          'target-arrow-color': v('--highlight-color', '#F59E0B'),
          'transition-property': 'width, line-color, target-arrow-color',
          'transition-duration': '300ms'
        }
      },

      // ── 추론 결과: .inferred (도출된 트리플) ────────────────────
      {
        selector: '.inferred',
        style: {
          'line-color': v('--inferred-color', '#EF4444'),
          'target-arrow-color': v('--inferred-color', '#EF4444'),
          'color': '#B91C1C',
          'opacity': 0.95,
          'width': 2.5,
          'transition-property': 'line-color, target-arrow-color, opacity, width',
          'transition-duration': '400ms'
        }
      },
      {
        selector: '.inferred.dashed',
        style: {
          'line-style': 'dashed',
          'line-dash-pattern': [8, 4]
        }
      },
      {
        selector: '.inferred.solid',
        style: {
          'line-style': 'solid'
        }
      },
      {
        selector: 'node.inferred',
        style: {
          'border-width': 3,
          'border-color': v('--inferred-color', '#EF4444'),
          'border-style': 'dashed'
        }
      },

      // ── 선택 (탭/클릭) ──────────────────────────────────────────
      {
        selector: ':selected',
        style: {
          'border-width': 5,
          'border-color': v('--selected-color', '#EC4899'),
          'border-opacity': 1
        }
      },
      {
        selector: 'edge:selected',
        style: {
          'width': 4.5,
          'line-color': v('--selected-color', '#EC4899'),
          'target-arrow-color': v('--selected-color', '#EC4899')
        }
      },

      // ── 흐리게 (faded) ──────────────────────────────────────────
      {
        selector: '.faded',
        style: {
          'opacity': 0.25,
          'transition-property': 'opacity',
          'transition-duration': '300ms'
        }
      },

      // ── 엣지 그리기 임시 상태 ───────────────────────────────────
      {
        selector: '.edge-source',
        style: {
          'border-width': 4,
          'border-color': v('--edge-source-color', '#10B981'),
          'overlay-color': v('--edge-source-color', '#10B981'),
          'overlay-opacity': 0.2,
          'overlay-padding': '8px'
        }
      }
    ];
  }

  // 호환: 첫 호출 결과를 window.GRAPH_STYLES 로 노출 (기존 코드 호환)
  global.buildGraphStyles = buildGraphStyles;
  global.GRAPH_STYLES = buildGraphStyles();
})(typeof window !== 'undefined' ? window : globalThis);
