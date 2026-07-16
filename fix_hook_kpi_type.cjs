const fs = require('fs');
let txt = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

const target = 'isAccumulated: rvMetricsAccumulated';
if (txt.includes(target)) {
  txt = txt.replace(target, target + ',\n    kpiBenefitType: rvMetricsKpiType');
  fs.writeFileSync('src/pages/PrintPage.jsx', txt, 'utf8');
  console.log('kpiBenefitType successfully injected in hook parameters.');
} else {
  console.error('Target not found!');
}
