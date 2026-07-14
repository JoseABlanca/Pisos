const fs = require('fs');
let content = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

content = content.replace(/Inversi\uFFFDn/g, 'Inversión');
content = content.replace(/Ordenaci\uFFFDn/g, 'Ordenación');
content = content.replace(/Gr\uFFFDficos/g, 'Gráficos');
content = content.replace(/Hist\uFFFDrico/g, 'Histórico');
content = content.replace(/Evoluci\uFFFDn/g, 'Evolución');
content = content.replace(/`\uFFFD\$\{/g, '`€${');
content = content.replace(/Agrupaci\uFFFDn/g, 'Agrupación');
content = content.replace(/Paginaci\uFFFDn/g, 'Paginación');
content = content.replace(/Amortizaci\uFFFDn/g, 'Amortización');
content = content.replace(/Direcci\uFFFDn/g, 'Dirección');
content = content.replace(/Adquisici\uFFFDn/g, 'Adquisición');
content = content.replace(/N\uFFFD Cuenta/g, 'Nº Cuenta');
content = content.replace(/EXPLOTACI\uFFFD"N/g, 'EXPLOTACIÓN');

// The `formatCurrency` ones were fixed in step 5 actually! The reason why the screenshot showed the bug is because the bug was still on production! Wait. The user requested this "quitame eso que te señalo en la foto 1 en amarillo" BEFORE my recent fixes were deployed, or my recent fix didn't fix the PDF because of the unicode issues! Yes!
// Let's replace any lingering  just in case for euro signs:
// In the table headers/cells where € might have been replaced with 
// Note: sum.totalCost € was already fixed by fix_rv_symbols_final.cjs (it used exact capture).

fs.writeFileSync('src/pages/PrintPage.jsx', content, 'utf8');
console.log('Fixed symbols step final 2');
