#!/usr/bin/env node
// QA-6: 모바일 반응형 헤드리스 검증 (Playwright Chromium)
// 결과를 _workspace/qa/results-mobile.json 에 기록.

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');
const DIST = 'file://' + path.join(ROOT, 'dist', 'index.html');

const VIEWPORTS = [
  { name: 'small mobile (320×568)',  width: 320,  height: 568 },
  { name: 'iPhone SE (375×667)',     width: 375,  height: 667 },
  { name: 'tablet (768×1024)',       width: 768,  height: 1024 },
  { name: 'desktop (1024×800)',      width: 1024, height: 800 },
  { name: 'desktop wide (1440×900)', width: 1440, height: 900 },
];

const results = {
  startedAt: new Date().toISOString(),
  url: DIST,
  viewports: [],
  passes: [],
  warnings: [],
  failures: [],
  consoleErrors: [],
};

function pass(scope, msg) { results.passes.push({ scope, msg }); }
function warn(scope, msg) { results.warnings.push({ scope, msg }); }
function fail(scope, msg, severity = 'high') { results.failures.push({ scope, msg, severity }); }

(async () => {
  const browser = await chromium.launch();
  const consoleErrors = [];

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();

    const errs = [];
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));

    await page.goto(DIST, { waitUntil: 'networkidle', timeout: 30000 });

    // 진입 직후 약간의 idle 대기 (그래프 렌더링)
    await page.waitForTimeout(800);

    const vpResult = await page.evaluate(({ vpWidth }) => {
      const body = document.body;
      const docEl = document.documentElement;
      const scrollWidth = Math.max(docEl.scrollWidth, body.scrollWidth);
      const clientWidth = docEl.clientWidth;
      const baseFs = parseFloat(getComputedStyle(body).fontSize);
      const hamburger = document.querySelector('.hamburger');
      const hamburgerStyle = hamburger ? getComputedStyle(hamburger) : null;
      const hamburgerVisible = hamburgerStyle && hamburgerStyle.display !== 'none' && hamburgerStyle.visibility !== 'hidden';
      const sidebar = document.querySelector('.sidebar');
      const sidebarStyle = sidebar ? getComputedStyle(sidebar) : null;
      const sidebarTransform = sidebarStyle ? sidebarStyle.transform : null;
      const sidebarOpenClass = sidebar ? sidebar.classList.contains('open') : false;
      const graph = document.querySelector('.graph-container, #graph, .graph-panel .graph-container');
      const graphRect = graph ? graph.getBoundingClientRect() : null;
      const contentEl = document.querySelector('.content');
      const chapterTitle = document.querySelector('.chapter-title, h1');
      const titleFs = chapterTitle ? parseFloat(getComputedStyle(chapterTitle).fontSize) : null;

      // 모든 노드의 우측 가장자리가 뷰포트 밖에 있는지 (가로 오버플로우 검출 보조)
      const all = document.querySelectorAll('body *');
      let widestRight = 0;
      let widestEl = null;
      for (const el of all) {
        if (el.offsetParent === null) continue; // hidden
        const r = el.getBoundingClientRect();
        if (r.right > widestRight) { widestRight = r.right; widestEl = el; }
      }
      const widestTag = widestEl ? (widestEl.tagName + (widestEl.className ? '.' + String(widestEl.className).split(/\s+/).slice(0,2).join('.') : '')) : null;

      return {
        scrollWidth, clientWidth,
        horizontalOverflow: scrollWidth > clientWidth + 1,
        baseFs,
        hamburgerVisible,
        sidebarTransform,
        sidebarOpenClass,
        graph: graphRect ? { width: graphRect.width, height: graphRect.height } : null,
        contentExists: !!contentEl,
        titleFs,
        widestRight, widestTag,
      };
    }, { vpWidth: vp.width });

    // 평가
    const r = { viewport: vp, ...vpResult, errors: [...errs] };
    results.viewports.push(r);

    const scope = vp.name;

    if (!vpResult.horizontalOverflow) {
      pass(scope, `가로 스크롤 없음 (scrollWidth ${vpResult.scrollWidth} ≤ clientWidth ${vpResult.clientWidth})`);
    } else {
      // 폭이 1px 정도 차이는 OS 스크롤바 영향이라 무시했지만 실제 오버플로우면 실패
      const delta = vpResult.scrollWidth - vpResult.clientWidth;
      if (delta > 4) {
        fail(scope, `가로 오버플로우 ${delta}px (widest: ${vpResult.widestTag} right=${Math.round(vpResult.widestRight)})`);
      } else {
        warn(scope, `소폭 오버플로우 ${delta}px (허용 범위)`);
      }
    }

    if (vp.width < 1024) {
      if (vpResult.hamburgerVisible) pass(scope, `햄버거 메뉴 표시 (모바일/태블릿)`);
      else fail(scope, `햄버거 메뉴 숨겨짐 — 모바일/태블릿에서 표시되어야 함`);
    } else {
      if (!vpResult.hamburgerVisible) pass(scope, `햄버거 메뉴 숨김 (데스크탑)`);
      else warn(scope, `데스크탑에서 햄버거 노출 — 의도된 디자인인지 확인`);
    }

    if (vpResult.baseFs >= 16) {
      pass(scope, `body font-size ${vpResult.baseFs}px (≥ 16px)`);
    } else {
      fail(scope, `body font-size ${vpResult.baseFs}px (< 16px)`);
    }

    if (vpResult.graph && vpResult.graph.height >= 200) {
      pass(scope, `.graph-container 높이 ${Math.round(vpResult.graph.height)}px`);
    } else if (vpResult.graph) {
      warn(scope, `.graph-container 높이 ${Math.round(vpResult.graph.height)}px — 너무 작음`);
    } else {
      warn(scope, `.graph-container 미감지`);
    }

    if (vpResult.contentExists) pass(scope, `.content 영역 존재`);
    else fail(scope, `.content 영역 미감지`);

    // 햄버거 토글 테스트 (모바일에서)
    if (vp.width < 1024 && vpResult.hamburgerVisible) {
      try {
        await page.click('.hamburger');
        await page.waitForTimeout(300);
        const opened = await page.evaluate(() => document.querySelector('.sidebar')?.classList.contains('open'));
        if (opened) pass(scope, `햄버거 클릭 → 사이드바 .open 토글 성공`);
        else fail(scope, `햄버거 클릭 후 사이드바 토글 실패`);
        // 닫기
        await page.click('.hamburger').catch(()=>{});
      } catch (e) {
        warn(scope, `햄버거 토글 테스트 실패: ${e.message}`);
      }
    }

    if (errs.length > 0) {
      consoleErrors.push({ viewport: vp.name, errs });
      // 콘솔 에러는 첫 번째만 fail로 신고 (중복 방지)
      fail(scope, `콘솔 에러 ${errs.length}건 (첫: ${errs[0].slice(0, 100)})`, 'medium');
    } else {
      pass(scope, `콘솔 에러 0건`);
    }

    await ctx.close();
  }

  results.consoleErrors = consoleErrors;
  await browser.close();

  results.summary = {
    viewports: VIEWPORTS.length,
    passes: results.passes.length,
    warnings: results.warnings.length,
    failures: results.failures.length,
  };
  results.finishedAt = new Date().toISOString();

  const outPath = path.join(ROOT, '_workspace', 'qa', 'results-mobile.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`✓ 모바일 QA 결과 저장: ${outPath}`);
  console.log(`  통과 ${results.passes.length}, 경고 ${results.warnings.length}, 실패 ${results.failures.length}`);
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
