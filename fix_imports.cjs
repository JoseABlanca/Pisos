const fs = require('fs');

['src/pages/PrintPage.jsx', 'src/pages/RvMetrics.jsx'].forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace("import {\r\nimport ResizableSidebar from '../components/ResizableSidebar';\n", "import ResizableSidebar from '../components/ResizableSidebar';\r\nimport {\r\n");
  content = content.replace("import {\nimport ResizableSidebar from '../components/ResizableSidebar';\n", "import ResizableSidebar from '../components/ResizableSidebar';\nimport {\n");
  fs.writeFileSync(file, content);
});
