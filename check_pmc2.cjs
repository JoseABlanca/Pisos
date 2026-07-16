const fs = require('fs');
const txt = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');
const lines = txt.split('\n');
lines.forEach((l, i) => {
  if (l.includes('avgPrice')) {
    console.log(i + ': ' + l.trim());
  }
});
