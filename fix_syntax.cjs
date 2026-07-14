const fs = require('fs');
let content = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

content = content.replace(/€\/td>/g, '€</td>');

fs.writeFileSync('src/pages/PrintPage.jsx', content, 'utf8');
console.log('Fixed syntax error');
