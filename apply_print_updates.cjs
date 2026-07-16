const fs = require('fs');
let txt = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

// 1. Add import
if (!txt.includes('ResizableSidebar')) {
  txt = txt.replace(
    "import { useRvHistoricalData } from '../hooks/useRvHistoricalData';",
    "import { useRvHistoricalData } from '../hooks/useRvHistoricalData';\nimport ResizableSidebar from '../components/ResizableSidebar';"
  );
}

// 2. Add chart period state variables
const stateTarget = "const [rvMetricsKpiType, setRvMetricsKpiType] = useState('TOTAL');";
if (txt.includes(stateTarget) && !txt.includes('rvMetricsLinePeriod')) {
  txt = txt.replace(
    stateTarget,
    stateTarget + '\n  const [rvMetricsLinePeriod, setRvMetricsLinePeriod] = useState(\'DAY\');\n  const [rvMetricsBarPeriod, setRvMetricsBarPeriod] = useState(\'MONTH\');'
  );
}

// 3. Update hook call options
txt = txt.replace(
  "linePeriod: rvMetricsAccumulated ? 'ALL' : 'DAY',",
  "linePeriod: rvMetricsLinePeriod,"
);
// We also need to add barPeriod if it doesn't exist. Wait, the hook call might not have barPeriod.
if (txt.includes('linePeriod: rvMetricsLinePeriod,') && !txt.includes('barPeriod: rvMetricsBarPeriod,')) {
  txt = txt.replace(
    "linePeriod: rvMetricsLinePeriod,",
    "linePeriod: rvMetricsLinePeriod,\n    barPeriod: rvMetricsBarPeriod,"
  );
}

// 4. Update sidebars to ResizableSidebar
txt = txt.replace(
  '<div className="w-60 bg-[#f0f0f0] border border-[#808080] shrink-0 p-2 flex flex-col gap-3 win-bevel no-print overflow-y-auto max-h-full">',
  '<ResizableSidebar defaultWidth={240} minWidth={200} maxWidth={400} position="left" className="bg-[#f0f0f0] border border-[#808080] p-2 flex flex-col gap-3 win-bevel no-print overflow-y-auto max-h-full">'
);
txt = txt.replace(
  '<div className="w-64 bg-[#f0f0f0] border border-[#808080] shrink-0 p-2 flex flex-col gap-3 win-bevel no-print overflow-y-auto max-h-full">',
  '<ResizableSidebar defaultWidth={256} minWidth={200} maxWidth={400} position="right" className="bg-[#f0f0f0] border border-[#808080] p-2 flex flex-col gap-3 win-bevel no-print overflow-y-auto max-h-full">'
);

// We need to change the closing </div> of these sidebars to </ResizableSidebar>. 
// Wait! It's much safer to replace them by manually locating the lines or using exact substrings for the end of the sidebar.
fs.writeFileSync('src/pages/PrintPage.jsx', txt, 'utf8');
console.log('Partial updates applied');
