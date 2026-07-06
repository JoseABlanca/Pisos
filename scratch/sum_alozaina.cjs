const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const content = fs.readFileSync('C:/Users/Jose/.gemini/antigravity/brain/445ef158-69c5-4f39-86b5-190b07c2ed60/.system_generated/steps/5303/output.txt', 'utf8');
const data = yaml.load(content);

console.log(`Total documents found: ${data.documents.length}`);

let cebeSum2026 = 0;
let cecoSum2026 = 0;

let cebeSumAll = 0;
let cecoSumAll = 0;

data.documents.forEach(doc => {
  const date = doc.date;
  const is2026 = date && date.startsWith('2026');

  let docCebe = 0;
  let docCeco = 0;

  const hasLineLevelAnalytics = doc.lines && doc.lines.some(l => l.cebe || l.ceco);

  if (doc.lines) {
    doc.lines.forEach(l => {
      const lineAmt = (Number(l.debit) || 0) + (Number(l.credit) || 0);
      const accCode = String(l.accountCode || '');

      let lineMatchCebe = false;
      let lineMatchCeco = false;

      // Income match: CEBE
      if (l.cebe && String(l.cebe).toLowerCase().replace(/^(cebe|ceco)/i, '').startsWith('_alozaina')) {
        lineMatchCebe = true;
      }
      // Expense match: CECO (let's assume CECO003 or CECO001?)
      // Wait, in Alozaina taxExpenseCecos has CECO003?
      if (l.ceco && (String(l.ceco).toLowerCase().replace(/^(cebe|ceco)/i, '').startsWith('_ceco003') || String(l.ceco).toLowerCase().replace(/^(cebe|ceco)/i, '').startsWith('_ceco001'))) {
        lineMatchCeco = true; // wait, let's check which CECOs are matched
      }

      if (lineMatchCebe || lineMatchCeco) {
        const isInc = accCode.startsWith('7');
        const isExp = accCode.startsWith('6');
        if (isInc) {
          docCebe += lineAmt;
        } else if (isExp) {
          docCeco += lineAmt;
        } else {
          if (lineMatchCebe) docCebe += lineAmt;
          if (lineMatchCeco) docCeco += lineAmt;
        }
      }
    });
  }

  if (is2026) {
    cebeSum2026 += docCebe;
    cecoSum2026 += docCeco;
    console.log(`2026 - Date: ${date}, Desc: ${doc.description}, CebeAmt: ${docCebe}, CecoAmt: ${docCeco}`);
  }
  cebeSumAll += docCebe;
  cecoSumAll += docCeco;
});

console.log(`\n2026 Totals: Incomes = ${cebeSum2026}, Expenses = ${cecoSum2026}`);
console.log(`All Totals: Incomes = ${cebeSumAll}, Expenses = ${cecoSumAll}`);
