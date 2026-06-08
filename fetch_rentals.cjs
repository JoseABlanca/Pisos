const https = require('https');

https.get('https://firestore.googleapis.com/v1/projects/antigravity-finance-95cb5/databases/(default)/documents/rentals?pageSize=2', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log(JSON.stringify(parsed, null, 2));
    } catch(e) {
      console.log(data);
    }
  });
});
