const fs = require('fs');
let file = fs.readFileSync('src/pages/Analitica.jsx', 'utf8');

// 1. openNew
file = file.replace(
  "  const openNew = () => {\n    setFormAccount(null);",
  "  const openNew = () => {\n    setFormAccount(null);\n    setFormIsExpense(false);"
);

// 2. openEdit
file = file.replace(
  "    const acc = rawAccounts.find(a => a.code === bud.accountCode) || { id: bud.accountId, code: bud.accountCode, name: bud.accountName };\n    setFormAccount(acc);\n    setFormMonths({ ...bud.months });",
  "    const acc = rawAccounts.find(a => a.code === bud.accountCode) || { id: bud.accountId, code: bud.accountCode, name: bud.accountName };\n    setFormAccount(acc);\n    setFormIsExpense(bud.isExpense !== undefined ? bud.isExpense : (acc.code?.startsWith('6') || acc.code?.startsWith('8')));\n    setFormMonths({ ...bud.months });"
);

// 3. saveBudget
file = file.replace(
  "      cebe: formCebe || '', ceco: formCeco || '',\n      userId: user.uid, updatedAt: new Date().toISOString()",
  "      cebe: formCebe || '', ceco: formCeco || '',\n      isExpense: formIsExpense,\n      userId: user.uid, updatedAt: new Date().toISOString()"
);

// 4. UI Checkbox
file = file.replace(
  "              </div>\n\n              {/* Presupuesto anual + Repartir */}\n              <div className=\"flex items-center gap-[6px]\">",
  "              </div>\n\n              {/* Checkbox Gasto */}\n              <div className=\"flex items-center gap-[6px] pl-[71px]\">\n                <input type=\"checkbox\" id=\"expenseCheck\" checked={formIsExpense} onChange={e => setFormIsExpense(e.target.checked)} className=\"w-[13px] h-[13px] accent-[#4472c4]\" />\n                <label htmlFor=\"expenseCheck\" className=\"text-[12px] text-[#333] font-bold cursor-pointer select-none\">Es un Gasto (restará en los totales)</label>\n              </div>\n\n              {/* Presupuesto anual + Repartir */}\n              <div className=\"flex items-center gap-[6px]\">"
);

fs.writeFileSync('src/pages/Analitica.jsx', file);
console.log('Done!');
