const fs = require('fs');
let content = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

// We need to safely access toFixed for h.quantity, h.avgPrice, h.currentPrice, h.pnlPercent, sum.pnlPercent in rv_portfolio
content = content.replace(/h\.quantity\.toFixed/g, "(h.quantity || 0).toFixed");
content = content.replace(/h\.avgPrice\.toFixed/g, "(h.avgPrice || 0).toFixed");
content = content.replace(/h\.currentPrice\.toFixed/g, "(h.currentPrice || 0).toFixed");
content = content.replace(/h\.pnlPercent\.toFixed/g, "(h.pnlPercent || 0).toFixed");
content = content.replace(/sum\.pnlPercent\.toFixed/g, "(sum.pnlPercent || 0).toFixed");

fs.writeFileSync('src/pages/PrintPage.jsx', content);
console.log('Fixed toFixed references');
