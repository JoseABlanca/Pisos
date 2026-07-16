const fs = require('fs');
let content = fs.readFileSync('src/hooks/useRvHistoricalData.js', 'utf8');

// Add kpiBenefitType = 'TOTAL' to the arguments
content = content.replace(
  /activeView = 'graficos'/,
  "activeView = 'graficos',\n  kpiBenefitType = 'TOTAL'"
);

fs.writeFileSync('src/hooks/useRvHistoricalData.js', content, 'utf8');
console.log('Added kpiBenefitType to useRvHistoricalData signature');
