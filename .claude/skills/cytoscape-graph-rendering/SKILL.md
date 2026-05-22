---
name: cytoscape-graph-rendering
description: Cytoscape.js 기반 인터랙티브 온톨로지 그래프 렌더링·노드 추가·엣지 그리기·추론 애니메이션·모바일 터치 지원 구현 가이드. 그래프 슬라이스 표시, 노드 스타일링(클래스/인스턴스/리터럴 시각 구분), 레이아웃 선택, 핀치줌/롱프레스 메뉴 작업 시 사용.
---

# Cytoscape.js 그래프 렌더링

학습자가 온톨로지를 "그림"으로 만나는 1차 인터페이스. Cytoscape.js를 사용.

## 왜 Cytoscape.js인가

- 대용량 그래프 성능 좋음 (수백~수천 노드)
- 다양한 레이아웃 (force, hierarchical, circle, ...)
- 터치 이벤트 기본 지원
- 단일 JS 파일로 인라인 가능 (단일 HTML 요구사항)

## 초기화 (graph-renderer.js)

```javascript
function createGraph(containerEl, sliceData) {
  return cytoscape({
    container: containerEl,
    elements: [
      ...sliceData.nodes.map(n => ({ data: { id: n.id, label: n.label, kind: n.type } })),
      ...sliceData.edges.map(e => ({ data: { id: `${e.source}->${e.target}`, source: e.source, target: e.target, label: e.label, kind: e.kind } }))
    ],
    style: GRAPH_STYLES,
    layout: { name: sliceData.layoutHint || 'cose', animate: true, padding: 30 },
    minZoom: 0.2,
    maxZoom: 3.5,
    wheelSensitivity: 0.3
  });
}
```

## 스타일시트 (graph-styles.js)

각 노드/엣지 종류를 시각적으로 구별:

```javascript
const GRAPH_STYLES = [
  // 클래스
  {
    selector: 'node[kind="class"]',
    style: {
      'shape': 'round-rectangle',
      'background-color': 'var(--node-class-bg, #3B82F6)',
      'color': '#fff',
      'label': 'data(label)',
      'text-valign': 'center',
      'text-halign': 'center',
      'font-size': '14px',
      'font-weight': 600,
      'width': 'label',
      'height': 36,
      'padding': '12px',
      'border-width': 2,
      'border-color': '#1E40AF'
    }
  },
  // 인스턴스
  {
    selector: 'node[kind="instance"]',
    style: {
      'shape': 'ellipse',
      'background-color': 'var(--node-instance-bg, #F59E0B)',
      'color': '#1F2937',
      'label': 'data(label)',
      'text-valign': 'center',
      'text-halign': 'center',
      'font-size': '13px',
      'width': 'label',
      'height': 32,
      'padding': '10px'
    }
  },
  // 리터럴
  {
    selector: 'node[kind="literal"]',
    style: {
      'shape': 'tag',
      'background-color': '#9CA3AF',
      'color': '#1F2937',
      'label': 'data(label)',
      'font-size': '12px',
      'font-style': 'italic'
    }
  },
  // 객체 속성 엣지
  {
    selector: 'edge[kind="object"]',
    style: {
      'curve-style': 'bezier',
      'line-color': '#14B8A6',
      'target-arrow-color': '#14B8A6',
      'target-arrow-shape': 'triangle',
      'width': 2,
      'label': 'data(label)',
      'font-size': '11px',
      'text-rotation': 'autorotate',
      'text-background-color': '#fff',
      'text-background-opacity': 0.8,
      'text-background-padding': 2
    }
  },
  // is-a 엣지
  {
    selector: 'edge[kind="is-a"]',
    style: {
      'curve-style': 'bezier',
      'line-color': '#8B5CF6',
      'target-arrow-color': '#8B5CF6',
      'target-arrow-shape': 'triangle',
      'width': 3,
      'line-style': 'solid',
      'label': 'data(label)',
      'font-size': '11px'
    }
  },
  // 데이터 속성 엣지
  {
    selector: 'edge[kind="data"]',
    style: {
      'line-style': 'dashed',
      'line-color': '#6B7280',
      'target-arrow-color': '#6B7280',
      'target-arrow-shape': 'triangle',
      'width': 1.5,
      'label': 'data(label)',
      'font-size': '10px'
    }
  },
  // 추론으로 도출된 트리플 (강조)
  {
    selector: '.inferred',
    style: {
      'line-color': '#EF4444',
      'target-arrow-color': '#EF4444',
      'opacity': 0.85,
      'width': 2.5
    }
  },
  // 강조 (highlight)
  {
    selector: '.highlighted',
    style: {
      'border-width': 4,
      'border-color': '#F59E0B'
    }
  },
  // 선택
  {
    selector: ':selected',
    style: {
      'border-width': 5,
      'border-color': '#EC4899'
    }
  }
];
```

