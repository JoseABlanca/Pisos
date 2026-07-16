const fs = require('fs');
let content = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

// The rv_transactions toFixed(4)
content = content.replace(
  /if \(col.id === 'quantity'\) return <td key=\{col.id\} className="py-0.5 px-1 text-right font-sans tabular-nums">\{\(tx.qty \|\| 0\).toFixed\(4\)\}<\/td>;/g,
  'if (col.id === "quantity") return <td key={col.id} className="py-0.5 px-1 text-right font-sans tabular-nums">{(tx.qty || 0).toFixed(2)}</td>;'
);

content = content.replace(
  /if \(col.id === 'quantity'\) return <td key=\{col.id\} className="py-2 px-1 text-right font-sans tabular-nums">\{\(tx.qty \|\| 0\).toFixed\(4\)\}<\/td>;/g,
  'if (col.id === "quantity") return <td key={col.id} className="py-2 px-1 text-right font-sans tabular-nums">{(tx.qty || 0).toFixed(2)}</td>;'
);

// Any other tabular-nums that could cause slashed zero? The user already saw "0 con la linea en medio".
// Let's replace 'tabular-nums' entirely with 'tracking-normal' to prevent slashed zero if it's the default font feature!
content = content.replace(/tabular-nums/g, 'tracking-normal');

fs.writeFileSync('src/pages/PrintPage.jsx', content, 'utf8');
console.log("Fixed qty to 2 digits and removed tabular-nums to fix slashed zero");
