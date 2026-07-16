const fs = require('fs');
let txt = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');
const lines = txt.split('\n');

const startTarget = "} if (rvChartTypes.includes('evolucion')) {";

let start = -1;
let end = -1;
for(let i=0; i<lines.length; i++) {
  if (lines[i].includes(startTarget)) {
    start = i;
  }
  if (start > -1 && i > start && lines[i].includes('// Agrupación')) {
    end = i - 2;
    break;
  }
}

if (start > -1 && end > -1) {
  lines.splice(start, end - start + 1, '      }');
  fs.writeFileSync('src/pages/PrintPage.jsx', lines.join('\n'), 'utf8');
  console.log('Evolucion block removed!');
} else {
  console.log('Not found');
}
