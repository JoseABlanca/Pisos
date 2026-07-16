const fs = require('fs');
let txt = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

// 1. Remove the old hook call block
const regex = /const \{ lineData: rvLineData, barData: rvBarData, histogramData: rvHistogramData, drawdownData: rvDrawdownData \} = useRvHistoricalData\(\{[\s\S]*?\}\);/g;
txt = txt.replace(regex, '');

// 2. Insert it back after 'const [loading, setLoading] = useState(true);'
const hookCall = `  const { lineData: rvLineData, barData: rvBarData, histogramData: rvHistogramData, drawdownData: rvDrawdownData } = useRvHistoricalData({
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
  });`;

const target = 'const [loading, setLoading] = useState(true);';
if (txt.includes(target)) {
  txt = txt.replace(target, target + '\n\n' + hookCall);
  fs.writeFileSync('src/pages/PrintPage.jsx', txt, 'utf8');
  console.log('Hook successfully moved.');
} else {
  console.error('Target not found!');
}
