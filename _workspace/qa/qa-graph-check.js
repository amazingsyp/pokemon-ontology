// 그래프 레이아웃 & 라벨 가독성 검증
// 1) ch04, ch05, ch08, ch12, ch14 (이전에 dagre 였던 챕터)에서 노드가 한 점에 모이지 않는지
// 2) 엣지 라벨의 text-background-color가 명시 hex인지 (var() 가 아닌지)
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  const distPath = 'file://' + path.resolve(__dirname, '../../dist/index.html');
  await page.goto(distPath);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);

  const targets = ['ch01', 'ch04', 'ch05', 'ch08', 'ch12', 'ch14'];
  const results = [];

  for (const id of targets) {
    // 챕터 사이드바 항목 클릭
    const clicked = await page.evaluate((chId) => {
      const link = document.querySelector(`[data-chapter-id="${chId}"]`)
                || Array.from(document.querySelectorAll('a,button,li')).find(el => (el.dataset && el.dataset.id === chId) || el.getAttribute('data-id') === chId);
      if (link) { link.click(); return true; }
      // main.js의 loadChapter를 직접 호출
      if (typeof window.loadChapter === 'function') { window.loadChapter(chId); return true; }
      return false;
    }, id);

    await page.waitForTimeout(1500); // 레이아웃 애니메이션 대기

    const stats = await page.evaluate(() => {
      const cy = window.__cy || (window.state && window.state.cy);
      if (!cy) return { error: 'cy not found' };
      const nodes = cy.nodes();
      const positions = nodes.map(n => n.position());
      const xs = positions.map(p => p.x);
      const ys = positions.map(p => p.y);
      const xRange = Math.max(...xs) - Math.min(...xs);
      const yRange = Math.max(...ys) - Math.min(...ys);
      const layoutName = (cy.scratch('_slice') || {}).layoutHint;
      // 첫 엣지 스타일 샘플
      const firstEdge = cy.edges()[0];
      const edgeStyle = firstEdge ? {
        textBg: firstEdge.style('text-background-color'),
        color: firstEdge.style('color'),
        lineColor: firstEdge.style('line-color')
      } : null;
      return {
        nodeCount: nodes.length,
        edgeCount: cy.edges().length,
        xRange: Math.round(xRange),
        yRange: Math.round(yRange),
        spread: Math.round(Math.max(xRange, yRange)),
        layoutHint: layoutName,
        edgeStyle
      };
    });

    results.push({ id, clicked, ...stats });
    console.log(JSON.stringify({ id, ...stats }));
  }

  // 다크모드 토글 후 ch04 다시 확인
  await page.evaluate(() => { document.getElementById('theme-toggle')?.click(); });
  await page.waitForTimeout(800);
  const darkEdge = await page.evaluate(() => {
    const cy = window.__cy || (window.state && window.state.cy);
    if (!cy || !cy.edges().length) return null;
    const e = cy.edges()[0];
    return {
      textBg: e.style('text-background-color'),
      color: e.style('color'),
      bodyTheme: document.body.getAttribute('data-theme')
    };
  });
  console.log('darkMode edge sample:', JSON.stringify(darkEdge));
  console.log('pageerrors:', errors.length);
  if (errors.length) console.log(errors);

  await browser.close();

  // 판정
  const failed = results.filter(r => !r.spread || r.spread < 50);
  if (failed.length) {
    console.log('\n❌ FAILED — 노드가 한 점에 모임:', failed.map(f => `${f.id}(spread=${f.spread})`).join(', '));
    process.exit(1);
  }
  console.log('\n✅ PASS — 모든 챕터에서 그래프 노드가 정상 분산됨');
})();
