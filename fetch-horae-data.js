const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launchPersistentContext('C:/temp/chrome-dev', {
    headless: false,
    viewport: { width: 1400, height: 900 },
  });
  const page = await browser.newPage();

  let queryResponse = null;
  let queryResponseBody = null;

  // Intercept the query response
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/Hive/task/runTask') && response.request().method() === 'POST') {
      queryResponse = {
        url,
        status: response.status(),
        contentType: response.headers()['content-type'],
      };
      try {
        queryResponseBody = await response.text();
      } catch (e) {
        queryResponseBody = '[无法读取响应体]';
      }
    }
  });

  console.log('Step 1: 访问任务列表页面...');
  await page.goto('http://horae.gf.com.cn/Hive//task/list', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Check if redirected to login
  const currentUrl = page.url();
  if (currentUrl.includes('login')) {
    console.log('\n❌ Session 已过期，需要重新登录！');
    console.log('请在弹出的浏览器窗口中完成登录，然后重新运行此脚本。');
    console.log('当前页面:', currentUrl);

    // Wait for manual login
    console.log('等待手动登录（最长 60 秒）...');
    try {
      await page.waitForURL(/task\/list|main\/index/, { timeout: 60000 });
      console.log('登录成功！继续执行...');
    } catch {
      console.log('登录超时，请重新运行脚本。');
      await browser.close();
      process.exit(1);
    }
  }

  console.log('Step 2: 访问 runTask 页面...');
  await page.goto('http://horae.gf.com.cn/Hive/task/runTask.do', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  console.log('Step 3: 填写查询条件并提交...');

  // Try to fill the form if elements exist
  try {
    // Look for form fields
    const fields = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, select'));
      return inputs.map(i => ({
        name: i.name,
        id: i.id,
        type: i.type || i.tagName.toLowerCase(),
        value: i.value,
      }));
    });
    console.log('页面上的表单字段:', JSON.stringify(fields, null, 2));

    // Fill in_charge if field exists
    const inChargeField = await page.locator('input[name="in_charge"], #in_charge, [name*="charge"]').first();
    if (await inChargeField.count() > 0) {
      await inChargeField.fill('ouruibin');
      console.log('已填写负责人: ouruibin');
    }

    // Fill state if field exists
    const stateField = await page.locator('select[name="state"], #state, [name*="state"]').first();
    if (await stateField.count() > 0) {
      await stateField.selectOption('3');
      console.log('已选择状态: 3 (失败)');
    }

    // Fill date range
    const startDate = await page.locator('input[name="last_update_start"], #last_update_start').first();
    if (await startDate.count() > 0) {
      await startDate.fill('2026-03-19');
    }

    const endDate = await page.locator('input[name="last_update_end"], #last_update_end').first();
    if (await endDate.count() > 0) {
      await endDate.fill('2026-04-20');
    }

    // Click submit button
    const submitBtn = await page.locator('button[type="submit"], input[type="submit"], .btn-primary, [onclick*="submit"]').first();
    if (await submitBtn.count() > 0) {
      console.log('点击提交按钮...');
      await submitBtn.click();
      await page.waitForTimeout(3000);
    } else {
      // Direct POST via page.evaluate
      console.log('未找到提交按钮，尝试直接提交表单...');
      await page.evaluate(() => {
        const form = document.querySelector('form');
        if (form) form.submit();
      });
      await page.waitForTimeout(3000);
    }
  } catch (err) {
    console.log('表单操作出错:', err.message);
  }

  console.log('\n=== 查询响应 ===');
  if (queryResponse) {
    console.log('URL:', queryResponse.url);
    console.log('Status:', queryResponse.status);
    console.log('Content-Type:', queryResponse.contentType);
    console.log('\n响应体 (前 3000 字符):');
    console.log(queryResponseBody?.slice(0, 3000));

    // Save full response
    const fs = require('fs');
    fs.writeFileSync('horae-query-response.html', queryResponseBody);
    console.log('\n完整响应已保存到 horae-query-response.html');

    // Try to extract task data
    if (queryResponseBody && queryResponseBody.includes('<table')) {
      console.log('\n检测到表格数据，尝试提取...');
      const tableData = await page.evaluate(() => {
        const tables = document.querySelectorAll('table');
        const results = [];
        for (const table of tables) {
          const rows = table.querySelectorAll('tr');
          if (rows.length > 1) {
            const headers = Array.from(rows[0].querySelectorAll('th, td')).map(c => c.textContent.trim());
            const data = [];
            for (let i = 1; i < rows.length; i++) {
              const cells = Array.from(rows[i].querySelectorAll('td'));
              if (cells.length > 0) {
                const row = {};
                cells.forEach((cell, idx) => {
                  row[headers[idx] || `col${idx}`] = cell.textContent.trim();
                });
                data.push(row);
              }
            }
            results.push({ headers, data: data.slice(0, 10) }); // First 10 rows
          }
        }
        return results;
      });

      if (tableData.length > 0) {
        console.log('\n提取到的表格数据:');
        console.log(JSON.stringify(tableData, null, 2).slice(0, 2000));
      }
    }
  } else {
    console.log('未拦截到查询响应');
    console.log('当前页面 URL:', page.url());
    console.log('页面标题:', await page.title());
  }

  console.log('\n关闭浏览器...');
  await browser.close();
})();
