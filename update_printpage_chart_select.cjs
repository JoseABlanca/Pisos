const fs = require('fs');
let content = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

// Replace the previous filter logic with correct uppercase values, and add the advanced historical option
const newSelectHtml = `<label className="flex flex-col gap-1 text-[9px] font-bold text-slate-500 uppercase mt-2">
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
                    </label>`;

content = content.replace(/<label className="flex flex-col gap-1 text-\[9px\] font-bold text-slate-500 uppercase mt-2">\s*<span>Gr.fico<\/span>\s*<select[\s\S]*?<\/select>\s*<\/label>/, newSelectHtml);

content = content.replace(/rvChartType !== 'NONE' && rvChartType !== 'DISTRIBUCION' && rvChartType !== 'BENEFICIO_EUROS' && rvChartType !== 'BENEFICIO_PCT'/, "rvChartType === 'historical_advanced'");

fs.writeFileSync('src/pages/PrintPage.jsx', content, 'utf8');
console.log('Updated rvChartType select and filter conditions');
