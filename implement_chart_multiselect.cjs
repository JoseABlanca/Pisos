const fs = require('fs');
let content = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

// 1. Change useState
content = content.replace(
  /const \[rvChartType, setRvChartType\] = useState\('volumen'\);/,
  "const [rvChartTypes, setRvChartTypes] = useState(['evolucion', 'historical_advanced']);"
);

// 2. Change sidebar UI
const oldSelectUI = `<label className="flex flex-col gap-1 text-[9px] font-bold text-slate-500 uppercase mt-2">
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

const newCheckboxUI = `<div className="flex flex-col gap-2 mt-2">
                      <label className="flex items-center space-x-2 text-[11px] text-slate-600 font-medium cursor-pointer">
                        <input 
                          type="checkbox"
                          checked={rvChartTypes.includes('evolucion')}
                          onChange={(e) => {
                            if (e.target.checked) setRvChartTypes([...rvChartTypes, 'evolucion']);
                            else setRvChartTypes(rvChartTypes.filter(t => t !== 'evolucion'));
                          }}
                          className="rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>Histórico de Compras</span>
                      </label>
                      <label className="flex items-center space-x-2 text-[11px] text-slate-600 font-medium cursor-pointer">
                        <input 
                          type="checkbox"
                          checked={rvChartTypes.includes('historical_advanced')}
                          onChange={(e) => {
                            if (e.target.checked) setRvChartTypes([...rvChartTypes, 'historical_advanced']);
                            else setRvChartTypes(rvChartTypes.filter(t => t !== 'historical_advanced'));
                          }}
                          className="rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>Métricas Históricas (Avanzadas)</span>
                      </label>
                    </div>`;

content = content.replace(oldSelectUI, newCheckboxUI);

// 3. Fix the conditional rendering for the extra "Métricas Históricas (Avanzadas)" filters block
content = content.replace(
  /rvChartType === 'historical_advanced'/g,
  "rvChartTypes.includes('historical_advanced')"
);

// 4. Update the chart rendering logic block condition
content = content.replace(
  /if \(rvChartType !== 'none'\) \{/g,
  "if (rvChartTypes.length > 0) {"
);

content = content.replace(
  /if \(rvChartType === 'evolucion'\) \{/g,
  "if (rvChartTypes.includes('evolucion')) {"
);

content = content.replace(
  /else if \(rvChartTypes\.includes\('evolucion'\)\) \{/,
  "if (rvChartTypes.includes('evolucion')) {" // ensure they both run sequentially instead of else-if
);

content = content.replace(
  /rvChartType !== 'none'/g,
  "rvChartTypes.length > 0"
);

fs.writeFileSync('src/pages/PrintPage.jsx', content, 'utf8');
console.log('Chart multiselect implemented in PrintPage.jsx');
