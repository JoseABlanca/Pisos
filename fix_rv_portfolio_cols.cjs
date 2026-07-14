const fs = require('fs');
let content = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

// 1. ALL_COLUMNS definitions
content = content.replace(
  "{ id: 'assetId', label: 'Ticker' },\n      { id: 'assetName', label: 'Activo' },\n      { id: 'brokerId', label: 'Broker' },\n      { id: 'quantity', label: 'Cant.' },\n      { id: 'avgPrice', label: 'PMC' }",
  "{ id: 'symbol', label: 'Ticker' },\n      { id: 'name', label: 'Activo' },\n      { id: 'brokerName', label: 'Broker' },\n      { id: 'quantity', label: 'Cant.' },\n      { id: 'pmc', label: 'PMC' }"
);

// 2. DEFAULT_VISIBLE_COLUMNS
content = content.replace(
  "rv_portfolio: new Set(['assetId', 'assetName', 'brokerId', 'quantity', 'avgPrice', 'currentPrice', 'totalCost', 'currentValue', 'pnl']),",
  "rv_portfolio: new Set(['symbol', 'name', 'brokerName', 'quantity', 'pmc', 'currentPrice', 'totalCost', 'currentValue', 'pnl']),"
);

// 3. Render logic in rv_portfolio
content = content.replace(
  "if (col.id === 'avgPrice') return <td key={col.id} className=\"py-2 px-1 text-right font-sans tabular-nums\">{(h.avgPrice || 0).toFixed(2)}</td>;",
  "if (col.id === 'pmc') return <td key={col.id} className=\"py-2 px-1 text-right font-sans tabular-nums\">{(h.pmc || 0).toFixed(2)}</td>;"
);

// Note: I also noticed some tabular-nums tabular-nums duplication in the earlier replace in my code, but that's harmless.
content = content.replace(/tabular-nums tabular-nums/g, 'tabular-nums');

fs.writeFileSync('src/pages/PrintPage.jsx', content);
console.log('Fixed rv_portfolio column IDs');
