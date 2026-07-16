const fs = require('fs');
let content = fs.readFileSync('src/pages/RvMetrics.jsx', 'utf8');

if (!content.includes('useRvHistoricalData')) {
  // Wait, if it doesn't include the import, but DOES include the hook call...
}

content = content.replace(
  "import ResizableSidebar from '../components/ResizableSidebar';",
  "import ResizableSidebar from '../components/ResizableSidebar';\nimport { useRvHistoricalData } from '../hooks/useRvHistoricalData';"
);

fs.writeFileSync('src/pages/RvMetrics.jsx', content, 'utf8');
console.log('Added useRvHistoricalData import to RvMetrics.jsx');
