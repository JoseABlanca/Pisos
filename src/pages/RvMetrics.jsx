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
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedTicker, setSelectedTicker] = useState('ALL');
  const [timeFilter, setTimeFilter] = useState('ALL'); // 'ALL', 'YTD', '1Y', '5Y'
  const [barPeriod, setBarPeriod] = useState('MONTH'); // 'MONTH', 'YEAR'
  const [unit, setUnit] = useState('EUR'); // 'EUR', 'PERCENT'

  useEffect(() => {
    if (!user) return;
    
    // Fetch Transactions
    const qTx = query(collection(db, 'rv_transactions'), where('userId', '==', user.uid));
    const unsubTx = onSnapshot(qTx, (snapshot) => {
      const txs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTransactions(txs);
      
      // Fetch Assets (for tickers)
      const qAs = query(collection(db, 'rv_assets'), where('userId', '==', user.uid));
      onSnapshot(qAs, (snapAs) => {
        const asMap = {};
        snapAs.docs.forEach(doc => {
          asMap[doc.id] = doc.data();
        });
        setAssets(asMap);
        setLoading(false);
      });
    });

    return () => unsubTx();
  }, [user]);

  const tickers = useMemo(() => {
    const t = new Set(transactions.map(tx => tx.assetId));
    return Array.from(t).sort();
  }, [transactions]);

  // Process data chronologically
  const { lineData, barData, summary } = useMemo(() => {
    if (!transactions.length) return { lineData: [], barData: [], summary: {} };

    // Sort chronologically
    let txs = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    if (selectedTicker !== 'ALL') {
      txs = txs.filter(t => t.assetId === selectedTicker);
    }

    let holdings = {}; // { ticker: { shares, totalCost } }
    let cumulativeRealizedGains = 0;
    let netCapitalInvested = 0; // Total purchases - Cost of sales
    
    const dailyMap = {};
    const periodMap = {}; // For Bar Chart

    txs.forEach(tx => {
      const date = tx.date;
      const t = tx.assetId;
      if (!holdings[t]) holdings[t] = { shares: 0, totalCost: 0 };
      
      const qty = Number(tx.quantity || 0);
      const amtInEur = Number(tx.totalAmount || 0) / Number(tx.exchangeRate || 1); // approximate
      const feeInEur = Number(tx.fee || 0) / Number(tx.exchangeRate || 1);

      let realizedGain = 0;

      if (tx.type === 'Compra') {
        holdings[t].shares += qty;
        holdings[t].totalCost += amtInEur;
        netCapitalInvested += amtInEur;
      } else if (tx.type === 'Venta') {
        const avgCost = holdings[t].shares > 0 ? holdings[t].totalCost / holdings[t].shares : 0;
        const costOfSold = avgCost * qty;
        
        realizedGain = amtInEur - costOfSold - feeInEur;
        cumulativeRealizedGains += realizedGain;
        
        holdings[t].shares -= qty;
        holdings[t].totalCost -= costOfSold;
        netCapitalInvested -= costOfSold;
      } else if (tx.type === 'Dividendo') {
        realizedGain = amtInEur - feeInEur;
        cumulativeRealizedGains += realizedGain;
      }

      // Record for Line Chart (End of Day snapshot)
      dailyMap[date] = {
        date,
        netCapitalInvested,
        cumulativeRealizedGains,
        totalReturnPct: netCapitalInvested > 0 ? (cumulativeRealizedGains / netCapitalInvested) * 100 : 0
      };

      // Record for Bar Chart
      const periodKey = barPeriod === 'MONTH' ? date.substring(0, 7) : date.substring(0, 4);
      if (!periodMap[periodKey]) {
        periodMap[periodKey] = {
          period: periodKey,
          gains: 0,
          avgCapital: netCapitalInvested, // simplified
          count: 0
        };
      }
      periodMap[periodKey].gains += realizedGain;
      periodMap[periodKey].avgCapital += netCapitalInvested;
      periodMap[periodKey].count += 1;
    });

    let lineChartData = Object.values(dailyMap);
    
    let barChartData = Object.values(periodMap).map(p => {
      const avgCap = p.avgCapital / p.count;
      return {
        period: p.period,
        gains: p.gains,
        gainsPct: avgCap > 0 ? (p.gains / avgCap) * 100 : 0
      };
    });

    // Apply Time Filter
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

    return { 
      lineData: lineChartData, 
      barData: barChartData, 
      summary: { 
        currentCapital: netCapitalInvested,
        totalGains: cumulativeRealizedGains
      } 
    };
  }, [transactions, selectedTicker, timeFilter, barPeriod]);

  if (loading) {
    return <div className="p-6 flex justify-center items-center h-full text-slate-500">Cargando histórico...</div>;
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
          <p className="text-xs text-slate-500">Evolución del capital y rentabilidad obtenida</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Ticker Filter */}
          <select 
            value={selectedTicker}
            onChange={(e) => setSelectedTicker(e.target.value)}
            className="text-xs border-slate-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="ALL">Toda la Cartera</option>
            {tickers.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          {/* Time Filter */}
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

          {/* Unit Filter */}
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
            <p className="text-xs text-slate-500 font-medium mb-1">Capital Invertido Neto</p>
            <p className="text-xl font-bold text-slate-800">
              {summary.currentCapital?.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
            </p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-xs text-slate-500 font-medium mb-1">Beneficio Histórico Realizado</p>
            <p className={`text-xl font-bold ${summary.totalGains >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {summary.totalGains?.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', signDisplay: 'always' })}
            </p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-xs text-slate-500 font-medium mb-1">Rentabilidad Histórica (ROI)</p>
            <p className={`text-xl font-bold ${summary.totalGains >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {summary.currentCapital > 0 ? ((summary.totalGains / summary.currentCapital) * 100).toFixed(2) : '0.00'} %
            </p>
          </div>
        </div>

        {/* Line Chart */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex-1 min-h-[350px]">
          <h2 className="text-sm font-bold text-slate-700 mb-4">Evolución de la Inversión</h2>
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
                  <Line type="stepAfter" name="Capital Invertido Neto" dataKey="netCapitalInvested" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="stepAfter" name="Beneficio Realizado Acum." dataKey="cumulativeRealizedGains" stroke="#10b981" strokeWidth={2} dot={false} />
                </>
              ) : (
                <Line type="stepAfter" name="Rentabilidad Acumulada (%)" dataKey="totalReturnPct" stroke="#10b981" strokeWidth={2} dot={false} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Bar Chart */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex-1 min-h-[350px]">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-bold text-slate-700">Rentabilidad Periódica</h2>
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
