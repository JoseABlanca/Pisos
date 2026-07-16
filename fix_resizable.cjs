const fs = require('fs');
let txt = fs.readFileSync('src/components/ResizableSidebar.jsx', 'utf8');

txt = txt.replace(
  'export default function ResizableSidebar({ children, defaultWidth = 256, minWidth = 150, maxWidth = 500, className = "" }) {',
  'export default function ResizableSidebar({ children, defaultWidth = 256, minWidth = 150, maxWidth = 500, className = "", position = "left" }) {'
);

txt = txt.replace(
  'let newWidth = e.clientX;',
  'let newWidth = position === "left" ? e.clientX : window.innerWidth - e.clientX;'
);

txt = txt.replace(
  'className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-400 active:bg-blue-600 z-50 group transition-colors"',
  'className={`absolute top-0 w-1 h-full cursor-col-resize hover:bg-blue-400 active:bg-blue-600 z-50 group transition-colors ${position === "left" ? "right-0" : "left-0"}`}'
);

txt = txt.replace(
  '<div className="absolute inset-y-0 -left-1 w-3" /> {/* Wider hit area */}',
  '<div className={`absolute inset-y-0 w-3 ${position === "left" ? "-left-1" : "-right-1"}`} /> {/* Wider hit area */}'
);

fs.writeFileSync('src/components/ResizableSidebar.jsx', txt, 'utf8');
console.log('ResizableSidebar updated');
