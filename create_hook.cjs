const fs = require('fs');

const useMemoBlock = fs.readFileSync('extracted_useMemo.txt', 'utf8');

const hookCode = `import { useMemo } from 'react';

export function useRvHistoricalData({
  transactions = [],
  history = {},
  assets = {},
  rvBrokers = {},
  config = {},
  selectedTickers = ['ALL'],
  selectedBrokers = ['ALL'],
  selectedAccounts = ['ALL'],
  startDate = '',
  endDate = '',
  linePeriod = 'DAY',
  barPeriod = 'MONTH',
  histPeriod = 'DAY',
  histBins = 20,
  drawdownPeriod = 'DAY',
  isAccumulated = true,
  unit = 'EUR',
  activeView = 'resumen'
}) {
  return ${useMemoBlock.replace(
    /^\}, \[.*\]\);$/m, 
    '}, [transactions, history, assets, rvBrokers, config, selectedTickers, selectedBrokers, selectedAccounts, startDate, endDate, linePeriod, barPeriod, histPeriod, histBins, drawdownPeriod, isAccumulated, unit, activeView]);'
  )}
}
`;

fs.writeFileSync('src/hooks/useRvHistoricalData.js', hookCode, 'utf8');
console.log('Hook created successfully.');
