const fs = require('fs');
let content = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

content = content.replace(
  "import { collection, query, where, onSnapshot } from 'firebase/firestore';",
  "import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';"
);

fs.writeFileSync('src/pages/PrintPage.jsx', content, 'utf8');
console.log('Fixed missing doc import');
