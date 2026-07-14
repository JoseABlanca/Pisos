const fs = require('fs');
let content = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

const replacement = `    // 8. TRANSACCIONES DE RENTA VARIABLE
    if (selectedTemplate === 'rv_transactions') {
      const txsWithAmounts = rvTransactions.map(tx => {
        const qty = parseFloat(tx.quantity) || 0;
        const price = parseFloat(tx.price) || 0;
        const fee = parseFloat(tx.fee) || 0;
        const rate = parseFloat(tx.exchangeRate) || 1.0;
        let totalAmountEUR = 0;
        if (tx.type === 'Dividendo') totalAmountEUR = (qty * price - fee) / rate;
        else if (tx.type === 'Compra') totalAmountEUR = (qty * price + fee) / rate;
        else totalAmountEUR = (qty * price - fee) / rate;
        return { ...tx, totalAmountEUR, qty, price, fee, rate };
      });

      let filteredTx = [...txsWithAmounts];`;

content = content.replace(/    \/\/ 8\. TRANSACCIONES DE RENTA VARIABLE\s*if \(selectedTemplate === 'rv_transactions'\) \{\s*let filteredTx = \[\.\.\.txsWithAmounts\];/g, replacement);

fs.writeFileSync('src/pages/PrintPage.jsx', content);
console.log('Restored txsWithAmounts');
