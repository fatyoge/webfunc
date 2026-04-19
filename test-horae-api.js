const axios = require('axios');
const fs = require('fs');

async function testHoraeAPI() {
  // Read cookies from browser profile
  const cookiePath = 'C:/temp/chrome-dev/Default/Network/Cookies';

  // Try to get cookies - we'll use a simple approach
  // since we can't read sqlite3 without extra deps
  console.log('Testing Horae failed tasks API...\n');

  try {
    // Direct POST to the API endpoint
    const res = await axios.post(
      'http://horae.gf.com.cn/Hive/task/runTask',
      'opertype=&task_id=&task_name=&in_charge=ouruibin&topic_name=&task_type=&state=3&last_update_start=2026-03-19&last_update_end=2026-04-20&begin_time_start=&begin_time_end=',
      {
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'origin': 'http://horae.gf.com.cn',
          'referer': 'http://horae.gf.com.cn/Hive/task/runTask.do',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        // Important: allow redirects and handle cookies
        maxRedirects: 5,
        validateStatus: () => true,
      }
    );

    console.log('Status:', res.status);
    console.log('Content-Type:', res.headers['content-type']);
    console.log('\n=== Response Body (first 2000 chars) ===');
    const bodyStr = typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 2);
    console.log(bodyStr.slice(0, 2000));

    if (bodyStr.length > 2000) {
      console.log('\n... (truncated, total length:', bodyStr.length, ')');
    }

    // Save full response for analysis
    fs.writeFileSync('horae-response.json', bodyStr);
    console.log('\nFull response saved to horae-response.json');
  } catch (err) {
    console.error('Error:', err.message);
    if (err.response) {
      console.error('Response status:', err.response.status);
      console.error('Response headers:', err.response.headers);
    }
  }
}

testHoraeAPI();
