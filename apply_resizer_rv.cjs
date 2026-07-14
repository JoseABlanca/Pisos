const fs = require('fs');
const filePath = 'src/pages/RvMetrics.jsx';
let content = fs.readFileSync(filePath, 'utf8');

if (!content.includes('ResizableSidebar')) {
  const importStatement = "import ResizableSidebar from '../components/ResizableSidebar';\n";
  const lastImportIndex = content.lastIndexOf('import ');
  const endOfLastImport = content.indexOf('\n', lastImportIndex);
  content = content.slice(0, endOfLastImport + 1) + importStatement + content.slice(endOfLastImport + 1);
}

const regex = /<div className="w-72 bg-\[#f4f5f8\] border-r border-slate-200 flex-shrink-0 flex flex-col h-full overflow-y-auto">/g;
let newTag = '<ResizableSidebar defaultWidth={288} className="bg-[#f4f5f8] border-r border-slate-200 h-full overflow-y-auto">';
let modified = false;

const matches = [...content.matchAll(regex)];
for (let i = matches.length - 1; i >= 0; i--) {
  const m = matches[i];
  const startIndex = m.index;
  const tagEndIndex = startIndex + m[0].length - 1;
  
  let depth = 1;
  let j = tagEndIndex + 1;
  while (depth > 0 && j < content.length) {
    if (content.startsWith('<div', j)) depth++;
    else if (content.startsWith('</div', j)) depth--;
    j++;
  }
  
  if (depth === 0) {
     let closeIndex = j - 1;
     content = content.slice(0, closeIndex) + '</ResizableSidebar>' + content.slice(closeIndex + 6);
     content = content.slice(0, startIndex) + newTag + content.slice(tagEndIndex + 1);
     modified = true;
  }
}

if (modified) {
  fs.writeFileSync(filePath, content);
  console.log('Updated RvMetrics.jsx');
}
