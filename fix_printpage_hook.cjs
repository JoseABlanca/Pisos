const fs = require('fs');
let content = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

// 1. Add import
if (!content.includes("import { useRvHistoricalData }")) {
  content = content.replace(
    "import { format, parseISO } from 'date-fns';",
    "import { format, parseISO } from 'date-fns';\nimport { useRvHistoricalData } from '../hooks/useRvHistoricalData';"
  );
}

// 2. Add hook call inside PrintPage()
const hookCall = `
  const { lineData: rvLineData, barData: rvBarData, histogramData: rvHistogramData, drawdownData: rvDrawdownData } = useRvHistoricalData({
    transactions: rvTransactions,
    history: rvAssetHistory,
    assets: Object.fromEntries(rvAssets.map(a => [a.id, a])),
    rvBrokers: Object.fromEntries(rvBrokers.map(b => [b.id, b])),
    config: { exchangeRates: rates },
    selectedTickers: rvAssetFilter.length > 0 ? rvAssetFilter : ['ALL'],
    selectedBrokers: rvBrokerFilter.length > 0 ? rvBrokerFilter : ['ALL'],
    linePeriod: rvMetricsAccumulated ? 'ALL' : 'DAY',
    unit: rvMetricsUnit,
    isAccumulated: rvMetricsAccumulated
  });
`;

if (!content.includes('lineData: rvLineData')) {
  // Find a good place to insert it. e.g. right before "const [isSortCollapsed, setIsSortCollapsed]"
  content = content.replace(
    /const \[isSortCollapsed, setIsSortCollapsed\] = useState\(true\);/,
    match => hookCall + '\n  ' + match
  );
}

fs.writeFileSync('src/pages/PrintPage.jsx', content, 'utf8');
console.log('Hook call injected in PrintPage.jsx');
