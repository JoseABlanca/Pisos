const fs = require('fs');
let content = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

// 1. Columnas Visibles
content = content.replace(
  "{['activos', 'alquileres', 'clientes', 'extracto_propietarios', 'metricas_inversion', 'rv_transactions'].includes(selectedTemplate)",
  "{['activos', 'alquileres', 'clientes', 'extracto_propietarios', 'metricas_inversion', 'rv_transactions', 'rv_portfolio'].includes(selectedTemplate)"
);

// 2. Ordenación del Informe
content = content.replace(
  "{['activos', 'alquileres', 'clientes', 'extracto_propietarios', 'rv_transactions'].includes(selectedTemplate)",
  "{['activos', 'alquileres', 'clientes', 'extracto_propietarios', 'rv_transactions', 'rv_portfolio'].includes(selectedTemplate)"
);

// 3. Agrupación y Filtros de Fincas (Activos) might be affected? No, we don't want fincas for rv_portfolio.

fs.writeFileSync('src/pages/PrintPage.jsx', content);
console.log('Sidebar arrays updated');
