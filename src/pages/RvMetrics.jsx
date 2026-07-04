import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, writeBatch, doc } from 'firebase/firestore';
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
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Layout
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Sidebar Filters
  const [selectedTickers, setSelectedTickers] = useState(['ALL']);
  const [selectedBrokers, setSelectedBrokers] = useState(['ALL']);
  const [selectedAccounts, setSelectedAccounts] = useState(['ALL']);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [barPeriod, setBarPeriod] = useState('MONTH'); // 'DAY', 'MONTH', 'YEAR'

  // Topbar Filters
  const [unit, setUnit] = useState('EUR'); // 'EUR', 'PERCENT'
  const [primaryMetric, setPrimaryMetric] = useState('VALOR'); // 'VALOR', 'PLUSVALIA'

  // Toggle Lines state
  const [hiddenLines, setHiddenLines] = useState({});

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const qTx = query(collection(db, 'rv_transactions'), where('userId', '==', user.uid));
    const unsubTx = onSnapshot(qTx, (snapTx) => {
      setTransactions(snapTx.docs.map(d => ({ id: d.id, ...d.data() })));
      
      const qAs = query(collection(db, 'rv_assets'), where('userId', '==', user.uid));
      onSnapshot(qAs, (snapAs) => {
        const asMap = {};
        snapAs.docs.forEach(d => { asMap[d.id] = d.data(); });
        setAssets(asMap);
        
        const qHist = query(collection(db, 'rv_asset_history'), where('userId', '==', user.uid));
        onSnapshot(qHist, (snapHist) => {
          const hMap = {};
          snapHist.docs.forEach(d => {
            const data = d.data();
            if (!hMap[data.assetId]) hMap[data.assetId] = {};
            hMap[data.assetId][data.date] = data.close;
          });
          setHistory(hMap);
          setLoading(false);
        });
      });
    });
    return () => unsubTx();
  }, [user]);

  // Derived unique lists for filters
  const tickers = useMemo(() => Array.from(new Set(transactions.map(tx => tx.assetId))).sort(), [transactions]);
  const brokers = useMemo(() => Array.from(new Set(transactions.map(tx => tx.broker).filter(Boolean))).sort(), [transactions]);
  const accounts = useMemo(() => Array.from(new Set(transactions.map(tx => tx.brokerAccount).filter(Boolean))).sort(), [transactions]);

  const handleRefreshData = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    
    const assetsToFetch = Object.values(assets).filter(a => a.apiSource === 'Yahoo Finance' && a.ticker);
    
    for (const asset of assetsToFetch) {
      const hKeys = history[asset.id] ? Object.keys(history[asset.id]).sort() : [];
      const lastDateStr = hKeys.length > 0 ? hKeys[hKeys.length - 1] : null;
      
      let period1;
      if (lastDateStr) {
        period1 = Math.floor(new Date(lastDateStr).getTime() / 1000);
      } else {
        const txs = transactions.filter(t => t.assetId === asset.id).sort((a,b) => new Date(a.date) - new Date(b.date));
        if (txs.length > 0) period1 = Math.floor(new Date(txs[0].date).getTime() / 1000);
        else period1 = Math.floor(new Date('2020-01-01').getTime() / 1000);
      }
      
      const period2 = Math.floor(Date.now() / 1000);
      if (period1 >= period2 - 43200) continue;
      
      try {
        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${asset.ticker}?period1=${period1}&period2=${period2}&interval=1d&events=history&includeAdjustedClose=true`;
        const proxies = [
          { url: `https://corsproxy.io/?url=${encodeURIComponent(yahooUrl)}`, mode: 'direct' },
          { url: `https://api.allorigins.win/raw?url=${encodeURIComponent(yahooUrl)}`, mode: 'direct' },
          { url: `https://api.allorigins.win/get?url=${encodeURIComponent(yahooUrl)}`, mode: 'wrapped' },
        ];
        
        let json = null;
        for (const proxy of proxies) {
          try {
            const resp = await fetch(proxy.url, { signal: AbortSignal.timeout(10000) });
            if (!resp.ok) continue;
            const text = await resp.text();
            if (proxy.mode === 'wrapped') {
              const outer = JSON.parse(text);
              json = JSON.parse(outer.contents);
            } else {
              json = JSON.parse(text);
            }
            if (json?.chart?.result) break;
            json = null;
          } catch (e) {
             continue;
          }
        }
        
        if (json?.chart?.result) {
          const result = json.chart.result[0];
          const timestamps = result.timestamp || [];
          const closes = result.indicators?.quote?.[0]?.close || [];
          
          const batch = writeBatch(db);
          let count = 0;
          for (let i = 0; i < timestamps.length; i++) {
             if (closes[i] !== null && closes[i] !== undefined) {
                const dateObj = new Date(timestamps[i] * 1000);
                const ds = dateObj.toISOString().split('T')[0];
                const recId = `${asset.id}_${ds}`;
                const ref = doc(db, 'rv_asset_history', recId);
                batch.set(ref, {
                   id: recId, assetId: asset.id, date: ds, close: closes[i], userId: user.uid
                });
                count++;
             }
          }
          if (count > 0) await batch.commit();
        }
      } catch(e) {
        console.error('Error fetching data for', asset.ticker, e);
      }
      await new Promise(r => setTimeout(r, 600));
    }
    setIsRefreshing(false);
  };

  const toggleMultiSelect = (item, selectedList, setFn) => {
    if (item === 'ALL') {
      setFn(['ALL']);
      return;
    }
    let newSel = selectedList.filter(x => x !== 'ALL');
    if (newSel.includes(item)) {
      newSel = newSel.filter(x => x !== item);
      if (newSel.length === 0) newSel = ['ALL'];
    } else {
      newSel.push(item);
    }
    setFn(newSel);
  };

  const { lineData, barData, summary } = useMemo(() => {
    if (!transactions.length) return { lineData: [], barData: [], summary: {} };

    // Initial filter by active/broker/account (These affect the actual invested capital calculations)
    let txs = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
    if (!selectedTickers.includes('ALL')) txs = txs.filter(t => selectedTickers.includes(t.assetId));
    if (!selectedBrokers.includes('ALL')) txs = txs.filter(t => selectedBrokers.includes(t.broker));
    if (!selectedAccounts.includes('ALL')) txs = txs.filter(t => selectedAccounts.includes(t.brokerAccount));
    
    if (!txs.length) return { lineData: [], barData: [], summary: {} };

    const firstDate = new Date(txs[0].date);
    const today = new Date();
    
    const txByDate = {};
    txs.forEach(tx => {
      if (!txByDate[tx.date]) txByDate[tx.date] = [];
      txByDate[tx.date].push(tx);
    });

    let holdings = {}; 
    let cumulativeRealizedGains = 0;
    
    const dailyMap = {};
    const periodMap = {}; 
    let lastKnownPrices = {}; 

    let currentDate = new Date(firstDate);
    while (currentDate <= today) {
      const dateStr = currentDate.toISOString().split('T')[0];
      
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

      let capitalInvertido = 0;
      let valorMercado = 0;

      Object.keys(holdings).forEach(t => {
        if (holdings[t].shares > 0) {
          capitalInvertido += (holdings[t].shares * holdings[t].avgCost);
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
    
    let previousBeneficioTotal = 0;
    lineChartData.forEach(day => {
      let periodKey = day.date; // DAY
      if (barPeriod === 'MONTH') periodKey = day.date.substring(0, 7);
      if (barPeriod === 'YEAR') periodKey = day.date.substring(0, 4);

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

    // Date Filter (Display only)
    if (startDate) {
      lineChartData = lineChartData.filter(d => d.date >= startDate);
      barChartData = barChartData.filter(d => d.period >= startDate.substring(0, barPeriod === 'YEAR' ? 4 : (barPeriod === 'MONTH' ? 7 : 10)));
    }
    if (endDate) {
      lineChartData = lineChartData.filter(d => d.date <= endDate);
      barChartData = barChartData.filter(d => d.period <= endDate.substring(0, barPeriod === 'YEAR' ? 4 : (barPeriod === 'MONTH' ? 7 : 10)));
    }

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
  }, [transactions, history, selectedTickers, selectedBrokers, selectedAccounts, startDate, endDate, barPeriod]);

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

  const handleLegendClick = (e) => setHiddenLines(prev => ({ ...prev, [e.dataKey]: !prev[e.dataKey] }));

  // Render Checkbox item
  const FilterCheckbox = ({ label, isSelected, onClick }) => (
    <div 
      className="flex items-center gap-2 mb-2 cursor-pointer group"
      onClick={onClick}
    >
      <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300 group-hover:border-indigo-400'}`}>
        {isSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
      </div>
      <span className="text-sm text-slate-700">{label}</span>
    </div>
  );

  return (
    <div className="w-full h-full bg-[#f8f9fa] flex overflow-hidden">
      
      {/* Sidebar */}
      {isSidebarOpen && (
        <div className="w-64 bg-slate-50 border-r border-slate-200 flex-shrink-0 flex flex-col h-full overflow-y-auto">
          <div className="p-4 border-b border-slate-200 bg-slate-100/50 sticky top-0">
            <h2 className="font-bold text-slate-700">Filtros</h2>
          </div>
          <div className="p-4 flex flex-col gap-6">
            
            {/* Fechas */}
            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Rango de Fechas</h3>
              <div className="flex flex-col gap-2">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Desde:</label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full text-sm rounded border-slate-300 shadow-sm" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Hasta:</label>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full text-sm rounded border-slate-300 shadow-sm" />
                </div>
              </div>
            </div>

            {/* Activos */}
            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Activos</h3>
              <FilterCheckbox label="Todos" isSelected={selectedTickers.includes('ALL')} onClick={() => toggleMultiSelect('ALL', selectedTickers, setSelectedTickers)} />
              {tickers.map(t => (
                <FilterCheckbox key={t} label={t} isSelected={selectedTickers.includes(t)} onClick={() => toggleMultiSelect(t, selectedTickers, setSelectedTickers)} />
              ))}
            </div>

            {/* Brokers */}
            {brokers.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Brokers</h3>
                <FilterCheckbox label="Todos" isSelected={selectedBrokers.includes('ALL')} onClick={() => toggleMultiSelect('ALL', selectedBrokers, setSelectedBrokers)} />
                {brokers.map(b => (
                  <FilterCheckbox key={b} label={b} isSelected={selectedBrokers.includes(b)} onClick={() => toggleMultiSelect(b, selectedBrokers, setSelectedBrokers)} />
                ))}
              </div>
            )}

            {/* Cuentas */}
            {accounts.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Cuentas Broker</h3>
                <FilterCheckbox label="Todas" isSelected={selectedAccounts.includes('ALL')} onClick={() => toggleMultiSelect('ALL', selectedAccounts, setSelectedAccounts)} />
                {accounts.map(a => (
                  <FilterCheckbox key={a} label={a} isSelected={selectedAccounts.includes(a)} onClick={() => toggleMultiSelect(a, selectedAccounts, setSelectedAccounts)} />
                ))}
              </div>
            )}

            {/* Temporalidad Barras */}
            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Temporalidad (Barras)</h3>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="barPeriod" value="DAY" checked={barPeriod === 'DAY'} onChange={() => setBarPeriod('DAY')} className="text-indigo-600 focus:ring-indigo-500" />
                  <span className="text-sm text-slate-700">Diaria</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="barPeriod" value="MONTH" checked={barPeriod === 'MONTH'} onChange={() => setBarPeriod('MONTH')} className="text-indigo-600 focus:ring-indigo-500" />
                  <span className="text-sm text-slate-700">Mensual</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="barPeriod" value="YEAR" checked={barPeriod === 'YEAR'} onChange={() => setBarPeriod('YEAR')} className="text-indigo-600 focus:ring-indigo-500" />
                  <span className="text-sm text-slate-700">Anual</span>
                </label>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full min-w-0">
        {/* Header & Controls */}
        <div className="bg-white border-b border-slate-200 p-4 sticky top-0 z-10 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-md border border-slate-200 bg-slate-50"
              title="Alternar panel de filtros"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
              </svg>
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Histórico de Inversiones</h1>
              <p className="text-xs text-slate-500">Evolución de valor de mercado y rentabilidad</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button 
              onClick={handleRefreshData}
              disabled={isRefreshing}
              className={`px-3 py-1 text-xs font-medium border rounded-md transition-colors flex items-center gap-1 ${isRefreshing ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'}`}
            >
              {isRefreshing ? (
                <>
                  <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  Descargando API...
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Recargar de API
                </>
              )}
            </button>

            <div className="flex bg-slate-100 p-1 rounded-md border border-slate-200">
              <button onClick={() => setPrimaryMetric('VALOR')} className={`px-3 py-1 text-xs font-medium rounded ${primaryMetric === 'VALOR' ? 'bg-white shadow text-blue-700' : 'text-slate-600 hover:text-slate-900'}`}>
                Gráfica Valor
              </button>
              <button onClick={() => setPrimaryMetric('PLUSVALIA')} className={`px-3 py-1 text-xs font-medium rounded ${primaryMetric === 'PLUSVALIA' ? 'bg-white shadow text-blue-700' : 'text-slate-600 hover:text-slate-900'}`}>
                Gráfica Plusvalía
              </button>
            </div>

            <div className="flex bg-slate-100 p-1 rounded-md border border-slate-200">
              <button onClick={() => setUnit('EUR')} className={`px-3 py-1 text-xs font-medium rounded ${unit === 'EUR' ? 'bg-white shadow text-blue-700' : 'text-slate-600 hover:text-slate-900'}`}>
                Euros (€)
              </button>
              <button onClick={() => setUnit('PERCENT')} className={`px-3 py-1 text-xs font-medium rounded ${unit === 'PERCENT' ? 'bg-white shadow text-blue-700' : 'text-slate-600 hover:text-slate-900'}`}>
                Porcentaje (%)
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 flex-1 flex flex-col gap-6 overflow-y-auto">
          
          {/* KPI Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm min-h-[350px]">
            <h2 className="text-sm font-bold text-slate-700 mb-1">
              {primaryMetric === 'VALOR' ? 'Evolución de Valor de Mercado' : 'Evolución de la Plusvalía Total'}
            </h2>
            <p className="text-[10px] text-slate-400 mb-4">(Haz click en los elementos de la leyenda para ocultarlos o mostrarlos)</p>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
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
                  <Legend onClick={handleLegendClick} wrapperStyle={{ fontSize: '11px', cursor: 'pointer' }} />
                  
                  {primaryMetric === 'VALOR' && (
                    <>
                      <Line type="monotone" name="Capital Invertido" dataKey="capitalInvertido" stroke="#94a3b8" strokeWidth={2} dot={false} hide={hiddenLines['capitalInvertido']} />
                      <Line type="monotone" name="Valor de Mercado" dataKey="valorMercado" stroke="#3b82f6" strokeWidth={2} dot={false} hide={hiddenLines['valorMercado']} />
                    </>
                  )}

                  {primaryMetric === 'PLUSVALIA' && unit === 'EUR' && (
                    <Line type="monotone" name="Beneficio Total (€)" dataKey="beneficioTotal" stroke="#10b981" strokeWidth={2} dot={false} hide={hiddenLines['beneficioTotal']} />
                  )}

                  {primaryMetric === 'PLUSVALIA' && unit === 'PERCENT' && (
                    <Line type="monotone" name="Rentabilidad Acumulada (%)" dataKey="rentabilidadPct" stroke="#10b981" strokeWidth={2} dot={false} hide={hiddenLines['rentabilidadPct']} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Bar Chart */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm min-h-[350px]">
            <h2 className="text-sm font-bold text-slate-700 mb-4">Rentabilidad (Latente + Realizada) por Período</h2>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
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
      </div>
    </div>
  );
}
