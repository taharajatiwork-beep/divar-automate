const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.default.connect({ browserURL: 'http://127.0.0.1:9222' });
  const pages = await browser.pages();
  const page = pages.find(p => p.url().includes('divar.ir')) || pages[0];
  console.log('URL:', page.url());

  // Get button coordinates for the location field (index 4)
  const rect = await page.evaluate(() => {
    const btn = document.querySelectorAll('button')[4];
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, text: btn.textContent.trim().substring(0, 30) };
  });
  console.log('Button:', JSON.stringify(rect));

  // CDP trusted click
  const cdp = await page.target().createCDPSession();
  console.log('CDP clicking at', rect.x, rect.y);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  console.log('Clicked! Waiting 3s...');
  await new Promise(r => setTimeout(r, 3000));

  // Check for search input
  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input')).filter(i => {
      const r = i.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }).map(i => ({
      placeholder: i.placeholder.substring(0, 60),
      id: i.id,
      type: i.type,
      rect: { x: Math.round(i.getBoundingClientRect().x), y: Math.round(i.getBoundingClientRect().y) },
    }));
  });
  console.log('Visible inputs:', JSON.stringify(inputs, null, 2));

  // Check for جستجو text
  const searchText = await page.evaluate(() => {
    const all = document.body.innerText;
    const idx = all.indexOf('جستجو');
    if (idx >= 0) return all.substring(Math.max(0, idx - 30), idx + 60);
    return 'جستجو not found';
  });
  console.log('Search text:', searchText);

  cdp.detach();
  browser.disconnect();
})().catch(e => console.error('ERROR:', e.message));
