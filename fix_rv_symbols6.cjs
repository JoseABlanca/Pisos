const fs = require('fs');
let content = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

function fixCurrencySymbol(strToFind) {
  let parts = content.split(strToFind);
  for (let i = 1; i < parts.length; i++) {
    // The part starts with " </span>" or " ?</span>"
    // We want to remove the space and the corrupted character
    // Let's just use regex on the beginning of the string part!
    parts[i] = parts[i].replace(/^[\s\S]*?<\/span>/, ' €</span>');
  }
  content = parts.join(strToFind);
}

fixCurrencySymbol('{formatCurrency(sum.totalCost)}');
fixCurrencySymbol('{formatCurrency(sum.totalValue)}');
fixCurrencySymbol('{formatCurrency(sum.pnl)}');
fixCurrencySymbol('{formatCurrency(sum.dividends)}');
fixCurrencySymbol('{formatCurrency(sum.cash)}');
fixCurrencySymbol('{formatCurrency(sum.grandTotal)}');

content = content.replace(/Inversi\xEF\xBF\xBDn Total/g, 'Inversión Total');

fs.writeFileSync('src/pages/PrintPage.jsx', content, 'utf8');
console.log('Fixed symbols step 6 using split and regex on remainder');
