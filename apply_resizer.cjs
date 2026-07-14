const fs = require('fs');
const path = require('path');

const dir = 'src/pages';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsx'));

for (const file of files) {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // We are looking for divs with w-64 that act as sidebars
  if (content.includes('className="w-64') && (content.includes('border-r') || content.includes('flex flex-col'))) {
    if (!content.includes('ResizableSidebar')) {
      const importStatement = "import ResizableSidebar from '../components/ResizableSidebar';\n";
      const lastImportIndex = content.lastIndexOf('import ');
      const endOfLastImport = content.indexOf('\n', lastImportIndex);
      content = content.slice(0, endOfLastImport + 1) + importStatement + content.slice(endOfLastImport + 1);
    }

    const regex = /<div\s+className="([^"]*w-64[^"]*(?:border-r|shrink-0)[^"]*)"/g;
    const matches = [...content.matchAll(regex)];
    
    let modified = false;
    for (let i = matches.length - 1; i >= 0; i--) {
      const m = matches[i];
      const startIndex = m.index;
      
      let tagEndIndex = startIndex;
      while (content[tagEndIndex] !== '>') tagEndIndex++;
      
      const fullTag = content.substring(startIndex, tagEndIndex + 1);
      
      // Find closing div
      let depth = 1;
      let j = tagEndIndex + 1;
      while (depth > 0 && j < content.length) {
        if (content.startsWith('<div', j)) {
           // careful with self closing tags if they existed, but div doesn't
           depth++;
        } else if (content.startsWith('</div', j)) {
           depth--;
        }
        j++;
      }
      
      if (depth === 0) {
         let closeIndex = j - 1; // points to the '<' of '</div>'
         
         // replace closing tag
         content = content.slice(0, closeIndex) + '</ResizableSidebar>' + content.slice(closeIndex + 6);
         
         // replace opening tag
         let newTag = fullTag.replace('<div', '<ResizableSidebar').replace(/\bw-64\b/g, '').replace('  ', ' ');
         content = content.slice(0, startIndex) + newTag + content.slice(tagEndIndex + 1);
         modified = true;
      }
    }
    
    if (modified) {
      fs.writeFileSync(filePath, content);
      console.log('Updated', file);
    }
  }
}
