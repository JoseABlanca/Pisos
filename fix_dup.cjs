const fs = require('fs');
let file = fs.readFileSync('src/pages/Analitica.jsx', 'utf8');
file = file.replace('  const [formIsExpense, setFormIsExpense] = useState(false);\n  const [formIsExpense, setFormIsExpense] = useState(false);', '  const [formIsExpense, setFormIsExpense] = useState(false);');
fs.writeFileSync('src/pages/Analitica.jsx', file);
