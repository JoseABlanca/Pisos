const fs = require('fs');
let txt = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

// 1. Fix Left Sidebar closing tag
txt = txt.replace(
  '          </div>\n        </div>\n\n        {/* Paper Sheet Preview Area */}',
  '          </div>\n        </ResizableSidebar>\n\n        {/* Paper Sheet Preview Area */}'
);

// 2. Fix Right Sidebar closing tag
txt = txt.replace(
  '        </div>\n      )}\n    </div>\n  );\n}',
  '        </ResizableSidebar>\n      )}\n    </div>\n  );\n}'
);

// 3. Filtros Inmobiliarios
txt = txt.replace(
  /\{\['activos', 'alquileres', 'clientes', 'extracto_propietarios', 'metricas_inversion', 'rv_transactions', 'rv_portfolio'\]\.includes\(selectedTemplate\) && \(/g,
  "{['activos', 'alquileres', 'clientes', 'extracto_propietarios', 'metricas_inversion'].includes(selectedTemplate) && ("
);

// 4. Período Temporal
txt = txt.replace(
  /\{\['diario', 'mayor', 'sumas_saldos', 'rv_transactions', 'cf_transactions', 'taxes_total', 'taxes_real_estate', 'taxes_rv', 'taxes_cf', 'balance_situacion', 'cuenta_resultados', 'flujo_caja', 'activos', 'alquileres', 'extracto_propietarios', 'metricas_inversion'\]\.includes\(selectedTemplate\) && \(/g,
  "{['diario', 'mayor', 'sumas_saldos', 'rv_transactions', 'cf_transactions', 'taxes_total', 'taxes_real_estate', 'taxes_rv', 'taxes_cf', 'balance_situacion', 'cuenta_resultados', 'flujo_caja', 'activos', 'alquileres', 'extracto_propietarios', 'metricas_inversion', 'rv_portfolio'].includes(selectedTemplate) && ("
);

// 5. Insert Periodos Gráficos
const periodosUI = `
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-bold text-slate-400 uppercase font-sans">Periodo Gráfico Lineal</span>
                    <select value={rvMetricsLinePeriod} onChange={(e) => setRvMetricsLinePeriod(e.target.value)} className="text-[11px] p-1 border border-slate-200 rounded text-slate-700 bg-slate-50 focus:outline-none focus:border-blue-400">
                      <option value="DAY">Diario</option>
                      <option value="MONTH">Mensual</option>
                      <option value="YEAR">Anual</option>
                      <option value="ALL">Todo (Acumulado)</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-bold text-slate-400 uppercase font-sans">Periodo Gráfico Barras</span>
                    <select value={rvMetricsBarPeriod} onChange={(e) => setRvMetricsBarPeriod(e.target.value)} className="text-[11px] p-1 border border-slate-200 rounded text-slate-700 bg-slate-50 focus:outline-none focus:border-blue-400">
                      <option value="DAY">Diario</option>
                      <option value="MONTH">Mensual</option>
                      <option value="YEAR">Anual</option>
                    </select>
                  </div>`;
const targetBroker = '<div className="flex flex-col gap-1">\n                    <span className="text-[9px] font-bold text-slate-400 uppercase font-sans">Broker</span>';
if (txt.includes(targetBroker) && !txt.includes('Periodo Gráfico Lineal')) {
  txt = txt.replace(targetBroker, periodosUI + '\n                  ' + targetBroker);
}

// 6. Remove "evolucion" chart initial state
txt = txt.replace(
  "const [rvChartTypes, setRvChartTypes] = useState(['evolucion', 'historical_advanced']);",
  "const [rvChartTypes, setRvChartTypes] = useState(['historical_advanced']);"
);

fs.writeFileSync('src/pages/PrintPage.jsx', txt, 'utf8');
console.log('Script 2 applied');
