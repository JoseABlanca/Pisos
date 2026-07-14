const fs = require('fs');
let file = fs.readFileSync('src/pages/Analitica.jsx', 'utf8');

file = file.replace(
  "  const [formAccount, setFormAccount] = useState(null);",
  "  const [formAccount, setFormAccount] = useState(null);\n  const [formIsExpense, setFormIsExpense] = useState(false);"
);

file = file.replace(
  "  // Auto-fill account when CEBE and CECO are selected based on associations",
  "  // Set isExpense automatically based on selected account group\n  useEffect(() => {\n    if (formAccount && formAccount.code) {\n      setFormIsExpense(formAccount.code.startsWith('6') || formAccount.code.startsWith('8'));\n    }\n  }, [formAccount]);\n\n  // Auto-fill account when CEBE and CECO are selected based on associations"
);

file = file.replace(
  "  const openNew = () => {\n    setFormAccount(null);",
  "  const openNew = () => {\n    setFormAccount(null);\n    setFormIsExpense(false);"
);

file = file.replace(
  "    const acc = rawAccounts.find(a => a.code === bud.accountCode) || { id: bud.accountId, code: bud.accountCode, name: bud.accountName };\n    setFormAccount(acc);\n    setFormMonths({ ...bud.months });",
  "    const acc = rawAccounts.find(a => a.code === bud.accountCode) || { id: bud.accountId, code: bud.accountCode, name: bud.accountName };\n    setFormAccount(acc);\n    setFormIsExpense(bud.isExpense !== undefined ? bud.isExpense : (acc.code?.startsWith('6') || acc.code?.startsWith('8')));\n    setFormMonths({ ...bud.months });"
);

file = file.replace(
  "      cebe: formCebe || '', ceco: formCeco || '',\n      userId: user.uid, updatedAt: new Date().toISOString()",
  "      cebe: formCebe || '', ceco: formCeco || '',\n      isExpense: formIsExpense,\n      userId: user.uid, updatedAt: new Date().toISOString()"
);

file = file.replace(
  "              {/* Presupuesto anual + Repartir */}\n              <div className=\"flex items-center gap-[6px]\">",
  "              {/* Checkbox Gasto */}\n              <div className=\"flex items-center gap-[6px]\">\n                <span className=\"border border-[#999] bg-[#f8f9fa] px-2 py-[3px] text-[12px] text-[#333] w-[65px] text-center shrink-0 font-bold\">Tipo:</span>\n                <input type=\"checkbox\" id=\"expenseCheck\" checked={formIsExpense} onChange={e => setFormIsExpense(e.target.checked)} className=\"w-[14px] h-[14px] accent-[#4472c4]\" />\n                <label htmlFor=\"expenseCheck\" className=\"text-[12px] text-[#333] font-bold cursor-pointer select-none\">Es un Gasto (restará en el total)</label>\n              </div>\n\n              {/* Presupuesto anual + Repartir */}\n              <div className=\"flex items-center gap-[6px]\">"
);

file = file.replace(
  "      const isHaber = code.startsWith('7') || code.startsWith('9');\n      const isDebe = code.startsWith('6') || code.startsWith('8');",
  "      const expenseFlag = b.isExpense !== undefined ? b.isExpense : (code.startsWith('6') || code.startsWith('8'));\n      const isDebe = expenseFlag;\n      const isHaber = !expenseFlag;"
);

file = file.replaceAll(
  "const mult = (code.startsWith('6') || code.startsWith('8')) ? -1 : 1;",
  "const expenseFlag = b.isExpense !== undefined ? b.isExpense : (code.startsWith('6') || code.startsWith('8'));\n          const mult = expenseFlag ? -1 : 1;"
);

fs.writeFileSync('src/pages/Analitica.jsx', file);
console.log('Done!');
