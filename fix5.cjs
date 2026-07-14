const fs = require('fs');
let file = fs.readFileSync('src/pages/Analitica.jsx', 'utf8');

file = file.replace(
  "const expenseFlag = b.isExpense !== undefined ? b.isExpense : (code.startsWith('6') || code.startsWith('8'));\n          const mult = expenseFlag ? -1 : 1;\n            net = net * mult;",
  "const mult = (code.startsWith('6') || code.startsWith('8')) ? -1 : 1;\n            net = net * mult;"
);

fs.writeFileSync('src/pages/Analitica.jsx', file);
console.log('Done!');
