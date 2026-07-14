const fs = require('fs');
let content = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

// 1. Add hook import and state variables
if (!content.includes('useRvHistoricalData')) {
  content = content.replace(/import \{.*?\} from 'react';/, match => match + "\nimport { useRvHistoricalData } from '../hooks/useRvHistoricalData';");
}

const statesCode = `
  const [rvMetricsUnit, setRvMetricsUnit] = useState('EUR');
  const [rvMetricsPrimary, setRvMetricsPrimary] = useState('VALOR');
  const [rvMetricsKpiType, setRvMetricsKpiType] = useState('TOTAL');
  const [rvMetricsAccumulated, setRvMetricsAccumulated] = useState(true);
`;
content = content.replace(/const \[rvChartType, setRvChartType\] = useState\('NONE'\);/, match => match + statesCode);

// 2. Add sidebar filters
const filtersCode = `
                  {/* RV Metrics Filters for PrintPage */}
                  {selectedTemplate === 'rv_portfolio' && rvChartType !== 'NONE' && rvChartType !== 'DISTRIBUCION' && rvChartType !== 'BENEFICIO_EUROS' && rvChartType !== 'BENEFICIO_PCT' && (
                    <div className="mt-4 space-y-3 p-3 bg-white border border-slate-200 rounded-md shadow-sm">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Filtros Histórico</span>
                      
                      <div className="grid grid-cols-2 gap-1 text-[11px]">
                        <button
                          onClick={() => setRvMetricsPrimary('VALOR')}
                          className={\`px-2 py-1 rounded \${rvMetricsPrimary === 'VALOR' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}\`}
                        >
                          Gráfica Valor
                        </button>
                        <button
                          onClick={() => setRvMetricsPrimary('PLUSVALIA')}
                          className={\`px-2 py-1 rounded \${rvMetricsPrimary === 'PLUSVALIA' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}\`}
                        >
                          Gráfica Plusvalia
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-1 text-[11px]">
                        <button
                          onClick={() => setRvMetricsUnit('EUR')}
                          className={\`px-2 py-1 rounded \${rvMetricsUnit === 'EUR' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}\`}
                        >
                          Euros (€)
                        </button>
                        <button
                          onClick={() => setRvMetricsUnit('PERCENT')}
                          className={\`px-2 py-1 rounded \${rvMetricsUnit === 'PERCENT' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}\`}
                        >
                          Porcentaje (%)
                        </button>
                      </div>

                      <div className="pt-2 border-t border-slate-100">
                        <span className="text-[10px] text-slate-500 mb-1 block">Datos tarjetas (KPIs):</span>
                        <div className="grid grid-cols-2 gap-1 text-[11px]">
                          <button
                            onClick={() => setRvMetricsKpiType('TOTAL')}
                            className={\`px-1 py-1 rounded \${rvMetricsKpiType === 'TOTAL' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}\`}
                          >
                            Realizado+Latente
                          </button>
                          <button
                            onClick={() => setRvMetricsKpiType('LATENTE')}
                            className={\`px-1 py-1 rounded \${rvMetricsKpiType === 'LATENTE' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}\`}
                          >
                            Solo Latente
                          </button>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-100">
                         <label className="flex items-center space-x-2 text-[11px] text-slate-600 font-medium">
                           <input 
                             type="checkbox"
                             checked={rvMetricsAccumulated}
                             onChange={(e) => setRvMetricsAccumulated(e.target.checked)}
                             className="rounded text-indigo-600 focus:ring-indigo-500"
                           />
                           <span>Gráfico Acumulado</span>
                         </label>
                      </div>
                    </div>
                  )}
`;

content = content.replace(
  /\{\/\* Ordenación del Informe \*\/\}/,
  match => filtersCode + '\n                  ' + match
);

fs.writeFileSync('src/pages/PrintPage.jsx', content, 'utf8');
console.log('Added PrintPage.jsx sidebar options');
