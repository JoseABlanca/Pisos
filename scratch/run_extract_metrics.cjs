const fs = require('fs');

const rawJson = fs.readFileSync('C:/Users/Jose/.gemini/antigravity-finance/../antigravity/brain/445ef158-69c5-4f39-86b5-190b07c2ed60/.system_generated/steps/5348/output.txt', 'utf8');
const data = JSON.parse(rawJson);

const entries = (data.documents || []).map(doc => {
  const fields = doc.fields || {};
  const parseValue = (val) => {
    if (!val) return null;
    if (val.stringValue !== undefined) return val.stringValue;
    if (val.doubleValue !== undefined) return Number(val.doubleValue);
    if (val.integerValue !== undefined) return Number(val.integerValue);
    if (val.booleanValue !== undefined) return val.booleanValue;
    if (val.arrayValue !== undefined) return (val.arrayValue.values || []).map(v => parseValue(v));
    if (val.mapValue !== undefined) {
      const obj = {};
      for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
        obj[k] = parseValue(v);
      }
      return obj;
    }
    return null;
  };
  const entry = {};
  for (const [k, v] of Object.entries(fields)) {
    entry[k] = parseValue(v);
  }
  return entry;
});

const getPropertyExtractMetrics = (p, entriesList) => {
  let ingresos = 0;
  let gastos = 0;

  const normValueCebe = p.cebe ? String(p.cebe).trim().replace(/^(CEBE|CECO)/i, '').toLowerCase() : '';
  const normIncomeCecos = (p.taxIncomeCecos || []).map(c => String(c).trim().replace(/^(CEBE|CECO)/i, '').toLowerCase());
  const normExpenseCecos = (p.taxExpenseCecos || []).map(c => String(c).trim().replace(/^(CEBE|CECO)/i, '').toLowerCase());

  if (!normValueCebe && normIncomeCecos.length === 0 && normExpenseCecos.length === 0) {
    return { ingresos: 0, gastos: 0, neto: 0 };
  }

  // First filter entries exactly like filteredEntries in ExtractoContableTab
  const filtered = entriesList.filter(entry => {
    let matchCebe = false;
    let matchCeco = false;

    const hasLineLevelAnalytics = entry.lines && entry.lines.some(l => l.cebe || l.ceco);

    if (entry.lines) {
      entry.lines.forEach(l => {
        // Income check
        let lineCebeMatch = false;
        if (normValueCebe && l.cebe) {
          const normField = String(l.cebe).trim().replace(/^(CEBE|CECO)/i, '').toLowerCase();
          if (normField.startsWith(normValueCebe)) lineCebeMatch = true;
        } else if (!l.cebe && normValueCebe) {
          const entryCebe = String(entry.cebe || '').trim().replace(/^(CEBE|CECO)/i, '').toLowerCase();
          if (entryCebe.startsWith(normValueCebe)) lineCebeMatch = true;
        }

        let lineCecoMatch = false;
        if (normIncomeCecos.length > 0) {
          if (l.ceco) {
            const normField = String(l.ceco).trim().replace(/^(CEBE|CECO)/i, '').toLowerCase();
            if (normIncomeCecos.some(c => normField.startsWith(c))) lineCecoMatch = true;
          } else if (!l.ceco) {
            const entryCeco = String(entry.ceco || '').trim().replace(/^(CEBE|CECO)/i, '').toLowerCase();
            if (normIncomeCecos.some(c => entryCeco.startsWith(c))) lineCecoMatch = true;
          }
        } else {
          lineCecoMatch = true;
        }

        if (lineCebeMatch && lineCecoMatch) {
          matchCebe = true;
        }

        // Expense check
        let lineExpenseCebeMatch = false;
        if (!normValueCebe) {
          lineExpenseCebeMatch = true;
        } else if (l.cebe) {
          const normField = String(l.cebe).trim().replace(/^(CEBE|CECO)/i, '').toLowerCase();
          if (normField.startsWith(normValueCebe)) lineExpenseCebeMatch = true;
        } else if (entry.cebe) {
          const entryCebe = String(entry.cebe).trim().replace(/^(CEBE|CECO)/i, '').toLowerCase();
          if (entryCebe.startsWith(normValueCebe)) lineExpenseCebeMatch = true;
        }

        let lineExpenseCecoMatch = false;
        if (normExpenseCecos.length > 0) {
          if (l.ceco) {
            const normField = String(l.ceco).trim().replace(/^(CEBE|CECO)/i, '').toLowerCase();
            if (normExpenseCecos.some(c => normField.startsWith(c))) lineExpenseCecoMatch = true;
          } else if (!l.ceco) {
            const entryCeco = String(entry.ceco || '').trim().replace(/^(CEBE|CECO)/i, '').toLowerCase();
            if (normExpenseCecos.some(c => entryCeco.startsWith(c))) lineExpenseCecoMatch = true;
          }
        } else {
          lineExpenseCecoMatch = true;
        }

        if (lineExpenseCebeMatch && lineExpenseCecoMatch) {
          matchCeco = true;
        }
      });
    }

    if (!hasLineLevelAnalytics) {
      // Global Income
      let globalCebe = false;
      if (normValueCebe && entry.cebe) {
        const normField = String(entry.cebe).trim().replace(/^(CEBE|CECO)/i, '').toLowerCase();
        if (normField.startsWith(normValueCebe)) globalCebe = true;
      }
      let globalIncomeCeco = false;
      if (normIncomeCecos.length > 0) {
        if (entry.ceco) {
          const normField = String(entry.ceco).trim().replace(/^(CEBE|CECO)/i, '').toLowerCase();
          if (normIncomeCecos.some(c => normField.startsWith(c))) globalIncomeCeco = true;
        }
      } else {
        globalIncomeCeco = true;
      }
      if (globalCebe && globalIncomeCeco) matchCebe = true;

      // Global Expense
      let globalExpenseCebe = false;
      if (!normValueCebe) {
        globalExpenseCebe = true;
      } else if (entry.cebe) {
        const normField = String(entry.cebe).trim().replace(/^(CEBE|CECO)/i, '').toLowerCase();
        globalExpenseCebe = normField.startsWith(normValueCebe);
      }
      let globalExpenseCeco = false;
      if (normExpenseCecos.length > 0) {
        if (entry.ceco) {
          const normField = String(entry.ceco).trim().replace(/^(CEBE|CECO)/i, '').toLowerCase();
          if (normExpenseCecos.some(c => normField.startsWith(c))) globalExpenseCeco = true;
        }
      } else {
        globalExpenseCeco = true;
      }
      if (globalExpenseCebe && globalExpenseCeco) matchCeco = true;
    }

    return matchCebe || matchCeco;
  });

  // Now calculate totals for the filtered entries
  filtered.forEach(entry => {
    let cebeEntryAmount = 0;
    let cecoEntryAmount = 0;
    const hasLineLevelAnalytics = entry.lines && entry.lines.some(l => l.cebe || l.ceco);

    if (entry.lines) {
      entry.lines.forEach(l => {
        const lineAmt = (Number(l.debit) || 0) + (Number(l.credit) || 0);
        const accCode = String(l.accountCode || '');

        let lineMatchCebe = false;
        let lineMatchCeco = false;

        if (normValueCebe && l.cebe) {
          const normField = String(l.cebe).trim().replace(/^(CEBE|CECO)/i, '').toLowerCase();
          if (normField.startsWith(normValueCebe)) lineMatchCebe = true;
        }
        if (normIncomeCecos.length > 0 && l.ceco) {
          const normField = String(l.ceco).trim().replace(/^(CEBE|CECO)/i, '').toLowerCase();
          if (normIncomeCecos.some(c => normField.startsWith(c))) lineMatchCebe = true;
        }

        if (normExpenseCecos.length > 0 && l.ceco) {
          const normField = String(l.ceco).trim().replace(/^(CEBE|CECO)/i, '').toLowerCase();
          if (normExpenseCecos.some(c => normField.startsWith(c))) lineMatchCeco = true;
        }

        if (lineMatchCebe || lineMatchCeco) {
          const isInc = accCode.startsWith('7');
          const isExp = accCode.startsWith('6');
          if (isInc) {
            cebeEntryAmount += lineAmt;
          } else if (isExp) {
            cecoEntryAmount += lineAmt;
          } else {
            if (lineMatchCebe) cebeEntryAmount += lineAmt;
            if (lineMatchCeco) cecoEntryAmount += lineAmt;
          }
        }
      });
    }

    if (!hasLineLevelAnalytics) {
      let globalCebe = false;
      if (normValueCebe && entry.cebe) {
        const normField = String(entry.cebe).trim().replace(/^(CEBE|CECO)/i, '').toLowerCase();
        if (normField.startsWith(normValueCebe)) globalCebe = true;
      }
      if (normIncomeCecos.length > 0 && entry.ceco) {
        const normField = String(entry.ceco).trim().replace(/^(CEBE|CECO)/i, '').toLowerCase();
        if (normIncomeCecos.some(c => normField.startsWith(c))) globalCebe = true;
      }
      if (globalCebe) {
        cebeEntryAmount = entry.total || 0;
      }

      let globalCeco = false;
      if (normExpenseCecos.length > 0 && entry.ceco) {
        const normField = String(entry.ceco).trim().replace(/^(CEBE|CECO)/i, '').toLowerCase();
        if (normExpenseCecos.some(c => normField.startsWith(c))) globalCeco = true;
      }
      if (globalCeco) {
        cecoEntryAmount = entry.total || 0;
      }
    }

    ingresos += cebeEntryAmount;
    gastos += cecoEntryAmount;
  });

  return { ingresos, gastos, neto: ingresos - gastos };
};

const alozaina = {
  cebe: 'CEBE_ALOZAINA',
  taxIncomeCecos: ['CECO001'],
  taxExpenseCecos: ['CECO002', 'CECO003', 'CECO004']
};

console.log("\n--- RUNNING ALL-TIME METRICS ---");
const allTime = getPropertyExtractMetrics(alozaina, entries);
console.log(`ALL-TIME: Incomes: ${allTime.ingresos}, Expenses: ${allTime.gastos}, Net: ${allTime.neto}`);

console.log("\n--- RUNNING 2026 METRICS ---");
const entries2026 = entries.filter(e => e.date && e.date.startsWith('2026'));
const yr2026 = getPropertyExtractMetrics(alozaina, entries2026);
console.log(`2026: Incomes: ${yr2026.ingresos}, Expenses: ${yr2026.gastos}, Net: ${yr2026.neto}`);
