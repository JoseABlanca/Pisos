const fs = require('fs');
let hookCode = fs.readFileSync('src/hooks/useRvHistoricalData.js', 'utf8');

hookCode = hookCode.replace(/return const \{ lineData, barData, histogramData, drawdownData, summary \} = useMemo/, 'return useMemo');

fs.writeFileSync('src/hooks/useRvHistoricalData.js', hookCode, 'utf8');
console.log('Fixed hook syntax');
