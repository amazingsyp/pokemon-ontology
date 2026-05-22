// 모바일: 모든 14챕터에서 .graph-panel이 article 최상단(first element child)에 있는지 검증.
// 데스크탑: .layout 의 자식으로 유지되는지 검증.
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const distPath = 'file://' + path.resolve(__dirname, '../../docs/index.html');
  let failed = 0;

  // ───── 모바일: 14챕터 전부 확인 ─────────────────────────────
  console.log('─ MOBILE (375x667) ────────────────────────');
  const mobile = await browser.newPage({ viewport: { width: 375, height: 667 } });
  await mobile.goto(distPath);
  await mobile.waitForLoadState('networkidle');
  await mobile.waitForTimeout(800);

  for (let i = 1; i <= 14; i++) {
    const id = `ch${String(i).padStart(2, '0')}`;
    await mobile.evaluate((chId) => {
      if (window.__loadChapter) window.__loadChapter(chId);
    }, id);
    await mobile.waitForTimeout(500);

    const info = await mobile.evaluate(() => {
      const panel = document.getElementById('graph-panel');
      const article = document.getElementById('chapter-content');
      return {
        isFirstChild: article && article.firstElementChild === panel,
        parentTag: panel && panel.parentElement ? (panel.parentElement.id || panel.parentElement.tagName) : null
      };
    });
    const ok = info.isFirstChild === true;
    if (!ok) failed++;
    console.log(`  ${ok ? '✓' : '✗'} ${id}: firstChild=${info.isFirstChild} parent=${info.parentTag}`);
  }
  await mobile.close();

  // ───── 데스크탑: 패널이 layout 자식인지 ─────────────────────
  console.log('\n─ DESKTOP (1280x800) ──────────────────────');
  const desk = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await desk.goto(distPath);
  await desk.waitForLoadState('networkidle');
  await desk.waitForTimeout(600);

  const deskInfo = await desk.evaluate(() => {
    const panel = document.getElementById('graph-panel');
    const layout = document.querySelector('.layout');
    return {
      inLayout: panel && panel.parentElement === layout,
      parentTag: panel && panel.parentElement ? (panel.parentElement.id || panel.parentElement.tagName) : null
    };
  });
  if (!deskInfo.inLayout) failed++;
  console.log(`  ${deskInfo.inLayout ? '✓' : '✗'} desktop: panel.parent === .layout (got ${deskInfo.parentTag})`);
  await desk.close();

  // ───── 리사이즈 전환 ────────────────────────────────────
  console.log('\n─ RESIZE: desktop → mobile → desktop ───────');
  const r = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await r.goto(distPath);
  await r.waitForLoadState('networkidle');
  await r.waitForTimeout(500);
  const s1 = await r.evaluate(() => document.getElementById('graph-panel').parentElement.id || document.getElementById('graph-panel').parentElement.tagName);
  await r.setViewportSize({ width: 375, height: 667 });
  await r.waitForTimeout(500);
  const s2 = await r.evaluate(() => {
    const p = document.getElementById('graph-panel');
    const a = document.getElementById('chapter-content');
    return (a.firstElementChild === p) ? 'article.firstChild' : (p.parentElement.id || p.parentElement.tagName);
  });
  await r.setViewportSize({ width: 1280, height: 800 });
  await r.waitForTimeout(500);
  const s3 = await r.evaluate(() => document.getElementById('graph-panel').parentElement.id || document.getElementById('graph-panel').parentElement.tagName);
  console.log(`  desktop=${s1} → mobile=${s2} → desktop=${s3}`);
  if (s2 !== 'article.firstChild') failed++;
  await r.close();

  await browser.close();
  if (failed) { console.log(`\n❌ ${failed} 케이스 실패`); process.exit(1); }
  console.log('\n✅ 모든 케이스 통과');
})();
