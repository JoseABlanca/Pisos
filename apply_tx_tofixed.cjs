const fs = require('fs');
let content = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

// Safeguard all toFixed calls that might be causing crashes in PrintPage.jsx

// rv_transactions
content = content.replace(/tx\.qty\.toFixed/g, "(tx.qty || 0).toFixed");
content = content.replace(/tx\.price\.toFixed/g, "(tx.price || 0).toFixed");
content = content.replace(/tx\.fee\.toFixed/g, "(tx.fee || 0).toFixed");

// taxes_rv (just in case)
content = content.replace(/r\.qty\.toFixed/g, "(r.qty || 0).toFixed");
content = content.replace(/r\.rate\.toFixed/g, "(r.rate || 0).toFixed");

// sum.avgReturnNet
content = content.replace(/sum\.avgReturnNet\.toFixed/g, "(sum.avgReturnNet || 0).toFixed");
// r.yieldNet
content = content.replace(/r\.yieldNet\.toFixed/g, "(r.yieldNet || 0).toFixed");

fs.writeFileSync('src/pages/PrintPage.jsx', content);
console.log('Fixed additional toFixed references');
