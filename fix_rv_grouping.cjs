const fs = require('fs');
let content = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

// Fix filtering by assetId -> symbol
content = content.replace(
  /holdings = holdings\.filter\(h => rvAssetFilter\.includes\(h\.assetId\)\);/g,
  "holdings = holdings.filter(h => rvAssetFilter.includes(h.symbol));"
);

// Fix grouping select option value from assetId to symbol
content = content.replace(
  /<option value="assetId">Agrupar por Acciones \(Ticker\)<\/option>/g,
  '<option value="symbol">Agrupar por Acciones (Ticker)</option>'
);

// Fix group-header rendering to show TICKER instead of assetId
content = content.replace(
  /groupCol1 === 'assetId' \? 'TICKER' : groupCol1/g,
  "groupCol1 === 'symbol' ? 'TICKER' : groupCol1"
);

fs.writeFileSync('src/pages/PrintPage.jsx', content, 'utf8');
console.log("Fixed asset grouping and filtering");