## 레이아웃 선택 가이드

| 슬라이스 특성 | layout |
|------------|--------|
| 단순 계층 (is-a 트리) | `breadthfirst` |
| 진화 체인 (선형) | `dagre` (외부 plugin) 또는 `breadthfirst` |
| 일반 관계망 | `cose` |
| 대규모 (>100 노드) | `cose-bilkent` 또는 `fcose` |
| 원형 표현 (개념 비교) | `concentric` |

`cose`는 기본 내장. plugin이 필요한 경우 단일 HTML 빌드 시 함께 인라인.

## 인터랙션 (graph-interactions.js)

학습자가 그래프를 만들 수 있는 API:

```javascript
const graphAPI = {
  // 새 노드 추가
  addNode(label, kind = 'instance') {
    const id = `user-${Date.now()}`;
    cy.add({ data: { id, label, kind } });
    return id;
  },

  // 엣지 추가 (드래그로 노드 → 노드 연결)
  enableEdgeDrawing() {
    cy.edgehandles({
      // 사용자 정의 옵션
      handleNodes: 'node',
      complete: (sourceNode, targetNode, addedEdges) => {
        showEdgeLabelDialog((label, kind) => {
          addedEdges.data({ label, kind });
        });
      }
    });
  },

  // 노드/엣지 삭제 (탭하여 선택 후 Delete 또는 삭제 버튼)
  deleteSelected() {
    cy.$(':selected').remove();
  },

  // 사용자 입력 그래프를 정답과 비교
  getCurrentEdges() {
    return cy.edges().map(e => ({
      source: e.source().data('label'),
      target: e.target().data('label'),
      label: e.data('label')
    }));
  }
};
```

## 모바일 터치 지원 (graph-mobile.js)

```javascript
function setupMobileGraph(cy) {
  const isMobile = window.matchMedia('(max-width: 768px)').matches;

  if (isMobile) {
    // 폰트 크기 부스트
    cy.style().selector('node').style({ 'font-size': '16px' }).update();
    cy.style().selector('edge').style({ 'font-size': '13px', 'width': 3 }).update();

    // 핀치 줌 (Cytoscape 기본 활성화)
    cy.userZoomingEnabled(true);
    cy.userPanningEnabled(true);

    // 더블탭 = 노드 추가 (PC 더블클릭 대응)
    cy.on('dbltap', (evt) => {
      if (evt.target === cy) {
        // 빈 캔버스 더블탭 → 새 노드 추가 다이얼로그
        promptNewNode(evt.position);
      }
    });

    // 롱프레스 = 컨텍스트 메뉴 (삭제, 라벨 변경)
    cy.on('taphold', 'node', (evt) => {
      showContextMenu(evt.target, evt.renderedPosition);
    });
  }

  // 화면 회전 대응
  window.addEventListener('resize', () => {
    cy.resize();
    cy.fit(null, 30);
  });
}
```

## 추론 애니메이션 (inference-animator.js)

챕터 13에서 규칙이 발화하면 도출 트리플을 단계적으로 시각화:

```javascript
async function animateInference(cy, rule, derivedTriples) {
  // 1. 규칙의 if 부분에 해당하는 기존 엣지 강조
  rule.matchedEdges.forEach(e => cy.getElementById(e.id).addClass('highlighted'));
  await delay(800);

  // 2. 도출된 트리플을 점선으로 fade-in
  for (const t of derivedTriples) {
    cy.add({
      data: { id: `inferred-${t.s}-${t.p}-${t.o}`, source: t.s, target: t.o, label: t.p, kind: 'object' },
      classes: 'inferred dashed'
    });
    await delay(400);
  }

  // 3. 점선 → 실선으로 변환 (확정)
  await delay(600);
  cy.$('.inferred').removeClass('dashed').addClass('solid');

  // 4. if 부분 강조 해제
  cy.$('.highlighted').removeClass('highlighted');
}
```

## 성능 팁

- 대규모 슬라이스(>100 노드)는 `cy.batch(() => { ... })` 안에서 일괄 추가
- 레이아웃은 한 번만 실행. 사용자가 그래프 수정해도 재실행 X
- `cy.style().update()` 호출 최소화. 가능한 한 element data 변경만으로 처리
- 화면에서 안 보이는 노드 hide: `cy.elements().not(visibleNodes).style('display', 'none')`

## 단일 HTML 인라인 (Cytoscape)

Cytoscape.js의 `dist/cytoscape.min.js` (약 350KB)를 다운로드하여 src/vendor/에 두고, build.js가 `<script>` 태그에 인라인.

```html
<script>
  /* cytoscape.min.js 내용 인라인 */
</script>
<script>
  /* graph-renderer.js 내용 */
</script>
```
