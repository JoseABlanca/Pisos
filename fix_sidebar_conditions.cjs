const fs = require('fs');
let content = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

// Remove rv_portfolio from Filtros Inmobiliarios
content = content.replace(
  "{['activos', 'alquileres', 'clientes', 'extracto_propietarios', 'metricas_inversion', 'rv_transactions', 'rv_portfolio'].includes(selectedTemplate) && (\n            <div className=\"bg-white border border-[#a0a0a0] p-3 flex flex-col gap-3\">\n              <div\n                className=\"text-[10px] font-bold text-slate-500 uppercase flex items-center justify-between cursor-pointer select-none hover:text-slate-800\"\n                onClick={() => setIsFiltersInmobCollapsed(p => !p)}\n              >\n                <div className=\"flex items-center gap-1\">\n                  <Sliders className=\"w-3.5 h-3.5 text-slate-400\" />\n                  <span>Filtros Inmobiliarios</span>",
  "{['activos', 'alquileres', 'clientes', 'extracto_propietarios', 'metricas_inversion'].includes(selectedTemplate) && (\n            <div className=\"bg-white border border-[#a0a0a0] p-3 flex flex-col gap-3\">\n              <div\n                className=\"text-[10px] font-bold text-slate-500 uppercase flex items-center justify-between cursor-pointer select-none hover:text-slate-800\"\n                onClick={() => setIsFiltersInmobCollapsed(p => !p)}\n              >\n                <div className=\"flex items-center gap-1\">\n                  <Sliders className=\"w-3.5 h-3.5 text-slate-400\" />\n                  <span>Filtros Inmobiliarios</span>"
);

// Add rv_portfolio to Opciones Renta Variable
content = content.replace(
  "{['rv_transactions'].includes(selectedTemplate) && (\n            <div className=\"bg-white border border-[#a0a0a0] p-3 flex flex-col gap-3\">\n              <div\n                className=\"text-[10px] font-bold text-slate-500 uppercase flex items-center justify-between cursor-pointer select-none hover:text-slate-800\"\n                onClick={() => setIsOptsRvCollapsed(p => !p)}\n              >\n                <div className=\"flex items-center gap-1\">\n                  <Sliders className=\"w-3.5 h-3.5 text-slate-400\" />\n                  <span>Opciones Renta Variable</span>",
  "{['rv_transactions', 'rv_portfolio'].includes(selectedTemplate) && (\n            <div className=\"bg-white border border-[#a0a0a0] p-3 flex flex-col gap-3\">\n              <div\n                className=\"text-[10px] font-bold text-slate-500 uppercase flex items-center justify-between cursor-pointer select-none hover:text-slate-800\"\n                onClick={() => setIsOptsRvCollapsed(p => !p)}\n              >\n                <div className=\"flex items-center gap-1\">\n                  <Sliders className=\"w-3.5 h-3.5 text-slate-400\" />\n                  <span>Opciones Renta Variable</span>"
);

fs.writeFileSync('src/pages/PrintPage.jsx', content);
console.log('Fixed sidebar conditions');
