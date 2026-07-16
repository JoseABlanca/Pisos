const fs = require('fs');
const lines = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8').split('\n');
const start = lines.findIndex(l => l.includes('col.id === \'type\''));
if(start > -1) { console.log(lines.slice(start-2, start+25).join('\n')); }
