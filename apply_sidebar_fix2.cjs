const fs = require('fs');
let content = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

// The line is: {['activos', 'alquileres', 'clientes', 'extracto_propietarios', 'metricas_inversion'].includes(selectedTemplate) && ALL_COLUMNS[selectedTemplate] && (
content = content.replace(
  "{['activos', 'alquileres', 'clientes', 'extracto_propietarios', 'metricas_inversion'].includes(selectedTemplate) && ALL_COLUMNS[selectedTemplate] && (",
  "{['activos', 'alquileres', 'clientes', 'extracto_propietarios', 'metricas_inversion', 'rv_transactions', 'rv_portfolio'].includes(selectedTemplate) && ALL_COLUMNS[selectedTemplate] && ("
);

// For Ordenación del Informe:
// Let's find exactly what it says.
content = content.replace(
  "{['activos', 'alquileres', 'clientes', 'extracto_propietarios', 'metricas_inversion'].includes(selectedTemplate) && (",
  "{['activos', 'alquileres', 'clientes', 'extracto_propietarios', 'metricas_inversion', 'rv_transactions', 'rv_portfolio'].includes(selectedTemplate) && ("
);

fs.writeFileSync('src/pages/PrintPage.jsx', content);
console.log('Fixed sidebars');
