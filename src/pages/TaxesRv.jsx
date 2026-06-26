import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useOutletContext } from 'react-router-dom';
import { exportToPDF } from '../utils/pdfExport';
import { handleExportFormat } from '../utils/exportUtils';

const fmt = (v, currency = 'EUR') =>
  (v || 0).toLocaleString('es-ES', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });

const pctFmt = (v) =>
  `${(v || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;

// Spanish capital-gains tax brackets (IRPF savings base 2024)
const TAX_BRACKETS = [
  { up: 6000,    rate: 0.19 },
  { up: 50000,   rate: 0.21 },
  { up: 200000,  rate: 0.23 },
  { up: 300000,  rate: 0.27 },
  { up: Infinity, rate: 0.28 },
];

function calcTax(gain) {
  if (gain <= 0) return 0;
  let tax = 0;
  let prev = 0;
  for (const bracket of TAX_BRACKETS) {
    const slice = Math.min(gain - prev, bracket.up - prev);
    if (slice <= 0) break;
    tax += slice * bracket.rate;
    prev = bracket.up;
    if (gain <= bracket.up) break;
  }
  return tax;
}

export default function TaxesRv() {
  const { user, queryUserIds } = useAuth();
  const { taxYear } = useOutletContext();

  const [transactions, setTransactions] = useState([]);
  const [assets, setAssets] = useState([]);
  const [view, setView] = useState('assets'); // 'assets' | 'dividends' | 'summary'

  useEffect(() => {
    if (!user) return;
    const qIds = queryUserIds?.length > 0 ? queryUserIds : [user.uid];

    const unsubTx = onSnapshot(
      query(collection(db, 'rv_transactions'), where('userId', 'in', qIds)),
      snap => setTransactions(snap.docs.map(d => ({ ...d.data(), id: d.id })))
    );
    const unsubAssets = onSnapshot(
      query(collection(db, 'rv_assets'), where('userId', 'in', qIds)),
      snap => setAssets(snap.docs.map(d => ({ ...d.data(), id: d.id })))
    );

    return () => { unsubTx(); unsubAssets(); };
  }, [user, queryUserIds]);

  // ── Capital gains (FIFO) ─────────────────────────────────────────────────
  const capitalGains = useMemo(() => {
    // Group buys/sells per asset
    const assetMap = {};
    transactions.forEach(tx => {
      if (!['Compra', 'Venta'].includes(tx.type)) return;
      const key = tx.assetId || tx.asset || '';
      if (!assetMap[key]) assetMap[key] = { buys: [], sells: [] };
      if (tx.type === 'Compra') assetMap[key].buys.push({ ...tx });
      if (tx.type === 'Venta') assetMap[key].sells.push({ ...tx });
    });

    const rows = [];

    Object.entries(assetMap).forEach(([assetId, { buys, sells }]) => {
      const asset = assets.find(a => a.id === assetId);
      const currency = asset?.currency || 'EUR';

      // Sort chronologically
      buys.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      sells.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

      // FIFO queue
      const queue = buys.map(b => ({
        qty: parseFloat(b.quantity) || 0,
        priceEUR: parseFloat(b.priceEUR || b.price) || 0,
        fee: parseFloat(b.fee) || 0,
      }));

      sells.forEach(sell => {
        const year = sell.date ? parseInt(sell.date.substring(0, 4), 10) : null;
        if (!year) return;
        if (taxYear !== 'Todas' && parseInt(taxYear, 10) !== year) return;

        let qtyToSell = parseFloat(sell.quantity) || 0;
        const sellPriceEUR = parseFloat(sell.priceEUR || sell.price) || 0;
        const sellFee = parseFloat(sell.fee) || 0;
        const sellTotal = qtyToSell * sellPriceEUR - sellFee;

        let costBasis = 0;
        let remaining = qtyToSell;

        while (remaining > 0 && queue.length > 0) {
          const lot = queue[0];
          const take = Math.min(lot.qty, remaining);
          const lotCost = (lot.priceEUR + lot.fee / lot.qty) * take;
          costBasis += lotCost;
          lot.qty -= take;
          remaining -= take;
          if (lot.qty < 0.0001) queue.shift();
        }

        const gain = sellTotal - costBasis;
        const tax = calcTax(gain);

        rows.push({
          assetId,
          assetName: asset?.name || assetId,
          date: sell.date,
          year,
          qty: qtyToSell,
          sellPriceEUR,
          sellTotal,
          costBasis,
          gain,
          tax,
          currency,
        });
      });
    });

    return rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [transactions, assets, taxYear]);

  // ── Dividends ────────────────────────────────────────────────────────────
  const dividends = useMemo(() => {
    return transactions
      .filter(tx => tx.type === 'Dividendo')
      .filter(tx => {
        if (taxYear === 'Todas') return true;
        const year = tx.date ? parseInt(tx.date.substring(0, 4), 10) : null;
        return year === parseInt(taxYear, 10);
      })
      .map(tx => {
        const asset = assets.find(a => a.id === (tx.assetId || tx.asset));
        const gross = parseFloat(tx.totalAmountEUR || tx.totalAmount) || 0;
        const withholding = parseFloat(tx.withholding || tx.fee) || 0;
        const net = gross - withholding;
        const tax = calcTax(gross);
        return {
          assetId: tx.assetId || tx.asset || '',
          assetName: asset?.name || tx.assetId || '',
          date: tx.date,
          year: tx.date ? parseInt(tx.date.substring(0, 4), 10) : null,
          gross,
          withholding,
          net,
          tax,
        };
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [transactions, assets, taxYear]);

  // ── Year summary ─────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const years = new Set([
      ...capitalGains.map(r => r.year),
      ...dividends.map(r => r.year),
    ]);
    return Array.from(years).sort((a, b) => b - a).map(year => {
      const gains = capitalGains.filter(r => r.year === year);
      const divs  = dividends.filter(r => r.year === year);
      const totalGain = gains.reduce((s, r) => s + r.gain, 0);
      const totalDiv  = divs.reduce((s, r) => s + r.gross, 0);
      const base = totalGain + totalDiv;
      const tax  = calcTax(base);
      return { year, totalGain, totalDiv, base, tax };
    });
  }, [capitalGains, dividends]);

  // ── Totals ───────────────────────────────────────────────────────────────
  const totalsGains = useMemo(() => ({
    sellTotal: capitalGains.reduce((s, r) => s + r.sellTotal, 0),
    costBasis: capitalGains.reduce((s, r) => s + r.costBasis, 0),
    gain:      capitalGains.reduce((s, r) => s + r.gain, 0),
    tax:       capitalGains.reduce((s, r) => s + r.tax, 0),
  }), [capitalGains]);

  const totalsDivs = useMemo(() => ({
    gross:       dividends.reduce((s, r) => s + r.gross, 0),
    withholding: dividends.reduce((s, r) => s + r.withholding, 0),
    net:         dividends.reduce((s, r) => s + r.net, 0),
    tax:         dividends.reduce((s, r) => s + r.tax, 0),
  }), [dividends]);

  // ── Export ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const onExport = e => {
      const format = e.detail?.format || 'csv';
      let data, cols, title, filename;

      if (view === 'assets') {
        data = capitalGains.map(r => ({
          Activo: r.assetName, Fecha: r.date,
          'Valor venta (€)': r.sellTotal.toFixed(2),
          'Coste (€)': r.costBasis.toFixed(2),
          'Plusvalía (€)': r.gain.toFixed(2),
          'Impuesto estimado (€)': r.tax.toFixed(2),
        }));
        cols = [
          { header: 'Activo', dataKey: 'Activo' },
          { header: 'Fecha', dataKey: 'Fecha' },
          { header: 'Valor venta (€)', dataKey: 'Valor venta (€)' },
          { header: 'Coste (€)', dataKey: 'Coste (€)' },
          { header: 'Plusvalía (€)', dataKey: 'Plusvalía (€)' },
          { header: 'Impuesto estimado (€)', dataKey: 'Impuesto estimado (€)' },
        ];
        title = 'Plusvalías Renta Variable';
        filename = 'impuestos_rv_plusvalias.pdf';
      } else if (view === 'dividends') {
        data = dividends.map(r => ({
          Activo: r.assetName, Fecha: r.date,
          'Bruto (€)': r.gross.toFixed(2),
          'Retención (€)': r.withholding.toFixed(2),
          'Neto (€)': r.net.toFixed(2),
          'Impuesto estimado (€)': r.tax.toFixed(2),
        }));
        cols = [
          { header: 'Activo', dataKey: 'Activo' },
          { header: 'Fecha', dataKey: 'Fecha' },
          { header: 'Bruto (€)', dataKey: 'Bruto (€)' },
          { header: 'Retención (€)', dataKey: 'Retención (€)' },
          { header: 'Neto (€)', dataKey: 'Neto (€)' },
          { header: 'Impuesto estimado (€)', dataKey: 'Impuesto estimado (€)' },
        ];
        title = 'Dividendos Renta Variable';
        filename = 'impuestos_rv_dividendos.pdf';
      } else {
        data = summary.map(r => ({
          Año: r.year,
          'Plusvalías (€)': r.totalGain.toFixed(2),
          'Dividendos (€)': r.totalDiv.toFixed(2),
          'Base imponible (€)': r.base.toFixed(2),
          'Cuota estimada (€)': r.tax.toFixed(2),
        }));
        cols = [
          { header: 'Año', dataKey: 'Año' },
          { header: 'Plusvalías (€)', dataKey: 'Plusvalías (€)' },
          { header: 'Dividendos (€)', dataKey: 'Dividendos (€)' },
          { header: 'Base imponible (€)', dataKey: 'Base imponible (€)' },
          { header: 'Cuota estimada (€)', dataKey: 'Cuota estimada (€)' },
        ];
        title = 'Resumen Fiscal RV';
        filename = 'impuestos_rv_resumen.pdf';
      }

      if (format === 'pdf') exportToPDF(data, cols, title, filename);
      else handleExportFormat(data, title, format);
    };

    window.addEventListener('taxes-rv:export', onExport);
    return () => window.removeEventListener('taxes-rv:export', onExport);
  }, [view, capitalGains, dividends, summary]);

  // ── Render helpers ───────────────────────────────────────────────────────
  const gainCell = (v) => (
    <td className={`p-2 text-right font-semibold ${v >= 0 ? 'text-green-700' : 'text-red-700'}`}>
      {fmt(v)}
    </td>
  );

  const TAB_CLASSES = (active) =>
    `px-4 py-1 text-[11px] font-semibold border border-b-0 cursor-pointer select-none transition-colors ` +
    (active
      ? 'bg-white text-[#000080] border-gray-400 border-b-white'
      : 'bg-[#d4d0c8] text-gray-600 border-gray-400 hover:bg-[#c0bdb5]');

  return (
    <div className="flex flex-col h-full bg-[#d4d0c8] p-1 font-sans">
      {/* Info banner */}
      <div className="mb-1 px-2 py-1 bg-[#fffbe6] border border-[#f0c040] text-[10px] text-[#7a6000] flex items-center gap-2 rounded-sm">
        <span className="font-bold">ℹ</span>
        Cálculos orientativos según IRPF 2024 (base del ahorro). Consulte a un asesor fiscal.
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-0 mb-0 mt-0 border-b border-gray-400">
        <button className={TAB_CLASSES(view === 'assets')} onClick={() => setView('assets')}>
          Plusvalías
        </button>
        <button className={TAB_CLASSES(view === 'dividends')} onClick={() => setView('dividends')}>
          Dividendos
        </button>
        <button className={TAB_CLASSES(view === 'summary')} onClick={() => setView('summary')}>
          Resumen por año
        </button>
      </div>

      <div className="flex-1 flex flex-col bg-white overflow-hidden border border-gray-400">
        <div className="flex-1 overflow-auto bg-white p-0">

          {/* ── PLUSVALÍAS ─────────────────────────────────────────────── */}
          {view === 'assets' && (
            <table className="clean-table w-full">
              <thead>
                <tr>
                  <th className="p-2 text-left font-bold uppercase">Activo</th>
                  <th className="p-2 text-center font-bold uppercase w-24">Fecha venta</th>
                  <th className="p-2 text-right font-bold uppercase">Valor venta</th>
                  <th className="p-2 text-right font-bold uppercase">Coste FIFO</th>
                  <th className="p-2 text-right font-bold uppercase">Plusvalía</th>
                  <th className="p-2 text-right font-bold uppercase">% Rentab.</th>
                  <th className="p-2 text-right font-bold uppercase">Impuesto est.</th>
                </tr>
              </thead>
              <tbody>
                {capitalGains.map((r, i) => (
                  <tr key={i} className="border-b border-gray-200 hover:bg-blue-50/50 transition-colors">
                    <td className="p-2 font-medium text-[#000080]">{r.assetName}</td>
                    <td className="p-2 text-center text-gray-600">{r.date}</td>
                    <td className="p-2 text-right">{fmt(r.sellTotal)}</td>
                    <td className="p-2 text-right text-gray-600">{fmt(r.costBasis)}</td>
                    {gainCell(r.gain)}
                    <td className={`p-2 text-right text-xs ${r.costBasis > 0 && r.gain / r.costBasis * 100 >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {r.costBasis > 0 ? pctFmt(r.gain / r.costBasis * 100) : '—'}
                    </td>
                    <td className="p-2 text-right text-[#8B0000]">{r.gain > 0 ? fmt(r.tax) : '—'}</td>
                  </tr>
                ))}
                {capitalGains.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-500 italic">
                      No hay ventas registradas para el período seleccionado.
                    </td>
                  </tr>
                )}
              </tbody>
              {capitalGains.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-100 border-t-2 border-gray-400 font-bold">
                    <td className="p-2 uppercase text-gray-800">Total</td>
                    <td />
                    <td className="p-2 text-right">{fmt(totalsGains.sellTotal)}</td>
                    <td className="p-2 text-right text-gray-600">{fmt(totalsGains.costBasis)}</td>
                    <td className={`p-2 text-right ${totalsGains.gain >= 0 ? 'text-green-800' : 'text-red-800'}`}>
                      {fmt(totalsGains.gain)}
                    </td>
                    <td className="p-2 text-right text-xs">
                      {totalsGains.costBasis > 0 ? pctFmt(totalsGains.gain / totalsGains.costBasis * 100) : '—'}
                    </td>
                    <td className="p-2 text-right text-[#8B0000]">{fmt(totalsGains.tax)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}

          {/* ── DIVIDENDOS ─────────────────────────────────────────────── */}
          {view === 'dividends' && (
            <table className="clean-table w-full">
              <thead>
                <tr>
                  <th className="p-2 text-left font-bold uppercase">Activo</th>
                  <th className="p-2 text-center font-bold uppercase w-24">Fecha</th>
                  <th className="p-2 text-right font-bold uppercase">Bruto</th>
                  <th className="p-2 text-right font-bold uppercase">Retención</th>
                  <th className="p-2 text-right font-bold uppercase">Neto</th>
                  <th className="p-2 text-right font-bold uppercase">Impuesto est.</th>
                </tr>
              </thead>
              <tbody>
                {dividends.map((r, i) => (
                  <tr key={i} className="border-b border-gray-200 hover:bg-blue-50/50 transition-colors">
                    <td className="p-2 font-medium text-[#000080]">{r.assetName}</td>
                    <td className="p-2 text-center text-gray-600">{r.date}</td>
                    <td className="p-2 text-right">{fmt(r.gross)}</td>
                    <td className="p-2 text-right text-orange-700">{fmt(r.withholding)}</td>
                    <td className="p-2 text-right text-green-700">{fmt(r.net)}</td>
                    <td className="p-2 text-right text-[#8B0000]">{fmt(r.tax)}</td>
                  </tr>
                ))}
                {dividends.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-500 italic">
                      No hay dividendos registrados para el período seleccionado.
                    </td>
                  </tr>
                )}
              </tbody>
              {dividends.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-100 border-t-2 border-gray-400 font-bold">
                    <td className="p-2 uppercase text-gray-800">Total</td>
                    <td />
                    <td className="p-2 text-right">{fmt(totalsDivs.gross)}</td>
                    <td className="p-2 text-right text-orange-700">{fmt(totalsDivs.withholding)}</td>
                    <td className="p-2 text-right text-green-800">{fmt(totalsDivs.net)}</td>
                    <td className="p-2 text-right text-[#8B0000]">{fmt(totalsDivs.tax)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}

          {/* ── RESUMEN POR AÑO ────────────────────────────────────────── */}
          {view === 'summary' && (
            <table className="clean-table w-full">
              <thead>
                <tr>
                  <th className="p-2 text-center font-bold uppercase w-20">Año</th>
                  <th className="p-2 text-right font-bold uppercase">Plusvalías</th>
                  <th className="p-2 text-right font-bold uppercase">Dividendos</th>
                  <th className="p-2 text-right font-bold uppercase">Base imponible</th>
                  <th className="p-2 text-right font-bold uppercase">Cuota estimada</th>
                </tr>
              </thead>
              <tbody>
                {summary.map(r => (
                  <tr key={r.year} className="border-b border-gray-200 hover:bg-blue-50/50 transition-colors">
                    <td className="p-2 text-center font-bold text-gray-700">{r.year}</td>
                    {gainCell(r.totalGain)}
                    <td className="p-2 text-right text-green-700">{fmt(r.totalDiv)}</td>
                    <td className={`p-2 text-right font-semibold ${r.base >= 0 ? 'text-gray-800' : 'text-red-700'}`}>
                      {fmt(r.base)}
                    </td>
                    <td className="p-2 text-right text-[#8B0000] font-bold">{r.base > 0 ? fmt(r.tax) : '—'}</td>
                  </tr>
                ))}
                {summary.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-500 italic">
                      No hay datos de renta variable para el período seleccionado.
                    </td>
                  </tr>
                )}
              </tbody>
              {summary.length > 0 && (() => {
                const totGain = summary.reduce((s, r) => s + r.totalGain, 0);
                const totDiv  = summary.reduce((s, r) => s + r.totalDiv, 0);
                const totBase = summary.reduce((s, r) => s + r.base, 0);
                const totTax  = summary.reduce((s, r) => s + r.tax, 0);
                return (
                  <tfoot>
                    <tr className="bg-gray-100 border-t-2 border-gray-400 font-bold">
                      <td className="p-2 text-center text-gray-800 uppercase">Total</td>
                      <td className={`p-2 text-right ${totGain >= 0 ? 'text-green-800' : 'text-red-800'}`}>{fmt(totGain)}</td>
                      <td className="p-2 text-right text-green-800">{fmt(totDiv)}</td>
                      <td className={`p-2 text-right ${totBase >= 0 ? 'text-gray-800' : 'text-red-800'}`}>{fmt(totBase)}</td>
                      <td className="p-2 text-right text-[#8B0000]">{totBase > 0 ? fmt(totTax) : '—'}</td>
                    </tr>
                  </tfoot>
                );
              })()}
            </table>
          )}

        </div>
      </div>

      {/* Status bar */}
      <div className="flex justify-between items-center bg-[#f0f0f0] p-1 border-t border-[#808080] text-[10px]">
        <div>
          {view === 'assets' && `${capitalGains.length} operaciones de venta`}
          {view === 'dividends' && `${dividends.length} pagos de dividendos`}
          {view === 'summary' && `${summary.length} años fiscales`}
        </div>
        <div className="text-gray-500">IRPF · Base del ahorro 2024</div>
      </div>
    </div>
  );
}
