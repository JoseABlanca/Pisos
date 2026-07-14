const fs = require('fs');
let content = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

content = content.replace(
  "{['activos', 'alquileres', 'clientes', 'extracto_propietarios'].includes(selectedTemplate) && (",
  "{['activos', 'alquileres', 'clientes', 'extracto_propietarios', 'rv_transactions', 'rv_portfolio'].includes(selectedTemplate) && ("
);

fs.writeFileSync('src/pages/PrintPage.jsx', content);
console.log('Fixed Ordenación del Informe array');
