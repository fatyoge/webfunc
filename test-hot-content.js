const axios = require('axios');

async function testHotContent() {
  // Use the auth headers captured from the recorded session
  const headers = {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
    'referer': 'https://www.zhihu.com/hot',
    'x-requested-with': 'fetch',
    'x-zse-93': '101_3_3.0',
    'x-zse-96': '2.0_vb9M8+l46ffjWLqiRD5g1ircAod++DL+GbbVq1YUsJSt24POjbkHhB/PVTg7qLkS',
    'sec-ch-ua': '"Chromium";v="147", "Not.A/Brand";v="8"',
    'sec-ch-ua-platform': '"Windows"',
    'sec-ch-ua-mobile': '?0',
  };

  // Test content hotlist with auth headers
  try {
    const res = await axios.get('https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total', { headers });
    console.log('=== /api/v3/feed/topstory/hot-lists/total ===');
    console.log('Status:', res.status);
    if (res.data.data && res.data.data.length > 0) {
      console.log('Items count:', res.data.data.length);
      const first = res.data.data[0];
      console.log('First item keys:', Object.keys(first));
      console.log('First item target:', JSON.stringify(first.target || first, null, 2).slice(0, 500));
    } else {
      console.log('Response:', JSON.stringify(res.data, null, 2).slice(0, 500));
    }
  } catch (err) {
    console.log('Error:', err.response?.status, err.response?.data?.error?.message || err.message);
  }
}

testHotContent();
