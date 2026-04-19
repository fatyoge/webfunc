const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launchPersistentContext('C:/temp/chrome-dev', {
    headless: false,
    viewport: { width: 1280, height: 800 },
  });
  const page = await browser.newPage();

  let hotData = null;
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('zhihu.com/api') && response.status() === 200) {
      try {
        const contentType = response.headers()['content-type'] || '';
        if (contentType.includes('json')) {
          const data = await response.json();
          // Look for arrays with many items that have 'target' field (content items)
          if (data.data && Array.isArray(data.data) && data.data.length > 10 && data.data[0]?.target) {
            hotData = data;
            console.log('Found hot data from:', url);
            console.log('Items:', data.data.length);
          }
        }
      } catch (e) {}
    }
  });

  console.log('Navigating to /hot...');
  await page.goto('https://www.zhihu.com/hot', { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);

  if (hotData) {
    console.log('\n=== Hot List Data Keys ===');
    console.log(Object.keys(hotData.data[0]));
    console.log('\nFirst item target keys:', Object.keys(hotData.data[0].target));
    console.log('First item title:', hotData.data[0].target?.title);
    console.log('First item excerpt:', (hotData.data[0].target?.excerpt || '').slice(0, 100));
    console.log('First item detail:', JSON.stringify(hotData.data[0].detail_text));
  } else {
    console.log('No hot data found via API interception');
    // Try to find it in page scripts
    const scripts = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('script'))
        .filter(s => s.type === 'text/json' || s.id?.includes('initial'))
        .map(s => ({ id: s.id, type: s.type, len: s.textContent.length }));
    });
    console.log('Scripts found:', scripts);
  }

  console.log('\nClosing in 3s...');
  await page.waitForTimeout(3000);
  await browser.close();
})();
