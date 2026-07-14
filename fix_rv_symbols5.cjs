const fs = require('fs');
let content = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

// We will use a function to replace the strings
content = content.replace(/<span className="text-slate-500 font-bold block uppercase text-\[8px\]">Inversi[\s\S]*?<\/span>\n\s*<span className="font-sans tabular-nums font-bold text-slate-800 text-\[12px\]">\{formatCurrency\(sum\.totalCost\)\}[\s\S]*?<\/span>/, 
  '<span className="text-slate-500 font-bold block uppercase text-[8px]">Inversión Total</span>\n                      <span className="font-sans tabular-nums font-bold text-slate-800 text-[12px]">{formatCurrency(sum.totalCost)} €</span>');

content = content.replace(/<span className="text-slate-500 font-bold block uppercase text-\[8px\]">Valor de Mercado<\/span>\n\s*<span className="font-sans tabular-nums font-bold text-slate-800 text-\[12px\]">\{formatCurrency\(sum\.totalValue\)\}[\s\S]*?<\/span>/, 
  '<span className="text-slate-500 font-bold block uppercase text-[8px]">Valor de Mercado</span>\n                      <span className="font-sans tabular-nums font-bold text-slate-800 text-[12px]">{formatCurrency(sum.totalValue)} €</span>');

content = content.replace(/\{formatCurrency\(sum\.pnl\)\}[\s\S]*?\(/, 
  '{formatCurrency(sum.pnl)} € (');

content = content.replace(/<span className="text-slate-500 font-bold block uppercase text-\[8px\]">Dividendos Cobrados<\/span>\n\s*<span className="font-sans tabular-nums font-bold text-slate-800 text-\[12px\]">\{formatCurrency\(sum\.dividends\)\}[\s\S]*?<\/span>/, 
  '<span className="text-slate-500 font-bold block uppercase text-[8px]">Dividendos Cobrados</span>\n                      <span className="font-sans tabular-nums font-bold text-slate-800 text-[12px]">{formatCurrency(sum.dividends)} €</span>');

content = content.replace(/<span className="text-slate-500 font-bold block uppercase text-\[8px\]">Efectivo en Brokers<\/span>\n\s*<span className="font-sans tabular-nums font-bold text-slate-800 text-\[12px\]">\{formatCurrency\(sum\.cash\)\}[\s\S]*?<\/span>/, 
  '<span className="text-slate-500 font-bold block uppercase text-[8px]">Efectivo en Brokers</span>\n                      <span className="font-sans tabular-nums font-bold text-slate-800 text-[12px]">{formatCurrency(sum.cash)} €</span>');

content = content.replace(/<span className="text-slate-500 font-bold block uppercase text-\[8px\]">Total Cartera<\/span>\n\s*<span className="font-sans tabular-nums font-bold text-slate-800 text-\[12px\] bg-yellow-300 px-1 py-0\.5 rounded">\{formatCurrency\(sum\.grandTotal\)\}[\s\S]*?<\/span>/, 
  '<span className="text-slate-500 font-bold block uppercase text-[8px]">Total Cartera</span>\n                      <span className="font-sans tabular-nums font-bold text-slate-800 text-[12px] bg-yellow-300 px-1 py-0.5 rounded">{formatCurrency(sum.grandTotal)} €</span>');

fs.writeFileSync('src/pages/PrintPage.jsx', content, 'utf8');
console.log('Fixed symbols step 5 using multi-line regex');
