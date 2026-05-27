// 챕터 2 세번째 실습(ex-02-03) — 4 인스턴스를 2 클래스로 N:1 매칭하는 시나리오에서
// 한 클래스가 여러 인스턴스에 재사용되어 100% 정답이 인정되는지 검증.
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  const distPath = 'file://' + path.resolve(__dirname, '../../docs/index.html');
  await page.goto(distPath);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__loadChapter && window.__loadChapter('ch02'));
  await page.waitForTimeout(800);

  // ex-02-03 카드 영역 찾기 — 세 번째 .matching-area
  const result = await page.evaluate(async () => {
    const areas = document.querySelectorAll('.matching-area');
    if (!areas.length) return { error: 'matching-area not found' };
    const ex = areas[0].closest('.exercise');
    // ex-02-03을 정확히 찍기 위해 id 확인
    const allExs = Array.from(document.querySelectorAll('.exercise-card'));
    const target = allExs.find((e) => e.getAttribute('data-ex-id') === 'ex-02-03')
                || allExs.find((e) => e.querySelector('.matching-area'));
    if (!target) return { error: 'ex-02-03 element not found' };
    const area = target.querySelector('.matching-area');
    const cols = area.querySelectorAll('.match-col');
    const leftCards = cols[0].querySelectorAll('.match-card');
    const rightCards = cols[1].querySelectorAll('.match-card');
    return {
      leftLabels: Array.from(leftCards).map((c) => ({ id: c.dataset.id, text: c.textContent })),
      rightLabels: Array.from(rightCards).map((c) => ({ id: c.dataset.id, text: c.textContent }))
    };
  });
  console.log('초기 상태:', JSON.stringify(result, null, 2));

  // 매칭: 피카츄, 라이츄, 피츄 → 전기타입 / 이브이 → 노말타입
  // UI 인덱스로 표현: 왼쪽 0,1,2 → 오른쪽 0(전기), 왼쪽 3 → 오른쪽 1(노말)
  async function match(leftIdx, rightIdx) {
    await page.evaluate(({ li, ri }) => {
      const target = Array.from(document.querySelectorAll('.exercise-card'))
        .find((e) => e.querySelector('.matching-area'));
      const cols = target.querySelectorAll('.match-col');
      const leftCards = cols[0].querySelectorAll('.match-card');
      const rightCards = cols[1].querySelectorAll('.match-card');
      leftCards[li].click();
      rightCards[ri].click();
    }, { li: leftIdx, ri: rightIdx });
    await page.waitForTimeout(150);
  }
  await match(0, 0); // 피카츄 → 전기타입
  await match(1, 0); // 라이츄 → 전기타입
  await match(2, 0); // 피츄 → 전기타입
  await match(3, 1); // 이브이 → 노말타입

  // 상태 확인
  const state = await page.evaluate(() => {
    const target = Array.from(document.querySelectorAll('.exercise-card'))
      .find((e) => e.querySelector('.matching-area'));
    const cols = target.querySelectorAll('.match-col');
    const leftCards = cols[0].querySelectorAll('.match-card');
    const rightCards = cols[1].querySelectorAll('.match-card');
    return {
      left: Array.from(leftCards).map((c) => c.textContent),
      right: Array.from(rightCards).map((c) => c.textContent)
    };
  });
  console.log('매칭 후:', JSON.stringify(state, null, 2));

  // 제출 버튼 클릭
  const submitResult = await page.evaluate(async () => {
    const target = Array.from(document.querySelectorAll('.exercise-card'))
      .find((e) => e.querySelector('.matching-area'));
    const btn = target.querySelector('button.submit, .exercise-submit, button[data-action="submit"]')
              || Array.from(target.querySelectorAll('button')).find((b) => /제출|확인/.test(b.textContent));
    if (!btn) return { error: 'submit button not found', buttons: Array.from(target.querySelectorAll('button')).map((b) => b.textContent) };
    btn.click();
    return { clicked: btn.textContent };
  });
  console.log('제출:', JSON.stringify(submitResult));
  await page.waitForTimeout(500);

  const feedback = await page.evaluate(() => {
    const target = Array.from(document.querySelectorAll('.exercise-card'))
      .find((e) => e.querySelector('.matching-area'));
    const fb = target.querySelector('.exercise-feedback, .feedback, .result');
    return fb ? { text: fb.textContent, classes: fb.className } : null;
  });
  console.log('피드백:', JSON.stringify(feedback));

  console.log('pageerrors:', errors.length, errors);
  await browser.close();

  const passed = feedback && /정답|정확|100|성공/.test(feedback.text);
  if (!passed) {
    console.log('\n❌ 100% 정답 인정 안 됨');
    process.exit(1);
  }
  console.log('\n✅ N:1 매칭 정상 작동 (100% 정답 인정)');
})();
