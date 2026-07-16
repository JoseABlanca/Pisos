const fs = require('fs');
let txt = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');
const lines = txt.split('\n');
let start = 4554;
let brackets = 0;
let end = -1;
for(let i=start; i<lines.length; i++) {
  if (lines[i].includes('{')) brackets += (lines[i].match(/\{/g) || []).length;
  if (lines[i].includes('}')) brackets -= (lines[i].match(/\}/g) || []).length;
  
  if (brackets === 0 && i > start) {
    end = i;
    break;
  }
}
console.log("End line:", end);
console.log(lines.slice(end - 2, end + 2).join('\n'));
