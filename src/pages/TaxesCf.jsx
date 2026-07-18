import { useState, useEffect, useMemo } from 'react';
import ZoomControl from '../components/ZoomControl';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useOutletContext } from 'react-router-dom';
import { exportToPDF } from '../utils/pdfExport';
import { handleExportFormat } from '../utils/exportUtils';

const fmt = (v) =>
  (v || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

const pct = (v) =>
  `${(v || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;

// IRPF 2024 — base del ahorro
const TAX_BRACKETS = [
  { up: 6000,    rate: 0.19 },
  { up: 50000,   rate: 0.21 },
  { up: 200000,  rate: 0.23 },
  { up: 300000,  rate: 0.27 },
  { up: Infinity, rate: 0.28 },
];

function calcTax(gain) {
  if (gain <= 0) return 0;
  let tax = 0, prev = 0;
  for (const b of TAX_BRACKETS) {
    const slice = Math.min(gain - prev, b.up - prev);
    if (slice <= 0) break;
    tax += slice * b.rate;
    prev = b.up;
    if (gain <= b.up) break;
  }
  return tax;
}

export default function TaxesCf() {
  const { tableZoom } = useOutletContext() || { tableZoom: 1 };
  const { user, queryUserIds } = useAuth();
  const { taxYear } = useOutletContext();

  const [investments, setInvestments] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [projects, setProjects] = useState([]);
  const [view, setView] = useState('rendimientos'); // 'rendimientos' | 'plataformas' | 'resumen'

  useEffect(() => {
    if (!user) return;
    const qIds = queryUserIds?.length > 0 ? queryUserIds : [user.uid];
    const u1 = onSnapshot(query(collection(db, 'cf_investments'), where('userId', 'in', qIds)), s => setInvestments(s.docs.map(d => ({ ...d.data(), id: d.id }))));
    const u2 = onSnapshot(query(collection(db, 'cf_platforms'), where('userId', 'in', qIds)), s => setPlatforms(s.docs.map(d => ({ ...d.data(), id: d.id }))));
    const u3 = onSnapshot(query(collection(db, 'cf_projects'), where('userId', 'in', qIds)), s => setProjects(s.docs.map(d => ({ ...d.data(), id: d.id }))));
    return () => { u1(); u2(); u3(); };
  }, [user, queryUserIds]);

  // ── Rendimientos por inversión ─────────────────────────────────────────
  const rendimientos = useMemo(() => {
    return investments
      .filter(inv => {
        if (inv.status === 'activo') return false; // solo finalizados/amortizados generan rendimiento fiscal
        const endYear = inv.endDate ? parseInt(inv.endDate.substring(0, 4), 10) : null;
        if (taxYear !== 'Todas' && endYear !== parseInt(taxYear, 10)) return false;
        return true;
      })
      .map(inv => {
        const platform = platforms.find(p => p.id === inv.platformId);
        const project  = projects.find(p => p.id === inv.projectId);
        const invested = parseFloat(inv.amount) || 0;
        const received = parseFloat(inv.currentValue) || invested;
        const gain     = received - invested;
        const rate     = parseFloat(inv.returnRate) || (invested > 0 ? (gain / invested) * 100 : 0);
        const tax      = calcTax(gain);
        return {
          id: inv.id,
          projectName: project?.name || inv.projectId || '—',
          platformName: platform?.name || inv.platformId || '—',
          type: inv.type || '—',
          status: inv.status,
          endDate: inv.endDate || '—',
          invested,
          received,
          gain,
          rate,
          tax,
        };
      })
      .sort((a, b) => (b.endDate || '').localeCompare(a.endDate || ''));
  }, [investments, platforms, projects, taxYear]);

  // ── Inversiones activas con rendimiento esperado ───────────────────────
  const activas = useMemo(() => {
    return investments
      .filter(inv => {
        if (inv.status !== 'activo') return false;
        const startYear = inv.startDate ? parseInt(inv.startDate.substring(0, 4), 10) : null;
        if (taxYear !== 'Todas' && startYear !== parseInt(taxYear, 10)) return false;
        return true;
      })
      .map(inv => {
        const platform = platforms.find(p => p.id === inv.platformId);
        const project  = projects.find(p => p.id === inv.projectId);
        const invested = parseFloat(inv.amount) || 0;
        const rate     = parseFloat(inv.returnRate) || 0;
        const expectedGain = invested * (rate / 100);
        const expectedTax  = calcTax(expectedGain);
        return {
          id: inv.id,
          projectName: project?.name || inv.projectId || '—',
          platformName: platform?.name || inv.platformId || '—',
          type: inv.type || '—',
          invested,
          rate,
          expectedGain,
          expectedTax,
          endDate: inv.endDate || '—',
        };
      });
  }, [investments, platforms, projects, taxYear]);

  // ── Resumen por plataforma ─────────────────────────────────────────────
  const porPlataforma = useMemo(() => {
    const map = {};
    [...rendimientos, ...activas].forEach(inv => {
      if (!map[inv.platformName]) map[inv.platformName] = { platformName: inv.platformName, count: 0, invested: 0, gain: 0, tax: 0 };
      map[inv.platformName].count++;
      map[inv.platformName].invested += inv.invested || 0;
      map[inv.platformName].gain += inv.gain || inv.expectedGain || 0;
      map[inv.platformName].tax  += inv.tax  || inv.expectedTax  || 0;
    });
    return Object.values(map).sort((a, b) => b.invested - a.invested);
  }, [rendimientos, activas]);

  // ── Totales ────────────────────────────────────────────────────────────
  const totRend = useMemo(() => ({
    invested: rendimientos.reduce((s, r) => s + r.invested, 0),
    received: rendimientos.reduce((s, r) => s + r.received, 0),
    gain:     rendimientos.reduce((s, r) => s + r.gain, 0),
    tax:      rendimientos.reduce((s, r) => s + r.tax, 0),
  }), [rendimientos]);

  const totActivas = useMemo(() => ({
    invested:      activas.reduce((s, r) => s + r.invested, 0),
    expectedGain:  activas.reduce((s, r) => s + r.expectedGain, 0),
    expectedTax:   activas.reduce((s, r) => s + r.expectedTax, 0),
  }), [activas]);

  // ── Export ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const onExport = e => {
      const format = e.detail?.format || 'csv';
      let data, cols, title, filename;

      if (view === 'rendimientos') {
        data = rendimientos.map(r => ({ ID: r.id, Proyecto: r.projectName, Plataforma: r.platformName, Tipo: r.type, Estado: r.status, 'Fecha fin': r.endDate, 'Invertido (€)': r.invested.toFixed(2), 'Recibido (€)': r.received.toFixed(2), 'Ganancia (€)': r.gain.toFixed(2), 'Impuesto est. (€)': r.tax.toFixed(2) }));
        cols = [{ header: 'ID', dataKey: 'ID' }, { header: 'Proyecto', dataKey: 'Proyecto' }, { header: 'Plataforma', dataKey: 'Plataforma' }, { header: 'Ganancia (€)', dataKey: 'Ganancia (€)' }, { header: 'Impuesto est. (€)', dataKey: 'Impuesto est. (€)' }];
        title = 'Rendimientos Crowdfunding'; filename = 'impuestos_cf_rendimientos.pdf';
      } else if (view === 'plataformas') {
        data = porPlataforma.map(r => ({ Plataforma: r.platformName, Inversiones: r.count, 'Invertido (€)': r.invested.toFixed(2), 'Ganancia/Esperada (€)': r.gain.toFixed(2), 'Impuesto est. (€)': r.tax.toFixed(2) }));
        cols = [{ header: 'Plataforma', dataKey: 'Plataforma' }, { header: 'Inversiones', dataKey: 'Inversiones' }, { header: 'Invertido (€)', dataKey: 'Invertido (€)' }, { header: 'Ganancia/Esperada (€)', dataKey: 'Ganancia/Esperada (€)' }, { header: 'Impuesto est. (€)', dataKey: 'Impuesto est. (€)' }];
        title = 'Resumen por Plataforma CF'; filename = 'impuestos_cf_plataformas.pdf';
      } else {
        const summary = [
          { Concepto: 'Rendimientos realizados', 'Invertido (€)': totRend.invested.toFixed(2), 'Ganancia (€)': totRend.gain.toFixed(2), 'Cuota estimada (€)': totRend.tax.toFixed(2) },
          { Concepto: 'Inversiones activas (esperado)', 'Invertido (€)': totActivas.invested.toFixed(2), 'Ganancia (€)': totActivas.expectedGain.toFixed(2), 'Cuota estimada (€)': totActivas.expectedTax.toFixed(2) },
        ];
        data = summary;
        cols = [{ header: 'Concepto', dataKey: 'Concepto' }, { header: 'Invertido (€)', dataKey: 'Invertido (€)' }, { header: 'Ganancia (€)', dataKey: 'Ganancia (€)' }, { header: 'Cuota estimada (€)', dataKey: 'Cuota estimada (€)' }];
        title = 'Resumen Fiscal Crowdfunding'; filename = 'impuestos_cf_resumen.pdf';
      }

      if (format === 'pdf') exportToPDF(data, cols, title, filename);
      else handleExportFormat(data, title, format);
    };
    window.addEventListener('taxes-cf:export', onExport);
    return () => window.removeEventListener('taxes-cf:export', onExport);
  }, [view, rendimientos, porPlataforma, totRend, totActivas]);

  // ── Helpers visuales ───────────────────────────────────────────────────
  const TAB_CLASSES = (active) =>
    `px-4 py-1 text-[11px] font-semibold border border-b-0 cursor-pointer select-none transition-colors ` +
    (active
      ? 'bg-white text-[#000080] border-gray-200'
      : 'bg-[#d4d0c8] text-gray-600 border-gray-200 hover:bg-[#c0bdb5]');

  const gainCell = (v) => (
    <td className={`p-2 text-right font-semibold ${v >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(v)}</td>
  );

  const statusBadge = (s) => {
    const map = { finalizado: 'bg-blue-100 text-blue-800', moroso: 'bg-red-100 text-red-800', amortizado: 'bg-gray-100 text-gray-700' };
    return <span className={`px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase ${map[s] || 'bg-gray-100 text-gray-600'}`}>{s}</span>;
  };

  return (
    <div className="flex flex-col h-full bg-[#d4d0c8] p-1 font-sans">


      {/* Sub-tabs */}
      <div className="flex gap-0 border-b border-gray-200">
        <button className={TAB_CLASSES(view === 'rendimientos')} onClick={() => setView('rendimientos')}>
          Rendimientos realizados
        </button>
        <button className={TAB_CLASSES(view === 'plataformas')} onClick={() => setView('plataformas')}>
          Por plataforma
        </button>
        <button className={TAB_CLASSES(view === 'resumen')} onClick={() => setView('resumen')}>
          Resumen fiscal
        </button>
      </div>

      <div className="flex-1 flex flex-col bg-white overflow-hidden border border-gray-200">
        <div className="flex-1 overflow-auto">

          {/* ── RENDIMIENTOS REALIZADOS ─────────────────────────────────── */}
          {view === 'rendimientos' && (
            <table style={{ zoom: tableZoom }} className="clean-table w-full">
              <thead>
                <tr>
                  <th className="p-2 text-left font-bold uppercase">Inversión</th>
                  <th className="p-2 text-left font-bold uppercase">Plataforma</th>
                  <th className="p-2 text-left font-bold uppercase">Tipo</th>
                  <th className="p-2 text-center font-bold uppercase w-20">Estado</th>
                  <th className="p-2 text-center font-bold uppercase w-24">Fecha fin</th>
                  <th className="p-2 text-right font-bold uppercase">Invertido</th>
                  <th className="p-2 text-right font-bold uppercase">Recibido</th>
                  <th className="p-2 text-right font-bold uppercase">Ganancia</th>
                  <th className="p-2 text-right font-bold uppercase">% Rentab.</th>
                  <th className="p-2 text-right font-bold uppercase">Impuesto est.</th>
                </tr>
              </thead>
              <tbody>
                {rendimientos.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-gray-500 italic">
                      No hay inversiones finalizadas para el período seleccionado.
                    </td>
                  </tr>
                ) : rendimientos.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-blue-50/50 transition-colors">
                    <td className="p-2 font-medium text-[#000080]">
                      <div className="font-mono font-bold text-[10px] text-gray-500">{r.id}</div>
                      <div>{r.projectName}</div>
                    </td>
                    <td className="p-2">{r.platformName}</td>
                    <td className="p-2 text-gray-600">{r.type}</td>
                    <td className="p-2 text-center">{statusBadge(r.status)}</td>
                    <td className="p-2 text-center text-gray-600 text-[11px]">{r.endDate}</td>
                    <td className="p-2 text-right text-gray-600">{fmt(r.invested)}</td>
                    <td className="p-2 text-right">{fmt(r.received)}</td>
                    {gainCell(r.gain)}
                    <td className={`p-2 text-right text-xs ${r.rate >= 0 ? 'text-green-700' : 'text-red-700'}`}>{pct(r.rate)}</td>
                    <td className="p-2 text-right text-[#8B0000] font-semibold">{r.gain > 0 ? fmt(r.tax) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              {rendimientos.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-100 border-t border-gray-200 font-bold">
                    <td className="p-2 uppercase text-gray-800" colSpan={5}>Total</td>
                    <td className="p-2 text-right text-gray-600">{fmt(totRend.invested)}</td>
                    <td className="p-2 text-right">{fmt(totRend.received)}</td>
                    <td className={`p-2 text-right ${totRend.gain >= 0 ? 'text-green-800' : 'text-red-800'}`}>{fmt(totRend.gain)}</td>
                    <td className="p-2 text-right text-xs">
                      {totRend.invested > 0 ? pct(totRend.gain / totRend.invested * 100) : '—'}
                    </td>
                    <td className="p-2 text-right text-[#8B0000]">{fmt(totRend.tax)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}

          {/* ── POR PLATAFORMA ──────────────────────────────────────────── */}
          {view === 'plataformas' && (
            <table style={{ zoom: tableZoom }} className="clean-table w-full">
              <thead>
                <tr>
                  <th className="p-2 text-left font-bold uppercase">Plataforma</th>
                  <th className="p-2 text-center font-bold uppercase w-24">Inversiones</th>
                  <th className="p-2 text-right font-bold uppercase">Total invertido</th>
                  <th className="p-2 text-right font-bold uppercase">Ganancia / Esperada</th>
                  <th className="p-2 text-right font-bold uppercase">Impuesto est.</th>
                </tr>
              </thead>
              <tbody>
                {porPlataforma.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-500 italic">
                      No hay datos para el período seleccionado.
                    </td>
                  </tr>
                ) : porPlataforma.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-blue-50/50 transition-colors">
                    <td className="p-2 font-medium text-[#000080]">{r.platformName}</td>
                    <td className="p-2 text-center font-bold text-gray-700">{r.count}</td>
                    <td className="p-2 text-right">{fmt(r.invested)}</td>
                    {gainCell(r.gain)}
                    <td className="p-2 text-right text-[#8B0000] font-semibold">{r.gain > 0 ? fmt(r.tax) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              {porPlataforma.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-100 border-t border-gray-200 font-bold">
                    <td className="p-2 uppercase text-gray-800">Total</td>
                    <td className="p-2 text-center">{porPlataforma.reduce((s, r) => s + r.count, 0)}</td>
                    <td className="p-2 text-right">{fmt(porPlataforma.reduce((s, r) => s + r.invested, 0))}</td>
                    <td className={`p-2 text-right ${porPlataforma.reduce((s, r) => s + r.gain, 0) >= 0 ? 'text-green-800' : 'text-red-800'}`}>{fmt(porPlataforma.reduce((s, r) => s + r.gain, 0))}</td>
                    <td className="p-2 text-right text-[#8B0000]">{fmt(porPlataforma.reduce((s, r) => s + r.tax, 0))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}

          {/* ── RESUMEN FISCAL ──────────────────────────────────────────── */}
          {view === 'resumen' && (
            <table style={{ zoom: tableZoom }} className="clean-table w-full">
              <thead>
                <tr>
                  <th className="p-2 text-left font-bold uppercase">Concepto</th>
                  <th className="p-2 text-right font-bold uppercase">Total invertido</th>
                  <th className="p-2 text-right font-bold uppercase">Ganancia</th>
                  <th className="p-2 text-right font-bold uppercase">Base imponible</th>
                  <th className="p-2 text-right font-bold uppercase">Cuota estimada</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-100 hover:bg-blue-50/50">
                  <td className="p-2 font-medium">Rendimientos realizados <span className="text-[10px] text-gray-500">(finalizados/amortizados)</span></td>
                  <td className="p-2 text-right">{fmt(totRend.invested)}</td>
                  {gainCell(totRend.gain)}
                  <td className={`p-2 text-right font-semibold ${totRend.gain >= 0 ? 'text-gray-800' : 'text-red-700'}`}>{fmt(totRend.gain)}</td>
                  <td className="p-2 text-right text-[#8B0000] font-bold">{totRend.gain > 0 ? fmt(totRend.tax) : '—'}</td>
                </tr>
                <tr className="border-b border-gray-100 hover:bg-blue-50/50 bg-amber-50/30">
                  <td className="p-2 font-medium text-amber-800">Inversiones activas <span className="text-[10px] text-amber-600">(rendimiento esperado — orientativo)</span></td>
                  <td className="p-2 text-right">{fmt(totActivas.invested)}</td>
                  <td className="p-2 text-right text-amber-700 font-semibold">{fmt(totActivas.expectedGain)}</td>
                  <td className="p-2 text-right text-amber-700 font-semibold">{fmt(totActivas.expectedGain)}</td>
                  <td className="p-2 text-right text-amber-800 font-bold">{totActivas.expectedGain > 0 ? fmt(totActivas.expectedTax) : '—'}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 border-t border-gray-200 font-bold">
                  <td className="p-2 uppercase text-gray-800">Total global</td>
                  <td className="p-2 text-right">{fmt(totRend.invested + totActivas.invested)}</td>
                  <td className={`p-2 text-right ${(totRend.gain + totActivas.expectedGain) >= 0 ? 'text-green-800' : 'text-red-800'}`}>{fmt(totRend.gain + totActivas.expectedGain)}</td>
                  <td className={`p-2 text-right ${(totRend.gain + totActivas.expectedGain) >= 0 ? 'text-gray-800' : 'text-red-800'}`}>{fmt(totRend.gain + totActivas.expectedGain)}</td>
                  <td className="p-2 text-right text-[#8B0000]">{fmt(totRend.tax + totActivas.expectedTax)}</td>
                </tr>
              </tfoot>
            </table>
          )}

        </div>
      </div>

      {/* Status bar */}
      <div className="flex justify-between items-center bg-[#f0f0f0] p-1 border-t border-[#808080] text-[10px]">
        <div>
          {view === 'rendimientos' && `${rendimientos.length} inversiones finalizadas · ${activas.length} activas`}
          {view === 'plataformas' && `${porPlataforma.length} plataformas`}
          {view === 'resumen' && 'Resumen fiscal crowdfunding'}
        </div>
        <div className="text-gray-500">Capital mobiliario · IRPF 2024</div>
      </div>
    
      {/* Bottom Bar for Zoom */}
      <div className="flex justify-end bg-[#f0f0f0] p-1 border-t border-gray-300 shrink-0 mt-auto w-full z-10">
        <ZoomControl />
      </div>
</div>
  );
}
