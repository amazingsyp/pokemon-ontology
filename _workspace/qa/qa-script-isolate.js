#!/usr/bin/env node
// dist/index.html 안의 모든 JS 스크립트를 추출해 새 페이지에서 하나씩 실행하면서
// 어느 스크립트에서 SyntaxError가 나는지 찾는다.

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const html = fs.readFileSync(path.resolve(__dirname, '..', '..', 'dist', 'index.html'), 'utf8');

// 모든 <script ...>…</script> 추출 (application/json 제외)
const scripts = [];
const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
let m;
let idx = 0;
while ((m = re.exec(html)) !== null) {
  const attrs = m[1] || '';
  const body = m[2];
  idx++;
  const isData = /type\s*=\s*["']application\/json["']/.test(attrs);
  scripts.push({ idx, attrs: attrs.trim(), isData, length: body.length, body });
}
console.log(`총 ${scripts.length}개 <script>, JS만:`);
const jsOnly = scripts.filter(s => !s.isData);
for (const s of jsOnly) {
  // 짧은 식별 토큰
  const head = s.body.replace(/\s+/g,' ').slice(0, 80);
  console.log(` #${s.idx} (${s.length}b, attrs="${s.attrs}") :: ${head}`);
}

// 각 JS 스크립트를 격리 실행하여 SyntaxError 발생 지점을 찾는다.
(async () => {
  const browser = await chromium.launch();

  for (const s of jsOnly) {
    const page = await browser.newPage();
    let pageErr = null;
    page.on('pageerror', e => { pageErr = e.message; });

    // 빈 페이지에 새 <script> 하나만 주입
    await page.setContent(`<!doctype html><html><body><div id="t"></div></body></html>`);
    try {
      await page.addScriptTag({ content: s.body });
    } catch (e) {
      pageErr = (pageErr || '') + ' addScriptTag: ' + e.message;
    }
    await page.waitForTimeout(50);
    if (pageErr) {
      console.log(`✗ #${s.idx} (${s.length}b) ERROR:`, pageErr);
      // 더 좁혀보기: 본문의 앞 N문자에 에러가 있는지 절반탐색
      const halves = [s.body.slice(0, s.body.length>>1), s.body.slice(s.body.length>>1)];
      for (let i = 0; i < 2; i++) {
        const sub = halves[i];
        const p2 = await browser.newPage();
        let e2 = null;
        p2.on('pageerror', e => { e2 = e.message; });
        await p2.setContent(`<!doctype html><html><body></body></html>`);
        try { await p2.addScriptTag({ content: sub }); } catch(e){ e2 = e.message; }
        await p2.waitForTimeout(30);
        console.log(`   ${i===0 ? '전반' : '후반'} ${sub.length}b: ${e2 || 'OK'}`);
        await p2.close();
      }
    } else {
      console.log(`✓ #${s.idx} (${s.length}b) OK`);
    }
    await page.close();
  }

  await browser.close();
})();
