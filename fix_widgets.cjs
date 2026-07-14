const fs = require('fs');
let file = fs.readFileSync('src/pages/Home.jsx', 'utf8');

// Replace Ingresos Previstos
file = file.replace(
\              <div>
                <p className="text-2xl font-black text-slate-400 tracking-tight font-mono">
                  0,00 €
                </p>
                <p className="text-[9px] text-slate-450 mt-2 italic">Módulo de planificación en desarrollo</p>
              </div>\,
\              <div>
                <p className="text-2xl font-black text-blue-600 tracking-tight font-mono">
                  {kpis.ingresosPrevistos.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </p>
                <p className="text-[9px] text-slate-450 mt-2 italic uppercase">
                  Mes: {new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toLocaleString('es-ES', { month: 'long' })}
                </p>
              </div>\
);

// Replace Gastos Previstos
file = file.replace(
\              <div>
                <p className="text-2xl font-black text-slate-400 tracking-tight font-mono">
                  0,00 €
                </p>
                <p className="text-[9px] text-slate-450 mt-2 italic">Módulo de planificación en desarrollo</p>
              </div>\,
\              <div>
                <p className="text-2xl font-black text-amber-600 tracking-tight font-mono">
                  {kpis.gastosPrevistos.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </p>
                <p className="text-[9px] text-slate-450 mt-2 italic uppercase">
                  Mes: {new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toLocaleString('es-ES', { month: 'long' })}
                </p>
              </div>\
);

fs.writeFileSync('src/pages/Home.jsx', file);
console.log('Widgets updated');
