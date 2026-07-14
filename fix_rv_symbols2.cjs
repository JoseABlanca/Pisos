const fs = require('fs');
let content = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

// The file likely has  (U+FFFD)
content = content.replace(/\{formatCurrency\(sum\.totalCost\)\} /g, '{formatCurrency(sum.totalCost)} €');
content = content.replace(/\{formatCurrency\(sum\.totalValue\)\} /g, '{formatCurrency(sum.totalValue)} €');
content = content.replace(/\{formatCurrency\(sum\.pnl\)\} /g, '{formatCurrency(sum.pnl)} €');
content = content.replace(/Inversin Total/g, 'Inversión Total');

content = content.replace(/\{formatCurrency\(sum\.dividends\)\} /g, '{formatCurrency(sum.dividends)} €');
content = content.replace(/\{formatCurrency\(sum\.cash\)\} /g, '{formatCurrency(sum.cash)} €');
content = content.replace(/\{formatCurrency\(sum\.grandTotal\)\} /g, '{formatCurrency(sum.grandTotal)} €');

// If the literal  doesn't work, maybe we can use string split or something more robust.
// Let's just use string replacement with a very specific string.
content = content.replace('{formatCurrency(sum.totalCost)} ', '{formatCurrency(sum.totalCost)} €');
content = content.replace('{formatCurrency(sum.totalValue)} ', '{formatCurrency(sum.totalValue)} €');
content = content.replace('{formatCurrency(sum.pnl)} ', '{formatCurrency(sum.pnl)} €');
content = content.replace('{formatCurrency(sum.dividends)} ', '{formatCurrency(sum.dividends)} €');
content = content.replace('{formatCurrency(sum.cash)} ', '{formatCurrency(sum.cash)} €');
content = content.replace('{formatCurrency(sum.grandTotal)} ', '{formatCurrency(sum.grandTotal)} €');
content = content.replace('Inversin Total', 'Inversión Total');

fs.writeFileSync('src/pages/PrintPage.jsx', content, 'utf8');
console.log('Fixed symbols step 2');
