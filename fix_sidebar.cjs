const fs = require('fs');
let content = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

const regex = /\{selectedTemplate === 'rv_portfolio' && \([\s\S]*?className="w-3 h-3"\s*\/>\s*<span>Mostrar Gráficos<\/span>\s*<\/label>\s*<\/div>\s*\)\}/;

const newSelectHtml = `{selectedTemplate === 'rv_portfolio' && (
                  <div className="flex flex-col gap-1 border-t border-slate-100 pt-2">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">Gráficos del Histórico</span>
                    <label className="flex flex-col gap-1 text-[9px] font-bold text-slate-500 uppercase mt-2">
                      <span>Gráfico</span>
                      <select 
                        value={rvChartType} 
                        onChange={(e) => setRvChartType(e.target.value)}
                        className="win-input w-full text-[11px] font-sans rounded h-[24px]"
                      >
                        <option value="none">Sin gráfico</option>
                        <option value="evolucion">Histórico de Compras</option>
                        <option value="pnl_eur">Beneficio Latente (€)</option>
                        <option value="pnl_pct">Beneficio Latente (%)</option>
                        <option value="allocation">Distribución (Acciones)</option>
                        <option value="historical_advanced">Métricas Históricas (Avanzadas)</option>
                      </select>
                    </label>
                  </div>
                  )}`;

content = content.replace(regex, newSelectHtml);

fs.writeFileSync('src/pages/PrintPage.jsx', content, 'utf8');
console.log("Fixed sidebar");
