const fs = require('fs');
let content = fs.readFileSync('src/pages/RvMetrics.jsx', 'utf8');

// Replace the hook call
content = content.replace(
  /drawdownPeriod, isAccumulated, unit, activeView\n\s*\}/g,
  "drawdownPeriod, isAccumulated, unit, activeView, kpiBenefitType\n  }"
);

fs.writeFileSync('src/pages/RvMetrics.jsx', content, 'utf8');
console.log('Added kpiBenefitType to useRvHistoricalData call in RvMetrics.jsx');
