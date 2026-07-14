const fs = require('fs');
let content = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

// Replace any €/td> with €</td>
content = content.replace(/€\/td>/g, '€</td>');
// Also fallback if it's corrupted in this script
content = content.replace(/\uFFFD\/td>/g, '€</td>');
// Also if there's any other character
content = content.replace(/([^\<])\/td>/g, '$1</td>');

fs.writeFileSync('src/pages/PrintPage.jsx', content, 'utf8');
console.log('Fixed syntax error step 2');
