const fs = require('fs');
const lines = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8').split('\n');
lines.forEach((l, i) => {
  if (l.includes("pageViews.push(")) {
    console.log(i + ': ' + l.trim());
  }
});
