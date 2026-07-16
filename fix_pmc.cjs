const fs = require('fs');
let content = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

content = content.replace(
  /if \(col.id === 'avgPrice'\) return <td key=\{col.id\} className="py-2 px-1 text-right font-sans tracking-normal">\{\(h.avgPrice \|\| 0\).toFixed\(2\)\}<\/td>;/g,
  "if (col.id === 'pmc') return <td key={col.id} className=\"py-2 px-1 text-right font-sans tracking-normal\">{(h.pmc || 0).toFixed(2)}</td>;"
);

content = content.replace(
  /if \(\['avgPrice', 'currentPrice', 'brokerId'\]\.includes\(col\.id\)\) width = 'w-20';/g,
  "if (['pmc', 'currentPrice', 'brokerId'].includes(col.id)) width = 'w-20';"
);

content = content.replace(
  /if \(\['quantity', 'avgPrice', 'currentPrice', 'totalCost', 'currentValue', 'pnl'\]\.includes\(col\.id\)\) align = 'text-right';/g,
  "if (['quantity', 'pmc', 'currentPrice', 'totalCost', 'currentValue', 'pnl'].includes(col.id)) align = 'text-right';"
);

fs.writeFileSync('src/pages/PrintPage.jsx', content, 'utf8');
console.log("Fixed PMC");
