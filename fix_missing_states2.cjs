const fs = require('fs');
let txt = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

const target = "const [rvMetricsAccumulated, setRvMetricsAccumulated] = useState(true);";

if (txt.includes(target)) {
  txt = txt.replace(target, target + '\n  const [rvMetricsKpiType, setRvMetricsKpiType] = useState(\'TOTAL\');');
  fs.writeFileSync('src/pages/PrintPage.jsx', txt, 'utf8');
  console.log('rvMetricsKpiType successfully injected.');
} else {
  console.error('Target not found!');
}
