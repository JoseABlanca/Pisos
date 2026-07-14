const fs = require('fs');
let content = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

// The chart block starts with: if (showRvChart && filteredTx.length > 0) {
// Let's use string operations to remove it from the rv_transactions block.
const marker = "if (selectedTemplate === 'rv_transactions') {";
const rvIdx = content.indexOf(marker);
if (rvIdx !== -1) {
  let block = content.substring(rvIdx);
  
  // Find the chart block
  const chartStart = block.indexOf("if (showRvChart && filteredTx.length > 0) {");
  if (chartStart !== -1) {
    // Find where the next block starts
    const chartEnd = block.indexOf("// Agrupaci", chartStart);
    if (chartEnd !== -1) {
      const beforeChart = block.substring(0, chartStart);
      const afterChart = block.substring(chartEnd);
      content = content.substring(0, rvIdx) + beforeChart + "\n      " + afterChart;
    }
  }
}

fs.writeFileSync('src/pages/PrintPage.jsx', content);
console.log('Removed duplicate chart from rv_transactions');
