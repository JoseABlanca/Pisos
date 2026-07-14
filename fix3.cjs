const fs = require('fs');
let file = fs.readFileSync('src/pages/Analitica.jsx', 'utf8');

file = file.replace(
  "  const fmt = v => v === 0 ? '' : (v || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });",
  "  const cleanZero = n => Math.abs(n) < 0.005 ? 0 : n;\n  const fmt = v => v === 0 ? '' : (v || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });"
);

fs.writeFileSync('src/pages/Analitica.jsx', file);
console.log('Done!');
