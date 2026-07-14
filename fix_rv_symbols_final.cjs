const fs = require('fs');
let content = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

// Use regex to capture the exact structure and replace the rogue character with the Euro symbol
content = content.replace(/(\{formatCurrency\(sum\.totalCost\)\})\s*./g, '$1 €');
content = content.replace(/(\{formatCurrency\(sum\.totalValue\)\})\s*./g, '$1 €');
content = content.replace(/(\{formatCurrency\(sum\.pnl\)\})\s*./g, '$1 €');
content = content.replace(/(\{formatCurrency\(sum\.dividends\)\})\s*./g, '$1 €');
content = content.replace(/(\{formatCurrency\(sum\.cash\)\})\s*./g, '$1 €');
content = content.replace(/(\{formatCurrency\(sum\.grandTotal\)\})\s*./g, '$1 €');

content = content.replace(/Inversi.n Total/g, 'Inversión Total');

// Check Crowdfunding page too
content = content.replace(/(\{formatCurrency\(sum\.totalInvested\)\})\s*./g, '$1 €');
content = content.replace(/(\{formatCurrency\(sum\.totalCurrentValueNet\)\})\s*./g, '$1 €');
content = content.replace(/(\{formatCurrency\(sum\.totalReturnNet\)\})\s*./g, '$1 €');

fs.writeFileSync('src/pages/PrintPage.jsx', content, 'utf8');
console.log('Fixed symbols step final');
