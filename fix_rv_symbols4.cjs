const fs = require('fs');
let content = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

// Replace using dot to match the corrupted character
content = content.replace(/\{formatCurrency\(sum\.totalCost\)\}\s*./g, '{formatCurrency(sum.totalCost)} €');
content = content.replace(/\{formatCurrency\(sum\.totalValue\)\}\s*./g, '{formatCurrency(sum.totalValue)} €');
content = content.replace(/\{formatCurrency\(sum\.pnl\)\}\s*./g, '{formatCurrency(sum.pnl)} €');
content = content.replace(/\{formatCurrency\(sum\.dividends\)\}\s*./g, '{formatCurrency(sum.dividends)} €');
content = content.replace(/\{formatCurrency\(sum\.cash\)\}\s*./g, '{formatCurrency(sum.cash)} €');
content = content.replace(/\{formatCurrency\(sum\.grandTotal\)\}\s*./g, '{formatCurrency(sum.grandTotal)} €');

// Inversi...n Total
content = content.replace(/Inversi.n Total/g, 'Inversión Total');

// Also for CF
content = content.replace(/\{formatCurrency\(sum\.totalInvested\)\}\s*./g, '{formatCurrency(sum.totalInvested)} €');
content = content.replace(/\{formatCurrency\(sum\.totalCurrentValueNet\)\}\s*./g, '{formatCurrency(sum.totalCurrentValueNet)} €');
content = content.replace(/\{formatCurrency\(sum\.totalReturnNet\)\}\s*./g, '{formatCurrency(sum.totalReturnNet)} €');

fs.writeFileSync('src/pages/PrintPage.jsx', content, 'utf8');
console.log('Fixed symbols step 4 using dot regex');
