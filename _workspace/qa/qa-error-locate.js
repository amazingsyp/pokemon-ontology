#!/usr/bin/env node
// dist/index.html 의 pageerror 위치 정밀 추적
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', e => {
    console.log('=== pageerror ===');
    console.log('name:', e.name);
    console.log('message:', e.message);
    console.log('stack:', e.stack);
  });
  page.on('console', m => {
    if (m.type() === 'error' || m.type() === 'warning') {
      console.log(`[${m.type()}]`, m.text());
      const loc = m.location();
      if (loc) console.log('  at', loc.url, loc.lineNumber, ':', loc.columnNumber);
    }
  });

  const file = 'file://' + path.resolve(__dirname, '..', '..', 'dist', 'index.html');
  await page.goto(file, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Probe app state
  const state = await page.evaluate(() => ({
    hasPokeOnt: typeof window.PokeOnt,
    hasCytoscape: typeof window.cytoscape,
    docTitle: document.title,
    sidebarHasOpen: document.querySelector('.sidebar')?.classList.contains('open'),
    chapterCount: document.querySelectorAll('.chapter-item').length,
    contentText: document.querySelector('.content')?.innerText?.slice(0, 200),
  }));
  console.log('STATE:', JSON.stringify(state, null, 2));

  await browser.close();
})();
