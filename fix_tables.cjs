const fs = require('fs');
let content = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

// 1. Change quantity toFixed(4) to toFixed(2) in rv_portfolio
content = content.replace(
  /if \(col\.id === 'quantity'\) return <td key=\{col\.id\} className="py-2 px-1 text-right font-sans tabular-nums">\{\(h\.quantity \|\| 0\)\.toFixed\(4\)\}<\/td>;/g,
  "if (col.id === 'quantity') return <td key={col.id} className=\"py-2 px-1 text-right font-sans tabular-nums\">{(h.quantity || 0).toFixed(2)}</td>;"
);

// 2. Remove slashed-zero class from index.css or search PrintPage for specific font
// The user says "quiero que en transacciones me quites esos colores de las letas"
// This refers to `rv_transactions` probably. Let's find rv_transactions rendering:
// In rv_transactions, tx type (Compra/Venta/Dividendo) might have text colors?
// Let's remove text-red-700 / text-green-700 / text-blue-700 from rv_transactions if any
content = content.replace(
  /className=\{`py-1\.5 px-1 font-bold \$\{tx\.type === 'Compra' \? 'text-blue-700' : tx\.type === 'Venta' \? 'text-orange-700' : 'text-green-700'\}`\}/g,
  "className=\"py-1.5 px-1 font-bold text-slate-700\""
);

content = content.replace(
  /className=\{`py-1\.5 px-1 font-bold font-sans tabular-nums \$\{tx\.type === 'Compra' \? 'text-blue-700' : tx\.type === 'Venta' \? 'text-orange-700' : 'text-green-700'\}`\}/g,
  "className=\"py-1.5 px-1 font-bold font-sans tabular-nums text-slate-800\""
);

// Font with slashed zero: `font-mono` is usually the culprit for slashed zero.
content = content.replace(/font-mono/g, 'font-sans');

fs.writeFileSync('src/pages/PrintPage.jsx', content, 'utf8');
console.log("Fixed tables");
