const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.default.connect({ browserURL: 'http://127.0.0.1:9222' });
  const pages = await browser.pages();
  const page = pages.find(p => p.url().includes('divar.ir')) || pages[0];
  console.log('URL:', page.url());
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // Close any open modal first
  console.log('Closing any open modal...');
  const closeBtn = await page.evaluate(() => {
    const btns = document.querySelectorAll('button, [role="button"]');
    for (const b of btns) {
      if (b.textContent.includes('\u0627\u0646\u0635\u0631\u0627\u0641')) {
        b.click();
        return 'clicked enseraf';
      }
    }
    // Also try clicking X button
    for (const b of btns) {
      const r = b.getBoundingClientRect();
      if (r.x < 50 && r.y < 50 && r.width < 50) {
        b.click();
        return 'clicked X';
      }
    }
    return 'no modal to close';
  });
  console.log(closeBtn);
  await sleep(2000);

  // Now test selectLocation manually step by step
  const cityName = '\u062a\u0647\u0631\u0627\u0646'; // تهران
  console.log('\n=== Testing selectLocation for:', cityName);

  // Step 1: Find location button
  console.log('\n--- Step 1: Find location button');
  const actionButtons = await page.$$('button.kt-action-field');
  console.log('Found', actionButtons.length, 'action-field buttons');

  let targetBtn = null;
  for (let i = 0; i < actionButtons.length; i++) {
    const text = await page.evaluate(e => (e.textContent || '').trim(), actionButtons[i]);
    if (text !== '\u0627\u0646\u062a\u062e\u0627\u0628') continue; // انتخاب

    const hasMakan = await page.evaluate(e => {
      let el = e;
      for (let j = 0; j < 5; j++) {
        el = el.parentElement;
        if (!el) return false;
        if (el.textContent.includes('\u0645\u06a9\u0627\u0646')) return true; // مکان
      }
      return false;
    }, actionButtons[i]);
    console.log('  button[' + i + ']: hasMakan=' + hasMakan);
    if (hasMakan) { targetBtn = actionButtons[i]; break; }
  }

  if (!targetBtn) {
    console.log('ERROR: Location button not found!');
    browser.disconnect();
    return;
  }

  // Step 2: CDP click
  console.log('\n--- Step 2: CDP click');
  const rect = await page.evaluate(el => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, targetBtn);
  console.log('Click at:', rect);

  const cdp = await page.target().createCDPSession();
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  console.log('CDP click sent');
  await sleep(3000);

  // Step 3: Find search input
  console.log('\n--- Step 3: Find search input');
  const searchInput = await page.$('input[placeholder*="\u062c\u0633\u062a\u062c\u0648"]');
  if (!searchInput) {
    console.log('ERROR: Search input NOT found!');
    // List all visible inputs
    const allInputs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input')).filter(i => {
        const r = i.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }).map(i => i.placeholder + ' | ' + i.id);
    });
    console.log('Visible inputs:', allInputs);
    browser.disconnect();
    return;
  }
  console.log('Search input found!');

  // Step 4: Type city name
  console.log('\n--- Step 4: Type city name');
  await searchInput.click();
  await sleep(100);
  await page.keyboard.down('Control');
  await page.keyboard.press('a');
  await page.keyboard.up('Control');
  await sleep(50);
  await page.keyboard.press('Backspace');
  await sleep(100);
  await searchInput.type(cityName, { delay: 50 });
  console.log('Typed:', cityName);
  await sleep(2000);

  // Step 5: Check search results
  console.log('\n--- Step 5: Search results');
  const results = await page.evaluate(() => {
    const rows = document.querySelectorAll('.kt-modal .kt-base-row, .kt-modal [role="option"], .kt-modal [class*="result"]');
    return Array.from(rows).map(r => ({
      text: r.textContent.trim().substring(0, 50),
      visible: r.getBoundingClientRect().width > 0,
      rect: {
        x: Math.round(r.getBoundingClientRect().x),
        y: Math.round(r.getBoundingClientRect().y),
      }
    }));
  });
  console.log('Results:', JSON.stringify(results, null, 2));

  // Step 6: Screenshot
  await page.screenshot({ path: 'C:/taha/projects/divar/scripts/debug-location-step5.png' });
  console.log('\nScreenshot saved: debug-location-step5.png');

  cdp.detach();
  browser.disconnect();
})().catch(e => console.error('ERROR:', e.message));
