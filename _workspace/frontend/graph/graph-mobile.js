/**
 * graph-mobile.js
 *
 * 모바일(터치) 환경 최적화.
 *
 * 외부 API:
 *   - window.GraphMobile.setup(cy, options) → teardown 함수
 *
 * options:
 *   {
 *     onAddNode: ({ x, y }) => void,   // 빈 캔버스 더블탭
 *     onContextMenu: (node, { x, y }) => void, // 노드 롱프레스
 *     forceMobile: boolean             // 모바일 강제 적용(테스트용)
 *   }
 *
 * - 모바일 감지: window.matchMedia('(max-width: 768px)')
 * - 모바일이면 노드 font-size 16px, 엣지 width 3, font-size 13px
 * - 핀치 줌/패닝은 Cytoscape 기본값 사용 (userZoomingEnabled, userPanningEnabled)
 * - 더블탭 빈 캔버스 → onAddNode 콜백
 * - 롱프레스 노드 → onContextMenu 콜백
 * - window resize → cy.resize() + cy.fit(30)
 */
(function (global) {
  'use strict';

  function isMobileViewport() {
    if (typeof global.matchMedia !== 'function') return false;
    return global.matchMedia('(max-width: 768px)').matches;
  }

  function setupMobileGraph(cy, options) {
    if (!cy) throw new Error('[GraphMobile.setup] cy is required');
    const opts = options || {};
    const mobile = opts.forceMobile === true || isMobileViewport();

    // 핀치 줌 / 패닝은 항상 활성화 (Cytoscape 기본 터치 처리)
    cy.userZoomingEnabled(true);
    cy.userPanningEnabled(true);
    cy.boxSelectionEnabled(false);

    if (mobile) {
      // 폰트/엣지 크기 부스트
      cy.style()
        .selector('node')
        .style({ 'font-size': '16px' })
        .selector('node[kind="literal"]')
        .style({ 'font-size': '14px' })
        .selector('edge')
        .style({ 'font-size': '13px', 'width': 3 })
        .selector('edge[kind="is-a"]')
        .style({ 'width': 4 })
        .selector('edge[kind="data"]')
        .style({ 'width': 2.5 })
        .update();

      // 탭 영역을 키우기 위한 약간의 padding 트릭은 위 스타일에서 처리됨
    }

    // ── 더블탭: 빈 캔버스에서만 노드 추가 콜백 트리거 ─────────
    const onDblTap = (evt) => {
      if (evt.target === cy) {
        if (typeof opts.onAddNode === 'function') {
          try {
            opts.onAddNode(evt.position, evt);
          } catch (err) {
            console.error('[GraphMobile.onAddNode]', err);
          }
        }
      }
    };
    cy.on('dbltap', onDblTap);

    // ── 롱프레스(노드): 컨텍스트 메뉴 콜백 ──────────────────
    const onTapHoldNode = (evt) => {
      const node = evt.target;
      if (typeof opts.onContextMenu === 'function') {
        try {
          opts.onContextMenu(node, evt.renderedPosition || evt.position, evt);
        } catch (err) {
          console.error('[GraphMobile.onContextMenu]', err);
        }
      }
    };
    cy.on('taphold', 'node', onTapHoldNode);

    // ── 리사이즈: cy.resize() + fit ─────────────────────────
    let resizeRaf = null;
    const onResize = () => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        try {
          cy.resize();
          cy.fit(null, 30);
        } catch (err) {
          // 컨테이너가 detach된 경우 등 무시
        }
      });
    };
    global.addEventListener('resize', onResize, { passive: true });
    global.addEventListener('orientationchange', onResize, { passive: true });

    // teardown
    return function teardown() {
      cy.off('dbltap', onDblTap);
      cy.off('taphold', 'node', onTapHoldNode);
      global.removeEventListener('resize', onResize);
      global.removeEventListener('orientationchange', onResize);
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
    };
  }

  global.GraphMobile = {
    setup: setupMobileGraph,
    isMobile: isMobileViewport
  };
})(typeof window !== 'undefined' ? window : globalThis);
