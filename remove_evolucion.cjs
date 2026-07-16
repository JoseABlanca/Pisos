const fs = require('fs');
let txt = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

// Remove Checkbox
const checkboxCode = `<label className="flex items-center gap-2 text-[10px] text-slate-600 cursor-pointer hover:text-blue-600">
                            <input 
                              type="checkbox" 
                              checked={rvChartTypes.includes('evolucion')}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setRvChartTypes(prev => [...prev, 'evolucion']);
                                } else {
                                  setRvChartTypes(prev => prev.filter(t => t !== 'evolucion'));
                                }
                              }}
                              className="w-3 h-3 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                            />
                            <span>Gráfico Evolución (Compras, Ventas, Div.)</span>
                          </label>`;

if (txt.includes(checkboxCode)) {
  txt = txt.replace(checkboxCode, '');
  console.log('Removed Checkbox successfully');
} else {
  console.log('Checkbox not found! Trying with regex...');
  txt = txt.replace(/<label className="flex items-center gap-2 text-\[10px\] text-slate-600 cursor-pointer hover:text-blue-600">[\s\S]*?<span>Gráfico Evolución \(Compras, Ventas, Div\.\)<\/span>[\s\S]*?<\/label>/, '');
}

// Remove Chart block
const chartRegex = /\{\s*\/\*\s*Evolución\s*\*\/\s*\}[\s\S]*?\}\s*if\s*\(rvChartTypes\.includes\('evolucion'\)\)\s*\{[\s\S]*?pageViews\.push\([\s\S]*?<ResponsiveContainer[\s\S]*?<\/div>\s*\);\s*\}/;

txt = txt.replace(chartRegex, '');

// A simpler regex to remove the block if (rvChartTypes.includes('evolucion')) { ... }
txt = txt.replace(/if\s*\(rvChartTypes\.includes\('evolucion'\)\)\s*\{[\s\S]*?\}\s*else\s*if/g, 'if');
txt = txt.replace(/if\s*\(rvChartTypes\.includes\('evolucion'\)\)\s*\{[\s\S]*?pageViews\.push\([\s\S]*?<\/div>\n\s*\);\s*\}/g, '');

fs.writeFileSync('src/pages/PrintPage.jsx', txt, 'utf8');
console.log('Evolucion removal executed');
