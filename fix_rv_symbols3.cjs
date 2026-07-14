const fs = require('fs');
let content = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

// Replace all instances of \uFFFD in these specific strings
content = content.replace(/\{formatCurrency\(sum\.totalCost\)\}\s*\uFFFD/g, '{formatCurrency(sum.totalCost)} €');
content = content.replace(/\{formatCurrency\(sum\.totalValue\)\}\s*\uFFFD/g, '{formatCurrency(sum.totalValue)} €');
content = content.replace(/\{formatCurrency\(sum\.pnl\)\}\s*\uFFFD/g, '{formatCurrency(sum.pnl)} €');
content = content.replace(/\{formatCurrency\(sum\.dividends\)\}\s*\uFFFD/g, '{formatCurrency(sum.dividends)} €');
content = content.replace(/\{formatCurrency\(sum\.cash\)\}\s*\uFFFD/g, '{formatCurrency(sum.cash)} €');
content = content.replace(/\{formatCurrency\(sum\.grandTotal\)\}\s*\uFFFD/g, '{formatCurrency(sum.grandTotal)} €');
content = content.replace(/Inversi\uFFFDn Total/g, 'Inversión Total');

fs.writeFileSync('src/pages/PrintPage.jsx', content, 'utf8');
console.log('Fixed symbols step 3 using unicode sequence');
