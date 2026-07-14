const fs = require('fs');
let content = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

// The specific block in PrintPage.jsx around line 4520
content = content.replace(/\{formatCurrency\(sum\.totalCost\)\}\s*/g, '{formatCurrency(sum.totalCost)} €');
content = content.replace(/\{formatCurrency\(sum\.totalValue\)\}\s*/g, '{formatCurrency(sum.totalValue)} €');
content = content.replace(/\{formatCurrency\(sum\.pnl\)\}\s*/g, '{formatCurrency(sum.pnl)} €');
content = content.replace(/Inversin Total/g, 'Inversión Total');

content = content.replace(/\{formatCurrency\(sum\.dividends\)\}\s*/g, '{formatCurrency(sum.dividends)} €');
content = content.replace(/\{formatCurrency\(sum\.cash\)\}\s*/g, '{formatCurrency(sum.cash)} €');
content = content.replace(/\{formatCurrency\(sum\.grandTotal\)\}\s*/g, '{formatCurrency(sum.grandTotal)} €');

// It looks like `` was actually a replacement char, let's just also use the literal ``
fs.writeFileSync('src/pages/PrintPage.jsx', content);
console.log('Fixed symbols');
