import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, ResponsiveContainer, ReferenceLine 
} from 'recharts';

export default function RvMetrics() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [assets, setAssets] = useState({});
  const [history, setHistory] = useState({});
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedTicker, setSelectedTicker] = useState('ALL');
  const [timeFilter, setTimeFilter] = useState('ALL'); // 'ALL', 'YTD', '1Y', '5Y'
  const [barPeriod, setBarPeriod] = useState('MONTH'); // 'MONTH', 'YEAR'
  const [unit, setUnit] = useState('EUR'); // 'EUR', 'PERCENT'
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const qTx = query(collection(db, 'rv_transactions'), where('userId', '==', user.uid));
    const unsubTx = onSnapshot(qTx, (snapTx) => {
      setTransactions(snapTx.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      
      const qAs = query(collection(db, 'rv_assets'), where('userId', '==', user.uid));
      onSnapshot(qAs, (snapAs) => {
        const asMap = {};
        snapAs.docs.forEach(doc => { asMap[doc.id] = doc.data(); });
        setAssets(asMap);
        
        const qHist = query(collection(db, 'rv_asset_history'), where('userId', '==', user.uid));
        onSnapshot(qHist, (snapHist) => {
          const hMap = {};
          snapHist.docs.forEach(doc => {
            const d = doc.data();
            if (!hMap[d.assetId]) hMap[d.assetId] = {};
            hMap[d.assetId][d.date] = d.close;
          });
          setHistory(hMap);
          setLoading(false);
        });
      });
    });

    return () => unsubTx();
  }, [user, refreshKey]);

  const tickers = useMemo(() => Array.from(new Set(transactions.map(tx => tx.assetId))).sort(), [transactions]);

  // Process data chronologically day by day
  const { lineData, barData, summary } = useMemo(() => {
    if (!transactions.length) return { lineData: [], barData: [], summary: {} };

    let txs = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
    if (selectedTicker !== 'ALL') {
      txs = txs.filter(t => t.assetId === selectedTicker);
    }
    
    if (!txs.length) return { lineData: [], barData: [], summary: {} };

    const firstDate = new Date(txs[0].date);
    const today = new Date();
    
    // Group transactions by date
    const txByDate = {};
    txs.forEach(tx => {
      if (!txByDate[tx.date]) txByDate[tx.date] = [];
      txByDate[tx.date].push(tx);
    });

    let holdings = {}; // { ticker: { shares, avgCost } }
    let cumulativeRealizedGains = 0;
    
    const dailyMap = {};
    const periodMap = {}; 
    
    let lastKnownPrices = {}; // { ticker: price }

    let currentDate = new Date(firstDate);
    while (currentDate <= today) {
      const dateStr = currentDate.toISOString().split('T')[0];
      
      // 1. Process transactions for this day
      if (txByDate[dateStr]) {
        txByDate[dateStr].forEach(tx => {
          const t = tx.assetId;
          if (!holdings[t]) holdings[t] = { shares: 0, avgCost: 0 };
          
          const qty = Number(tx.quantity || 0);
          const amtInEur = Number(tx.totalAmount || 0) / Number(tx.exchangeRate || 1);
          const feeInEur = Number(tx.fee || 0) / Number(tx.exchangeRate || 1);

          if (tx.type === 'Compra') {
            const oldTotalCost = holdings[t].shares * holdings[t].avgCost;
            holdings[t].shares += qty;
            if (holdings[t].shares > 0) {
              holdings[t].avgCost = (oldTotalCost + amtInEur) / holdings[t].shares;
            }
          } else if (tx.type === 'Venta') {
            const costOfSold = holdings[t].avgCost * qty;
            cumulativeRealizedGains += (amtInEur - costOfSold - feeInEur);
            holdings[t].shares = Math.max(0, holdings[t].shares - qty);
            if (holdings[t].shares === 0) holdings[t].avgCost = 0;
          } else if (tx.type === 'Dividendo') {
            cumulativeRealizedGains += (amtInEur - feeInEur);
          }
        });
      }

      // 2. Update prices and calculate market value
      let capitalInvertido = 0;
      let valorMercado = 0;

      Object.keys(holdings).forEach(t => {
        if (holdings[t].shares > 0) {
          capitalInvertido += (holdings[t].shares * holdings[t].avgCost);
          
          // Try to get today's price, else use last known price, else fallback to avgCost
          if (history[t] && history[t][dateStr] !== undefined) {
            lastKnownPrices[t] = history[t][dateStr];
          }
          
          const price = lastKnownPrices[t] || holdings[t].avgCost;
          valorMercado += (holdings[t].shares * price);
        }
      });

      const beneficioLatente = valorMercado - capitalInvertido;
      const beneficioTotal = beneficioLatente + cumulativeRealizedGains;
      const rentabilidadPct = capitalInvertido > 0 ? (beneficioTotal / capitalInvertido) * 100 : 0;

      dailyMap[dateStr] = {
        date: dateStr,
        capitalInvertido,
        valorMercado,
        beneficioTotal,
        rentabilidadPct
      };

      currentDate.setDate(currentDate.getDate() + 1);
    }

    let lineChartData = Object.values(dailyMap);
    
    // Process bar chart by period (change in beneficioTotal during the period)
    let previousBeneficioTotal = 0;
    
    lineChartData.forEach(day => {
      const periodKey = barPeriod === 'MONTH' ? day.date.substring(0, 7) : day.date.substring(0, 4);
      if (!periodMap[periodKey]) {
        periodMap[periodKey] = {
          period: periodKey,
          startBeneficio: previousBeneficioTotal,
          endBeneficio: day.beneficioTotal,
          avgCapital: day.capitalInvertido,
          count: 1
        };
      } else {
        periodMap[periodKey].endBeneficio = day.beneficioTotal;
        periodMap[periodKey].avgCapital += day.capitalInvertido;
        periodMap[periodKey].count += 1;
      }
      previousBeneficioTotal = day.beneficioTotal;
    });

    let barChartData = Object.values(periodMap).map(p => {
      const gains = p.endBeneficio - p.startBeneficio;
      const avgCap = p.avgCapital / p.count;
      return {
        period: p.period,
        gains: gains,
        gainsPct: avgCap > 0 ? (gains / avgCap) * 100 : 0
      };
    });

    // Apply Time Filter (Subsample Line Chart for performance if needed)
    if (timeFilter !== 'ALL' && lineChartData.length > 0) {
      const now = new Date();
      let cutoff = new Date('1970-01-01');
      if (timeFilter === 'YTD') cutoff = new Date(now.getFullYear(), 0, 1);
      if (timeFilter === '1Y') cutoff = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      if (timeFilter === '5Y') cutoff = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());
      
      const cutoffStr = cutoff.toISOString().split('T')[0];
      lineChartData = lineChartData.filter(d => d.date >= cutoffStr);
      barChartData = barChartData.filter(d => {
        if (barPeriod === 'MONTH') return d.period >= cutoffStr.substring(0,7);
        return d.period >= cutoffStr.substring(0,4);
      });
    }

    // Downsample lineChartData if it's too large to prevent UI lag (> 150 points)
    if (lineChartData.length > 200) {
      const step = Math.ceil(lineChartData.length / 150);
      lineChartData = lineChartData.filter((_, idx) => idx % step === 0 || idx === lineChartData.length - 1);
    }

    const lastDay = lineChartData[lineChartData.length - 1] || {};

    return { 
      lineData: lineChartData, 
      barData: barChartData, 
      summary: { 
        currentCapital: lastDay.capitalInvertido || 0,
        currentValue: lastDay.valorMercado || 0,
        totalGains: lastDay.beneficioTotal || 0,
        roiPct: lastDay.rentabilidadPct || 0
      } 
    };
  }, [transactions, history, selectedTicker, timeFilter, barPeriod]);

  if (loading) {
    return <div className="p-6 flex justify-center items-center h-full text-slate-500">Cargando histórico de mercado...</div>;
  }

  const formatYAxis = (tickItem) => {
    if (unit === 'PERCENT') return `${tickItem.toFixed(1)}%`;
    if (tickItem >= 1000 || tickItem <= -1000) return `${(tickItem / 1000).toFixed(1)}k €`;
    return `${tickItem} €`;
  };

  const formatTooltip = (value, name) => {
    if (unit === 'PERCENT' || name.includes('%')) return [`${Number(value).toFixed(2)} %`, name];
    return [`${Number(value).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}`, name];
  };

  return (
    <div className="w-full h-full bg-[#f8f9fa] flex flex-col overflow-y-auto">
      {/* Header & Controls */}
      <div className="bg-white border-b border-slate-200 p-4 sticky top-0 z-10 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Histórico de Inversiones</h1>
          <p className="text-xs text-slate-500">Evolución de valor de mercado y rentabilidad</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button 
            onClick={() => setRefreshKey(k => k + 1)}
            className="px-3 py-1 text-xs font-medium bg-blue-50 text-blue-600 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors flex items-center gap-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Recargar
          </button>

          <select 
            value={selectedTicker}
            onChange={(e) => setSelectedTicker(e.target.value)}
            className="text-xs border-slate-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="ALL">Toda la Cartera</option>
            {tickers.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <div className="flex bg-slate-100 p-1 rounded-md border border-slate-200">
            {['ALL', '5Y', '1Y', 'YTD'].map(tf => (
              <button
                key={tf}
                onClick={() => setTimeFilter(tf)}
                className={`px-3 py-1 text-xs font-medium rounded ${timeFilter === tf ? 'bg-white shadow text-blue-700' : 'text-slate-600 hover:text-slate-900'}`}
              >
                {tf === 'ALL' ? 'Máx' : tf}
              </button>
            ))}
          </div>

          <div className="flex bg-slate-100 p-1 rounded-md border border-slate-200">
            <button
              onClick={() => setUnit('EUR')}
              className={`px-3 py-1 text-xs font-medium rounded ${unit === 'EUR' ? 'bg-white shadow text-blue-700' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Euros (€)
            </button>
            <button
              onClick={() => setUnit('PERCENT')}
              className={`px-3 py-1 text-xs font-medium rounded ${unit === 'PERCENT' ? 'bg-white shadow text-blue-700' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Porcentaje (%)
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-4 flex-1 flex flex-col gap-6">
        
        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-xs text-slate-500 font-medium mb-1">Capital Invertido Actual</p>
            <p className="text-xl font-bold text-slate-800">
              {summary.currentCapital?.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
            </p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-xs text-slate-500 font-medium mb-1">Valor de Mercado Actual</p>
            <p className="text-xl font-bold text-slate-800">
              {summary.currentValue?.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
            </p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-xs text-slate-500 font-medium mb-1">Beneficio Total (Latente + Realizado)</p>
            <p className={`text-xl font-bold ${summary.totalGains >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {summary.totalGains?.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', signDisplay: 'always' })}
            </p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-xs text-slate-500 font-medium mb-1">Rentabilidad Total (ROI)</p>
            <p className={`text-xl font-bold ${summary.roiPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {summary.roiPct > 0 ? '+' : ''}{summary.roiPct?.toFixed(2)} %
            </p>
          </div>
        </div>

        {/* Line Chart */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex-1 min-h-[350px]">
          <h2 className="text-sm font-bold text-slate-700 mb-4">Evolución de Valor de Mercado</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={lineData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 10, fill: '#64748b' }} 
                tickFormatter={(val) => {
                  const d = new Date(val);
                  return `${d.getMonth()+1}/${d.getFullYear().toString().slice(2)}`;
                }}
              />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={formatYAxis} />
              <Tooltip formatter={formatTooltip} labelStyle={{ color: '#0f172a', fontWeight: 'bold' }} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              {unit === 'EUR' ? (
                <>
                  <Line type="monotone" name="Capital Invertido" dataKey="capitalInvertido" stroke="#94a3b8" strokeWidth={2} dot={false} />
                  <Line type="monotone" name="Valor de Mercado" dataKey="valorMercado" stroke="#3b82f6" strokeWidth={2} dot={false} />
                </>
              ) : (
                <Line type="monotone" name="Rentabilidad Acumulada (%)" dataKey="rentabilidadPct" stroke="#10b981" strokeWidth={2} dot={false} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Bar Chart */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex-1 min-h-[350px]">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-bold text-slate-700">Rentabilidad (Latente + Realizada) por Período</h2>
            <div className="flex bg-slate-100 p-1 rounded-md border border-slate-200">
              <button
                onClick={() => setBarPeriod('MONTH')}
                className={`px-3 py-1 text-xs font-medium rounded ${barPeriod === 'MONTH' ? 'bg-white shadow text-blue-700' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Mensual
              </button>
              <button
                onClick={() => setBarPeriod('YEAR')}
                className={`px-3 py-1 text-xs font-medium rounded ${barPeriod === 'YEAR' ? 'bg-white shadow text-blue-700' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Anual
              </button>
            </div>
          </div>
          
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={barData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={formatYAxis} />
              <Tooltip formatter={formatTooltip} cursor={{ fill: '#f1f5f9' }} />
              <ReferenceLine y={0} stroke="#94a3b8" />
              {unit === 'EUR' ? (
                <Bar name="Beneficio Periodo (€)" dataKey="gains" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              ) : (
                <Bar name="Rentabilidad Periodo (%)" dataKey="gainsPct" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>

      </div>
    </div>
  );
}
