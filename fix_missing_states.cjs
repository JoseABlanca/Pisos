const fs = require('fs');
let txt = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

const newStates = `  const [rvMetricsPrimary, setRvMetricsPrimary] = useState('VALOR');
  const [rvMetricsUnit, setRvMetricsUnit] = useState('EUR');
  const [rvMetricsAccumulated, setRvMetricsAccumulated] = useState(true);`;

const target = "const [rvChartTypes, setRvChartTypes] = useState(['evolucion', 'historical_advanced']);";

if (txt.includes(target)) {
  txt = txt.replace(target, target + '\n' + newStates);
  fs.writeFileSync('src/pages/PrintPage.jsx', txt, 'utf8');
  console.log('States successfully injected.');
} else {
  console.error('Target not found!');
}
