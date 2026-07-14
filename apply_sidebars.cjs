const fs = require('fs');
let content = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

// 1. Add 'rv_transactions' to 'activos', 'alquileres', etc. for Ordenación
content = content.replace(
  /{ \['activos', 'alquileres', 'clientes', 'extracto_propietarios'\].includes\(selectedTemplate\) && \(/g,
  "{['activos', 'alquileres', 'clientes', 'extracto_propietarios', 'rv_transactions'].includes(selectedTemplate) && ("
);

// 2. Add 'rv_transactions' to Columnas Visibles
content = content.replace(
  /{ \['activos', 'alquileres', 'clientes', 'extracto_propietarios', 'metricas_inversion'\].includes\(selectedTemplate\) && ALL_COLUMNS\[selectedTemplate\] && \(/g,
  "{['activos', 'alquileres', 'clientes', 'extracto_propietarios', 'metricas_inversion', 'rv_transactions'].includes(selectedTemplate) && ALL_COLUMNS[selectedTemplate] && ("
);

// 3. Add options specific to Renta Variable
const rvOptionsBlock = `
          {/* Options specific to Renta Variable */}
          {['rv_transactions'].includes(selectedTemplate) && (
            <div className="bg-white border border-[#a0a0a0] p-3 flex flex-col gap-3">
              <div
                className="text-[10px] font-bold text-slate-500 uppercase flex items-center justify-between cursor-pointer select-none hover:text-slate-800"
                onClick={() => setIsOptsRvCollapsed(p => !p)}
              >
                <div className="flex items-center gap-1">
                  <Sliders className="w-3.5 h-3.5 text-slate-400" />
                  <span>Opciones Renta Variable</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[9px]">{isOptsRvCollapsed ? '?' : '?'}</span>
                </div>
              </div>
              {!isOptsRvCollapsed && (
                <div className="flex flex-col gap-2.5 border-t border-slate-100 pt-2">
                  {/* Filtros */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-bold text-slate-400 uppercase font-sans">Broker</span>
                    <select
                      value={rvBrokerFilter[0] || 'todos'}
                      onChange={(e) => setRvBrokerFilter(e.target.value === 'todos' ? [] : [e.target.value])}
                      className="win-input w-full text-[11px] font-sans"
                    >
                      <option value="todos">Todos los Brokers</option>
                      {brokers.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-bold text-slate-400 uppercase font-sans">Acciones (Ticker)</span>
                    <select
                      value={rvAssetFilter[0] || 'todos'}
                      onChange={(e) => setRvAssetFilter(e.target.value === 'todos' ? [] : [e.target.value])}
                      className="win-input w-full text-[11px] font-sans"
                    >
                      <option value="todos">Todas las Acciones</option>
                      {assets.map(a => (
                        <option key={a.id} value={a.id}>{a.id} - {a.name}</option>
                      ))}
                    </select>
                  </div>
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
                </div>
              )}
            </div>
          )}
`;

content = content.replace(
  "{/* Options specific to Fichero de Clientes */}",
  rvOptionsBlock + "\n          {/* Options specific to Fichero de Clientes */}"
);

// 4. Add state for isOptsRvCollapsed
content = content.replace(
  "const [isOptsClientesCollapsed, setIsOptsClientesCollapsed] = useState(false);",
  "const [isOptsClientesCollapsed, setIsOptsClientesCollapsed] = useState(false);\n  const [isOptsRvCollapsed, setIsOptsRvCollapsed] = useState(false);"
);

fs.writeFileSync('src/pages/PrintPage.jsx', content);
console.log('Sidebar options added');
