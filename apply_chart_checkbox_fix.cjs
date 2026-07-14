const fs = require('fs');
let content = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

const checkboxBlock = `                  <div className="flex flex-col gap-1 border-t border-slate-100 pt-2">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">Gráficos del Histórico</span>
                    <label className="flex items-center gap-2 cursor-pointer select-none text-[10px] font-semibold text-slate-600 font-sans">
                      <input 
                        type="checkbox"
                        checked={showRvChart}
                        onChange={(e) => setShowRvChart(e.target.checked)}
                        className="w-3 h-3"
                      />
                      <span>Mostrar Gráficos</span>
                    </label>
                  </div>`;

// We want to wrap this block in a check for selectedTemplate === 'rv_portfolio'
const newCheckboxBlock = `                  {selectedTemplate === 'rv_portfolio' && (
                  <div className="flex flex-col gap-1 border-t border-slate-100 pt-2">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">Gráficos del Histórico</span>
                    <label className="flex items-center gap-2 cursor-pointer select-none text-[10px] font-semibold text-slate-600 font-sans">
                      <input 
                        type="checkbox"
                        checked={showRvChart}
                        onChange={(e) => setShowRvChart(e.target.checked)}
                        className="w-3 h-3"
                      />
                      <span>Mostrar Gráficos</span>
                    </label>
                  </div>
                  )}`;

// Since characters like á can cause issues, use a regex
content = content.replace(/<div className="flex flex-col gap-1 border-t border-slate-100 pt-2">\s*<span className="text-\[9px\] font-bold text-slate-400 uppercase">Gr.ficos del Hist.rico<\/span>\s*<label className="flex items-center gap-2 cursor-pointer select-none text-\[10px\] font-semibold text-slate-600 font-sans">\s*<input\s*type="checkbox"\s*checked=\{showRvChart\}\s*onChange=\{\(e\) => setShowRvChart\(e.target.checked\)\}\s*className="w-3 h-3"\s*\/>\s*<span>Mostrar Gr.ficos<\/span>\s*<\/label>\s*<\/div>/g, newCheckboxBlock);

fs.writeFileSync('src/pages/PrintPage.jsx', content);
console.log('Fixed chart checkbox visibility');
