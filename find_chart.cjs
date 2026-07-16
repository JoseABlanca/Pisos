const fs = require('fs');
let txt = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');
const lines = txt.split('\n');

let start = -1;
let end = -1;
for(let i=0; i<lines.length; i++) {
  if (lines[i].includes("if (rvChartTypes.includes('evolucion')) {")) {
    start = i;
  }
}
console.log("Start line:", start);
console.log(lines.slice(start - 2, start + 30).join('\n'));
