const fs = require('fs');

let content = fs.readFileSync('src/pages/RvMetrics.jsx', 'utf8');

const hookImportStr = "import { useRvHistoricalData } from '../hooks/useRvHistoricalData';";
if (!content.includes('useRvHistoricalData')) {
  content = content.replace(/import \{.*?\} from 'react';/, match => match + '\n' + hookImportStr);
}

const startStr = 'const { lineData, barData, histogramData, drawdownData, summary } = useMemo(() => {';
const startIndex = content.indexOf(startStr);

// Find the end
let braceCount = 0;
let endIndex = -1;
let started = false;

for (let i = startIndex; i < content.length; i++) {
  if (content[i] === '{') {
    braceCount++;
    started = true;
  } else if (content[i] === '}') {
    braceCount--;
  }
  
  if (started && braceCount === 0) {
    const rest = content.substring(i);
    const match = rest.match(/^\}, \[[^\]]*\]\);/);
    if (match) {
      endIndex = i + match[0].length;
      break;
    }
  }
}

const replacement = `const { lineData, barData, histogramData, drawdownData, summary } = useRvHistoricalData({
    transactions, history, assets, rvBrokers, config,
    selectedTickers, selectedBrokers, selectedAccounts,
    startDate, endDate, linePeriod, barPeriod, histPeriod, histBins,
    drawdownPeriod, isAccumulated, unit, activeView
  });`;

content = content.substring(0, startIndex) + replacement + content.substring(endIndex);

fs.writeFileSync('src/pages/RvMetrics.jsx', content, 'utf8');
console.log('Refactored RvMetrics.jsx');
