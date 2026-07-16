const fs = require('fs');
const lines = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8').split('\n');
const start = lines.findIndex((l) => l.includes("if (rvChartType !== 'none') {"));
if(start > -1) { console.log(lines.slice(start, start+50).join('\n')); }
