const fs = require('fs');
let content = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

// Insert the hook call after the state definitions
const hookCall = `
  // RvMetrics historical data hook
  const { 
    lineData: rvLineData, 
    barData: rvBarData, 
    histogramData: rvHistogramData, 
    drawdownData: rvDrawdownData, 
    summary: rvSummaryData 
  } = useRvHistoricalData({
    transactions: rvTransactions,
    history: rvAssetHistory || {},
    assets: Object.fromEntries(rvAssets.map(a => [a.id, a])),
    rvBrokers: Object.fromEntries(rvBrokers.map(b => [b.id, b])),
    config: rvConfig || {},
    selectedTickers: ['ALL'], // Or map to selected filters if needed
    selectedBrokers: ['ALL'],
    selectedAccounts: ['ALL'],
    startDate: '',
    endDate: '',
    linePeriod: 'DAY',
    barPeriod: 'MONTH',
    histPeriod: 'DAY',
    histBins: 20,
    drawdownPeriod: 'DAY',
    isAccumulated: rvMetricsAccumulated,
    unit: rvMetricsUnit,
    activeView: 'resumen'
  });
`;

content = content.replace(
  /const \[rvChartType, setRvChartType\] = useState\('NONE'\);[\s\S]*?const \[rvMetricsAccumulated, setRvMetricsAccumulated\] = useState\(true\);/,
  match => match + '\n' + hookCall
);

fs.writeFileSync('src/pages/PrintPage.jsx', content, 'utf8');
console.log('Added useRvHistoricalData hook call to PrintPage.jsx');
