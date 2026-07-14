const fs = require('fs');
let content = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

// 1. Add groupCol1 state
content = content.replace(
  "  const [showRvChart, setShowRvChart] = useState(false);",
  "  const [showRvChart, setShowRvChart] = useState(false);\n  const [groupCol1, setGroupCol1] = useState('none');"
);

// 2. Fix sortAsc1 to sortDir1 === 'asc'
content = content.replace(/sortAsc1 \? -1 : 1/g, "sortDir1 === 'asc' ? -1 : 1");
content = content.replace(/sortAsc1 \? 1 : -1/g, "sortDir1 === 'asc' ? 1 : -1");

// 3. Add grouping select to sidebar
const sidebarTarget = `                  <div className="flex flex-col gap-1 border-t border-slate-100 pt-2">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">Gráficos del Histórico</span>`;

const sidebarReplacement = `                  <div className="flex flex-col gap-1 border-t border-slate-100 pt-2">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">Agrupación del Informe</span>
                    <select
                      value={groupCol1}
                      onChange={(e) => setGroupCol1(e.target.value)}
                      className="win-input w-full text-[11px] font-sans"
                    >
                      <option value="none">Sin Agrupar</option>
                      <option value="brokerId">Agrupar por Broker</option>
                      <option value="assetId">Agrupar por Acciones (Ticker)</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1 border-t border-slate-100 pt-2">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">Gráficos del Histórico</span>`;

// Use a regex to tolerate encoding differences for "Gráficos del Histórico"
content = content.replace(/<div className="flex flex-col gap-1 border-t border-slate-100 pt-2">\s*<span className="text-\[9px\] font-bold text-slate-400 uppercase">Gr.ficos del Hist.rico<\/span>/g, sidebarReplacement);

fs.writeFileSync('src/pages/PrintPage.jsx', content);
console.log('Fixed groupCol1 and sortDir1');
