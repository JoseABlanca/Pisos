const fs = require('fs');
const lines = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8').split('\n');
const idx = lines.findIndex(l => l.includes("rvChartType === 'evolucion'"));
if(idx > -1) { console.log(lines.slice(idx, idx+15).join('\n')); }
