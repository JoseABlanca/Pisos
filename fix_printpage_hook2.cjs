const fs = require('fs');
let content = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

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

if (content.includes('lineData: rvLineData')) {
  console.log('Already injected.');
} else {
  if (content.includes('const [isSortCollapsed, setIsSortCollapsed] = useState(false);')) {
    content = content.replace(
      'const [isSortCollapsed, setIsSortCollapsed] = useState(false);',
      hookCall + '\n  const [isSortCollapsed, setIsSortCollapsed] = useState(false);'
    );
    fs.writeFileSync('src/pages/PrintPage.jsx', content, 'utf8');
    console.log('Hook successfully injected in PrintPage.jsx');
  } else {
    throw new Error('Could not find injection point');
  }
}
