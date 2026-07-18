import React, { useState, useEffect, useMemo } from 'react';
import ZoomControl from '../components/ZoomControl';
import { useOutletContext } from 'react-router-dom';
import { collection, query, where, onSnapshot, writeBatch, doc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import ResizableSidebar from '../components/ResizableSidebar';
import { useRvHistoricalData } from '../hooks/useRvHistoricalData';
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, ResponsiveContainer, ReferenceLine, ComposedChart, Area, AreaChart
} from 'recharts';

export default function RvMetrics() {
  const { tableZoom } = useOutletContext() || { tableZoom: 1 };
  const { user } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [assets, setAssets] = useState({});
  const [history, setHistory] = useState({});
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [config, setConfig] = useState({ exchangeRates: { USD: 1.08, GBP: 0.85, CHF: 0.95 } });
  const [rvBrokers, setRvBrokers] = useState({});

  // Layout
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Sidebar Filters
  const [selectedTickers, setSelectedTickers] = useState(() => {
    const saved = localStorage.getItem('rv_metrics_tickers');
    return saved ? JSON.parse(saved) : ['ALL'];
  });
  const [selectedBrokers, setSelectedBrokers] = useState(['ALL']);
  const [selectedAccounts, setSelectedAccounts] = useState(['ALL']);
  const [startDate, setStartDate] = useState(() => localStorage.getItem('rv_metrics_start') || '');
  const [endDate, setEndDate] = useState(() => localStorage.getItem('rv_metrics_end') || '');
  const [activeView, setActiveView] = useState(() => localStorage.getItem('rv_metrics_view') || 'graficos');
  const [linePeriod, setLinePeriod] = useState(() => localStorage.getItem('rv_metrics_line_period') || 'MONTH');
  const [barPeriod, setBarPeriod] = useState(() => localStorage.getItem('rv_metrics_bar_period') || 'MONTH');
  const [histPeriod, setHistPeriod] = useState(() => localStorage.getItem('rv_metrics_hist_period') || 'MONTH');
  const [histBins, setHistBins] = useState(() => parseInt(localStorage.getItem('rv_metrics_hist_bins')) || 15);
  const [drawdownPeriod, setDrawdownPeriod] = useState(() => localStorage.getItem('rv_metrics_drawdown_period') || 'MONTH');
  const [isAccumulated, setIsAccumulated] = useState(() => localStorage.getItem('rv_metrics_accumulated') !== 'false');

  // Topbar Filters
  const [unit, setUnit] = useState(() => localStorage.getItem('rv_metrics_unit') || 'EUR'); // 'EUR', 'PERCENT'
  const [primaryMetric, setPrimaryMetric] = useState(() => localStorage.getItem('rv_metrics_primary') || 'VALOR'); // 'VALOR', 'PLUSVALIA'
  const [kpiBenefitType, setKpiBenefitType] = useState(() => localStorage.getItem('rv_metrics_kpi_type') || 'TOTAL'); // 'TOTAL', 'LATENTE'

  // Persist state to localStorage
  useEffect(() => { localStorage.setItem('rv_metrics_primary', primaryMetric); }, [primaryMetric]);
  useEffect(() => { localStorage.setItem('rv_metrics_unit', unit); }, [unit]);
  useEffect(() => { localStorage.setItem('rv_metrics_tickers', JSON.stringify(selectedTickers)); }, [selectedTickers]);
  useEffect(() => { localStorage.setItem('rv_metrics_start', startDate); }, [startDate]);
  useEffect(() => { localStorage.setItem('rv_metrics_end', endDate); }, [endDate]);
  useEffect(() => { localStorage.setItem('rv_metrics_view', activeView); }, [activeView]);
  useEffect(() => { localStorage.setItem('rv_metrics_line_period', linePeriod); }, [linePeriod]);
  useEffect(() => { localStorage.setItem('rv_metrics_bar_period', barPeriod); }, [barPeriod]);
  useEffect(() => { localStorage.setItem('rv_metrics_hist_period', histPeriod); }, [histPeriod]);
  useEffect(() => { localStorage.setItem('rv_metrics_hist_bins', histBins); }, [histBins]);
  useEffect(() => { localStorage.setItem('rv_metrics_drawdown_period', drawdownPeriod); }, [drawdownPeriod]);
  useEffect(() => { localStorage.setItem('rv_metrics_kpi_type', kpiBenefitType); }, [kpiBenefitType]);
  useEffect(() => { localStorage.setItem('rv_metrics_accumulated', isAccumulated); }, [isAccumulated]);

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

        const qBrokers = query(collection(db, 'rv_brokers'), where('userId', '==', user.uid));
        onSnapshot(qBrokers, (snapBrokers) => {
          const brMap = {};
          snapBrokers.docs.forEach(d => { brMap[d.id] = d.data(); });
          setRvBrokers(brMap);
          
          const qHist = query(collection(db, 'rv_asset_history'), where('userId', '==', user.uid));
          onSnapshot(qHist, (snapHist) => {
            const hMap = {};
            snapHist.docs.forEach(d => {
              const data = d.data();
              if (!hMap[data.assetId]) hMap[data.assetId] = {};
              hMap[data.assetId][data.date] = data.close;
            });
            setHistory(hMap);
            
            const unsubConfig = onSnapshot(doc(db, 'rv_config', user.uid), (snapConf) => {
              if (snapConf.exists()) setConfig(snapConf.data());
              setLoading(false);
            });
          });
        });
      });
    });
    return () => unsubTx();
  }, [user]);

  // Derived unique lists for filters
  const tickers = useMemo(() => Array.from(new Set(transactions.map(tx => tx.assetId))).sort(), [transactions]);
  
  const brokers = useMemo(() => {
    return Array.from(new Set(transactions.map(tx => {
      const b = rvBrokers[tx.brokerId];
      return b ? b.name : tx.brokerId;
    }).filter(Boolean))).sort();
  }, [transactions, rvBrokers]);

  const accounts = useMemo(() => {
    return Array.from(new Set(transactions.map(tx => {
      const b = rvBrokers[tx.brokerId];
      return b ? b.accountNumber : null;
    }).filter(Boolean))).sort();
  }, [transactions, rvBrokers]);

  const handleRefreshData = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    
    const assetsToFetch = Object.values(assets).filter(a => a.apiSource === 'Yahoo Finance' && (a.ticker || a.id));
    
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
        const yahooUrl1 = `https://query1.finance.yahoo.com/v8/finance/chart/${asset.ticker || asset.id}?period1=${period1}&period2=${period2}&interval=1d&events=history&includeAdjustedClose=true`;
        const yahooUrl2 = `https://query2.finance.yahoo.com/v8/finance/chart/${asset.ticker || asset.id}?period1=${period1}&period2=${period2}&interval=1d&events=history&includeAdjustedClose=true`;
        
        const proxies = [
          { url: `https://api.allorigins.win/raw?url=${encodeURIComponent(yahooUrl1)}`, mode: 'direct' },
          { url: `https://api.allorigins.win/raw?url=${encodeURIComponent(yahooUrl2)}`, mode: 'direct' },
          { url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(yahooUrl1)}`, mode: 'direct' },
          { url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(yahooUrl2)}`, mode: 'direct' },
          { url: `https://api.allorigins.win/get?url=${encodeURIComponent(yahooUrl1)}`, mode: 'wrapped' },
          { url: `https://api.allorigins.win/get?url=${encodeURIComponent(yahooUrl2)}`, mode: 'wrapped' },
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
        console.error('Error fetching data for', asset.ticker || asset.id, e);
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

  const { lineData, barData, histogramData, drawdownData, summary } = useRvHistoricalData({
    transactions, history, assets, rvBrokers, config,
    selectedTickers, selectedBrokers, selectedAccounts,
    startDate, endDate, linePeriod, barPeriod, histPeriod, histBins,
    drawdownPeriod, isAccumulated, unit, activeView, kpiBenefitType
  });

  const tickersToRender = selectedTickers.includes('ALL') ? tickers : selectedTickers;

  useEffect(() => {
    const handleViewGraphics = () => setActiveView('graficos');
    const handleViewMetrics = () => setActiveView('metricas');
    window.addEventListener('rv-metrics:view-graphics', handleViewGraphics);
    window.addEventListener('rv-metrics:view-metrics', handleViewMetrics);
    return () => {
      window.removeEventListener('rv-metrics:view-graphics', handleViewGraphics);
      window.removeEventListener('rv-metrics:view-metrics', handleViewMetrics);
    };
  }, []);

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

  // Render Filter item
  const FilterItem = ({ label, isSelected, onClick }) => (
    <label className="flex items-center gap-2 cursor-pointer mb-2 group" onClick={onClick}>
      <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${isSelected ? 'border-[#5b21b6]' : 'border-slate-400 group-hover:border-[#7c3aed]'}`}>
        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-[#5b21b6]"></div>}
      </div>
      <span className={`text-[11px] ${isSelected ? 'text-[#5b21b6] font-medium' : 'text-slate-600'}`}>{label}</span>
    </label>
  );

  return (
    <div className="w-full h-full bg-[#f8f9fa] flex overflow-hidden">
      
      {/* Sidebar */}
      {isSidebarOpen && (
        <ResizableSidebar defaultWidth={288} className="bg-[#f4f5f8] border-r border-slate-200 h-full overflow-y-auto">
          <div className="p-4 border-b border-slate-200 bg-[#ebeef5] sticky top-0 z-10">
            <h2 className="font-bold text-slate-700 text-sm">Filtros</h2>
          </div>
          <div className="p-4 flex flex-col gap-6">

            {/* Acciones principales movidas al menú lateral */}
            <div className="flex flex-col gap-3">
              <button 
                onClick={handleRefreshData}
                disabled={isRefreshing}
                className={`w-full justify-center px-4 py-2 text-xs font-medium border rounded-md transition-colors flex items-center gap-2 ${isRefreshing ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-white text-[#5b21b6] border-[#ddd6fe] hover:bg-[#f5f3ff]'}`}
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

              <div className="flex bg-white p-1 rounded-md border border-slate-200 w-full">
                <button onClick={() => setPrimaryMetric('VALOR')} className={`flex-1 py-1.5 text-[11px] font-medium rounded transition-colors ${primaryMetric === 'VALOR' ? 'text-[#5b21b6] bg-[#f5f3ff]' : 'text-slate-600 hover:text-slate-900'}`}>
                  Gráfica Valor
                </button>
                <button onClick={() => setPrimaryMetric('PLUSVALIA')} className={`flex-1 py-1.5 text-[11px] font-medium rounded transition-colors ${primaryMetric === 'PLUSVALIA' ? 'text-[#5b21b6] bg-[#f5f3ff]' : 'text-slate-600 hover:text-slate-900'}`}>
                  Gráfica Plusvalía
                </button>
              </div>

              <div className="flex bg-white p-1 rounded-md border border-slate-200 w-full">
                <button onClick={() => setUnit('EUR')} className={`flex-1 py-1.5 text-[11px] font-medium rounded transition-colors ${unit === 'EUR' ? 'text-[#5b21b6] bg-[#f5f3ff]' : 'text-slate-600 hover:text-slate-900'}`}>
                  Euros (€)
                </button>
                <button onClick={() => setUnit('PERCENT')} className={`flex-1 py-1.5 text-[11px] font-medium rounded transition-colors ${unit === 'PERCENT' ? 'text-[#5b21b6] bg-[#f5f3ff]' : 'text-slate-600 hover:text-slate-900'}`}>
                  Porcentaje (%)
                </button>
              </div>

              <div className="flex flex-col bg-white p-2 rounded-md border border-slate-200 w-full">
                <span className="text-[10px] font-bold text-slate-500 mb-1">Datos tarjetas (KPIs):</span>
                <div className="flex">
                  <button onClick={() => setKpiBenefitType('TOTAL')} className={`flex-1 py-1.5 text-[10px] font-medium rounded transition-colors ${kpiBenefitType === 'TOTAL' ? 'text-[#5b21b6] bg-[#f5f3ff]' : 'text-slate-600 hover:text-slate-900'}`}>
                    Realizado+Latente
                  </button>
                  <button onClick={() => setKpiBenefitType('LATENTE')} className={`flex-1 py-1.5 text-[10px] font-medium rounded transition-colors ${kpiBenefitType === 'LATENTE' ? 'text-[#5b21b6] bg-[#f5f3ff]' : 'text-slate-600 hover:text-slate-900'}`}>
                    Solo Latente
                  </button>
                </div>
              </div>
            </div>

            <hr className="border-slate-200" />
            
            {/* Fechas */}
            <div>
              <h3 className="text-[11px] font-bold text-slate-700 mb-2">Rango de Fechas:</h3>
              <div className="flex flex-col gap-2">
                <div>
                  <label className="text-[10px] text-slate-500 mb-1 block uppercase tracking-wider">Desde:</label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full text-xs rounded border-slate-300 shadow-sm focus:ring-[#5b21b6] focus:border-[#5b21b6]" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 mb-1 block uppercase tracking-wider">Hasta:</label>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full text-xs rounded border-slate-300 shadow-sm focus:ring-[#5b21b6] focus:border-[#5b21b6]" />
                </div>
              </div>
            </div>

            {/* Activos */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[11px] font-bold text-slate-700">Activos:</h3>
              </div>
              <label className="flex items-center gap-2 cursor-pointer mb-3 p-2 bg-indigo-50 border border-indigo-100 rounded-md hover:bg-indigo-100 transition-colors">
                <input type="checkbox" checked={isAccumulated} onChange={e => setIsAccumulated(e.target.checked)} className="rounded text-indigo-600 focus:ring-indigo-600 w-3.5 h-3.5" />
                <span className="text-[11px] font-bold text-indigo-900">Gráfico Acumulado</span>
              </label>
              <FilterItem label="Todos los activos" isSelected={selectedTickers.includes('ALL')} onClick={() => toggleMultiSelect('ALL', selectedTickers, setSelectedTickers)} />
              {tickers.map(t => (
                <FilterItem key={t} label={t} isSelected={selectedTickers.includes(t)} onClick={() => toggleMultiSelect(t, selectedTickers, setSelectedTickers)} />
              ))}
            </div>

            {/* Cuentas */}
            {accounts.length > 0 && (
              <div>
                <h3 className="text-[11px] font-bold text-slate-700 mb-2">Cuentas Broker:</h3>
                <FilterItem label="Todas las cuentas" isSelected={selectedAccounts.includes('ALL')} onClick={() => toggleMultiSelect('ALL', selectedAccounts, setSelectedAccounts)} />
                {accounts.map(a => (
                  <FilterItem key={a} label={a} isSelected={selectedAccounts.includes(a)} onClick={() => toggleMultiSelect(a, selectedAccounts, setSelectedAccounts)} />
                ))}
              </div>
            )}

          </div>
        </ResizableSidebar>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full min-w-0">
        {/* Header (Solo Título y Botón Sidebar) */}
        <div className="bg-white border-b border-slate-200 p-4 sticky top-0 z-10 shadow-sm flex gap-4 items-center">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-md border border-slate-200 bg-slate-50"
            title="Alternar panel de filtros"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-800">
              {activeView === 'graficos' ? 'Histórico de Inversiones' : 'Métricas de la Estrategia'}
            </h1>
            <p className="text-xs text-slate-500">Evolución de valor de mercado y rentabilidad</p>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 flex-1 flex flex-col gap-6 overflow-y-auto">
          
          {activeView === 'metricas' && (() => {
            const netProfit = kpiBenefitType === 'LATENTE' ? summary.latenteGains : summary.totalGains;
            const netProfitPct = kpiBenefitType === 'LATENTE' ? summary.plusvaliaPct : summary.roiPct;
            const capInv = summary.currentCapital;
            
            const fmtEUR = val => typeof val === 'number' && !isNaN(val) ? val.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : '-';
            const fmtEURSigned = val => typeof val === 'number' && !isNaN(val) ? val.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', signDisplay: 'always' }) : '-';
            const fmtNum = val => typeof val === 'number' && !isNaN(val) ? val.toFixed(2) : '-';
            const fmtPct = val => typeof val === 'number' && !isNaN(val) ? `${val >= 0 ? '+' : ''}${(val * 100).toFixed(2)} %` : '-';
            const fmtPctRaw = val => typeof val === 'number' && !isNaN(val) ? `${val >= 0 ? '+' : ''}${val.toFixed(2)} %` : '-';
            
            const maxDrawdownEUR = Math.abs(parseFloat(summary.metrics?.maxDrawdownEUR) || 0) * -1; // always show negative
            const maxDrawdownPct = summary.metrics?.maxDrawdownPct || 0;
            const longestDDDays = summary.metrics?.longestDDDays || 0;
            const avgDrawdown = summary.metrics?.avgDrawdown || 0;
            const avgDrawdownDays = summary.metrics?.avgDrawdownDays || 0;
            const totalTrades = summary.metrics?.totalTrades || 0;
            const percentProfitable = summary.metrics?.percentProfitable || '0.00';
            const avgTrade = parseFloat(summary.metrics?.avgTrade) || 0;
            const avgWin = parseFloat(summary.metrics?.avgWin) || 0;
            const avgLoss = parseFloat(summary.metrics?.avgLoss) || 0;
            const ratioWinLoss = summary.metrics?.ratioWinLoss || '0.00';
            
            return (
              <div className="bg-white p-6 rounded border border-slate-200 shadow-sm max-w-4xl mx-auto w-full select-text">
                <h2 className="text-sm font-bold text-slate-800 mb-4 border-b border-slate-200 pb-2">
                  Métricas de la Estrategia {kpiBenefitType === 'LATENTE' ? '(Solo Latente)' : '(Realizado + Latente)'}
                </h2>
                
                <div className="overflow-x-auto font-sans">
                  <table style={{ zoom: tableZoom }} className="w-full text-[12px] text-left border-collapse">
                    <thead>
                      <tr className="bg-[#f2f2f2] text-slate-700 font-bold border-b border-slate-300">
                        <th className="py-2.5 px-4 font-bold">Métrica</th>
                        <th className="py-2.5 px-4 text-right font-bold">Importe (€) / Valor</th>
                        <th className="py-2.5 px-4 text-right font-bold">Porcentaje (%)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Rendimiento General */}
                      <tr className="bg-slate-50 font-bold text-[#2b579a]">
                        <td colSpan={3} className="py-2 px-4 border-b border-slate-200 text-[10px] tracking-wider uppercase font-bold">RENDIMIENTO GENERAL</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600 font-medium">Beneficio Neto {kpiBenefitType === 'LATENTE' ? 'Latente' : 'Total'}</td>
                        <td className="py-2 px-4 text-right font-bold text-slate-800 font-mono">
                          {fmtEURSigned(netProfit)}
                        </td>
                        <td className="py-2 px-4 text-right font-bold text-slate-800 font-mono">
                          {fmtPctRaw(netProfitPct)}
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Comisiones Pagadas</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">{fmtEUR(summary.metrics?.totalCommissions)}</td>
                        <td className="py-2 px-4 text-right text-slate-500 font-mono">
                          {capInv > 0 ? `-${((summary.metrics?.totalCommissions / capInv) * 100).toFixed(2)} %` : '-'}
                        </td>
                      </tr>

                      {/* RETORNOS Y RIESGO BÁSICO */}
                      <tr className="bg-slate-50 font-bold text-[#2b579a]">
                        <td colSpan={3} className="py-2 px-4 border-b border-slate-200 text-[10px] tracking-wider uppercase font-bold">Retornos y Riesgo Básico</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Risk-Free Rate</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">0.00</td>
                        <td className="py-2 px-4 text-right text-slate-500 font-mono">0.00 %</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Time in Market</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">-</td>
                        <td className="py-2 px-4 text-right text-slate-500 font-mono">{fmtPct(summary.metrics?.timeInMarket)}</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Cumulative Return</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">{fmtEUR(summary.metrics?.cumulativeGainsEUR)}</td>
                        <td className="py-2 px-4 text-right font-bold font-mono text-slate-800">
                          {fmtPct(summary.metrics?.cumulativeReturn)}
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">CAGR%</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">-</td>
                        <td className="py-2 px-4 text-right font-bold font-mono text-slate-800">
                          {fmtPct(summary.metrics?.cagr)}
                        </td>
                      </tr>

                      {/* RATIOS DE RENDIMIENTO */}
                      <tr className="bg-slate-50 font-bold text-[#2b579a]">
                        <td colSpan={3} className="py-2 px-4 border-b border-slate-200 text-[10px] tracking-wider uppercase font-bold">Ratios de Rendimiento</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Sharpe</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">{summary.metrics?.sharpeRatio}</td>
                        <td className="py-2 px-4 text-right text-slate-500 font-mono">-</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Sortino</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">{fmtNum(summary.metrics?.sortino)}</td>
                        <td className="py-2 px-4 text-right text-slate-500 font-mono">-</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Sortino/√2</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">{fmtNum(summary.metrics?.sortinoDivRoot2)}</td>
                        <td className="py-2 px-4 text-right text-slate-500 font-mono">-</td>
                      </tr>

                      {/* DOWNSIDE Y DRAWDOWN */}
                      <tr className="bg-slate-50 font-bold text-[#2b579a]">
                        <td colSpan={3} className="py-2 px-4 border-b border-slate-200 text-[10px] tracking-wider uppercase font-bold">Downside y Drawdown</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Max Drawdown</td>
                        <td className="py-2 px-4 text-right font-medium text-slate-800 font-mono">{fmtEUR(maxDrawdownEUR)}</td>
                        <td className="py-2 px-4 text-right font-bold text-slate-800 font-mono">-{parseFloat(maxDrawdownPct * 100).toFixed(2)} %</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Longest DD Days</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">{longestDDDays} días</td>
                        <td className="py-2 px-4 text-right text-slate-500 font-mono">-</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Volatility (ann.)</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">{fmtEUR(summary.metrics?.volatilityEUR)}</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">{fmtPct(summary.metrics?.volatilityAnn)}</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">R^2</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">{fmtNum(summary.metrics?.r2)}</td>
                        <td className="py-2 px-4 text-right text-slate-500 font-mono">-</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Calmar</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">{fmtNum(summary.metrics?.calmar)}</td>
                        <td className="py-2 px-4 text-right text-slate-500 font-mono">-</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Skew</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">{fmtNum(summary.metrics?.skew)}</td>
                        <td className="py-2 px-4 text-right text-slate-500 font-mono">-</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Kurtosis</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">{fmtNum(summary.metrics?.kurtosis)}</td>
                        <td className="py-2 px-4 text-right text-slate-500 font-mono">-</td>
                      </tr>

                      {/* EXPECTATIVAS DE RETORNO */}
                      <tr className="bg-slate-50 font-bold text-[#2b579a]">
                        <td colSpan={3} className="py-2 px-4 border-b border-slate-200 text-[10px] tracking-wider uppercase font-bold">Expectativas de Retorno</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Expected Daily %</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">-</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">{fmtPct(summary.metrics?.expectedDaily)}</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Expected Monthly %</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">-</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">{fmtPct(summary.metrics?.expectedMonthly)}</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Expected Yearly %</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">-</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">{fmtPct(summary.metrics?.expectedYearly)}</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Kelly Criterion</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">-</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">{fmtPct(summary.metrics?.kelly)}</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Risk of Ruin</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">-</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">{fmtPctRaw(summary.metrics?.riskOfRuin)}</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Daily Value-at-Risk</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">-</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">{fmtPct(summary.metrics?.dailyVaR)}</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Expected Shortfall (cVaR)</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">-</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">{fmtPct(summary.metrics?.expectedShortfall)}</td>
                      </tr>

                      {/* RATIOS GANANCIA/PÉRDIDA */}
                      <tr className="bg-slate-50 font-bold text-[#2b579a]">
                        <td colSpan={3} className="py-2 px-4 border-b border-slate-200 text-[10px] tracking-wider uppercase font-bold">Ratios Ganancia/Pérdida</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Gain/Pain Ratio</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">{fmtNum(summary.metrics?.gainPainRatio)}</td>
                        <td className="py-2 px-4 text-right text-slate-500 font-mono">-</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Gain/Pain (1M)</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">{fmtNum(summary.metrics?.gainPain1M)}</td>
                        <td className="py-2 px-4 text-right text-slate-500 font-mono">-</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Payoff Ratio</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">{fmtNum(summary.metrics?.payoffRatio)}</td>
                        <td className="py-2 px-4 text-right text-slate-500 font-mono">-</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Profit Factor</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">{fmtNum(summary.metrics?.profitFactor)}</td>
                        <td className="py-2 px-4 text-right text-slate-500 font-mono">-</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Common Sense Ratio</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">{fmtNum(summary.metrics?.commonSenseRatio)}</td>
                        <td className="py-2 px-4 text-right text-slate-500 font-mono">-</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">CPC Index</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">{fmtNum(summary.metrics?.cpcIndex)}</td>
                        <td className="py-2 px-4 text-right text-slate-500 font-mono">-</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Tail Ratio</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">{fmtNum(summary.metrics?.tailRatio)}</td>
                        <td className="py-2 px-4 text-right text-slate-500 font-mono">-</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Outlier Win Ratio</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">-</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">{fmtPct(summary.metrics?.outlierWinRatio)}</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Outlier Loss Ratio</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">-</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">{fmtPct(summary.metrics?.outlierLossRatio)}</td>
                      </tr>

                      {/* RETORNOS PERIÓDICOS */}
                      <tr className="bg-slate-50 font-bold text-[#2b579a]">
                        <td colSpan={3} className="py-2 px-4 border-b border-slate-200 text-[10px] tracking-wider uppercase font-bold">Retornos Periódicos</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">MTD</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">-</td>
                        <td className="py-2 px-4 text-right font-mono text-slate-800">
                          {fmtPct(summary.metrics?.mtd)}
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">3M</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">-</td>
                        <td className="py-2 px-4 text-right font-mono text-slate-800">
                          {fmtPct(summary.metrics?.threeM)}
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">6M</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">-</td>
                        <td className="py-2 px-4 text-right font-mono text-slate-800">
                          {fmtPct(summary.metrics?.sixM)}
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">YTD</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">-</td>
                        <td className="py-2 px-4 text-right font-mono text-slate-800">
                          {fmtPct(summary.metrics?.ytd)}
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">1Y</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">-</td>
                        <td className="py-2 px-4 text-right font-mono text-slate-800">
                          {fmtPct(summary.metrics?.oneY)}
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">3Y (ann.)</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">-</td>
                        <td className="py-2 px-4 text-right font-mono text-slate-800">
                          {fmtPct(summary.metrics?.threeY)}
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">5Y (ann.)</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">-</td>
                        <td className="py-2 px-4 text-right font-mono text-slate-800">
                          {fmtPct(summary.metrics?.fiveY)}
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">10Y (ann.)</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">-</td>
                        <td className="py-2 px-4 text-right font-mono text-slate-800">
                          {fmtPct(summary.metrics?.tenY)}
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">All-time (ann.)</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">-</td>
                        <td className="py-2 px-4 text-right font-mono text-slate-800">
                          {fmtPct(summary.metrics?.cagr)}
                        </td>
                      </tr>

                      {/* EXTREMOS Y MEDIAS */}
                      <tr className="bg-slate-50 font-bold text-[#2b579a]">
                        <td colSpan={3} className="py-2 px-4 border-b border-slate-200 text-[10px] tracking-wider uppercase font-bold">Extremos y Medias</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Best Day</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">-</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">{fmtPct(summary.metrics?.bestDay)}</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Worst Day</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">-</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">{fmtPct(summary.metrics?.worstDay)}</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Best Month</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">-</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">{fmtPct(summary.metrics?.bestMonth)}</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Worst Month</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">-</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">{fmtPct(summary.metrics?.worstMonth)}</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Best Year</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">-</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">{fmtPct(summary.metrics?.bestYear)}</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Worst Year</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">-</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">{fmtPct(summary.metrics?.worstYear)}</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Avg. Drawdown</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">-</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">-{parseFloat(avgDrawdown * 100).toFixed(2)} %</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Avg. Drawdown Days</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">{avgDrawdownDays.toFixed(1)} días</td>
                        <td className="py-2 px-4 text-right text-slate-500 font-mono">-</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Recovery Factor</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">{fmtNum(summary.metrics?.recoveryFactor)}</td>
                        <td className="py-2 px-4 text-right text-slate-500 font-mono">-</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Ulcer Index</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">-</td>
                        <td className="py-2 px-4 text-right text-slate-500 font-mono">{fmtPctRaw(summary.metrics?.ulcerIndex)}</td>
                      </tr>

                      {/* DESGLOSE MENSUAL Y DE ACIERTOS */}
                      <tr className="bg-slate-50 font-bold text-[#2b579a]">
                        <td colSpan={3} className="py-2 px-4 border-b border-slate-200 text-[10px] tracking-wider uppercase font-bold">Desglose Mensual y de Aciertos</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Avg. Up Month</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">-</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">{fmtPct(summary.metrics?.avgUpMonth)}</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Avg. Down Month</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">-</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">{fmtPct(summary.metrics?.avgDownMonth)}</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Win Days %</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">-</td>
                        <td className="py-2 px-4 text-right font-medium text-slate-800 font-mono">{fmtPctRaw(summary.metrics?.winDaysPct)}</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Win Month %</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">-</td>
                        <td className="py-2 px-4 text-right font-medium text-slate-800 font-mono">{fmtPctRaw(summary.metrics?.winMonthPct)}</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Win Quarter %</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">-</td>
                        <td className="py-2 px-4 text-right font-medium text-slate-800 font-mono">{fmtPctRaw(summary.metrics?.winQuarterPct)}</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Win Year %</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">-</td>
                        <td className="py-2 px-4 text-right font-medium text-slate-800 font-mono">{fmtPctRaw(summary.metrics?.winYearPct)}</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Beta</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">0.00</td>
                        <td className="py-2 px-4 text-right text-slate-500 font-mono">-</td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-4 text-slate-600">Alpha</td>
                        <td className="py-2 px-4 text-right text-slate-800 font-mono">0.00</td>
                        <td className="py-2 px-4 text-right text-slate-500 font-mono">-</td>
                      </tr>

                      {/* ESTADÍSTICAS DE TRANSACCIONES CERRADAS */}
                      {totalTrades > 0 && (
                        <>
                          <tr className="bg-slate-50 font-bold text-[#2b579a]">
                            <td colSpan={3} className="py-2 px-4 border-b border-slate-200 text-[10px] tracking-wider uppercase font-bold">Estadísticas de Transacciones Cerradas (Solo Realizado)</td>
                          </tr>
                          <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                            <td className="py-2 px-4 text-slate-600">Total de Operaciones Cerradas</td>
                            <td className="py-2 px-4 text-right text-slate-800 font-mono">{totalTrades}</td>
                            <td className="py-2 px-4 text-right text-slate-500 font-mono">-</td>
                          </tr>
                          <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                            <td className="py-2 px-4 text-slate-600">Porcentaje de Operaciones Ganadoras</td>
                            <td className="py-2 px-4 text-right text-slate-500 font-mono">-</td>
                            <td className="py-2 px-4 text-right font-medium text-slate-800 font-mono">{percentProfitable} %</td>
                          </tr>
                          <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                            <td className="py-2 px-4 text-slate-600">Media por Operación (Avg. Trade)</td>
                            <td className="py-2 px-4 text-right text-slate-800 font-mono">{fmtEUR(avgTrade)}</td>
                            <td className="py-2 px-4 text-right text-slate-500 font-mono">{capInv > 0 ? `${((avgTrade / capInv) * 100).toFixed(2)} %` : '-'}</td>
                          </tr>
                          <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                            <td className="py-2 px-4 text-slate-600">Media de Operaciones Ganadoras</td>
                            <td className="py-2 px-4 text-right text-slate-800 font-mono">{fmtEUR(avgWin)}</td>
                            <td className="py-2 px-4 text-right text-slate-500 font-mono">{capInv > 0 ? `${((avgWin / capInv) * 100).toFixed(2)} %` : '-'}</td>
                          </tr>
                          <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                            <td className="py-2 px-4 text-slate-600">Media de Operaciones Perdedoras</td>
                            <td className="py-2 px-4 text-right text-slate-800 font-mono">{fmtEUR(avgLoss)}</td>
                            <td className="py-2 px-4 text-right text-slate-500 font-mono">{capInv > 0 ? `${((avgLoss / capInv) * 100).toFixed(2)} %` : '-'}</td>
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>
                </div>

                {kpiBenefitType === 'LATENTE' && (
                  <div className="bg-amber-50 p-4 rounded text-amber-800 text-sm border border-amber-200 mt-4 font-sans">
                    ⚠️ <strong>Modo Solo Latente:</strong> Las estadísticas de trading (aciertos, rachas, medias, drawdown) se calculan únicamente sobre el histórico de operaciones ya cerradas (Realizado) o curvas de capital consolidadas. Cambia el filtro lateral a "Realizado+Latente" para visualizar el desglose completo.
                  </div>
                )}
              </div>
            );
          })()}

          {activeView === 'graficos' && (
          <>
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
              <p className="text-xs text-slate-500 font-medium mb-1">{kpiBenefitType === 'LATENTE' ? 'Plusvalía Latente' : 'Beneficio Total (Latente + Realizado)'}</p>
              <p className={`text-xl font-bold ${(kpiBenefitType === 'LATENTE' ? summary.latenteGains : summary.totalGains) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {(kpiBenefitType === 'LATENTE' ? summary.latenteGains : summary.totalGains)?.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', signDisplay: 'always' })}
              </p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-xs text-slate-500 font-medium mb-1">Rentabilidad</p>
              <p className={`text-xl font-bold ${(kpiBenefitType === 'LATENTE' ? summary.plusvaliaPct : summary.roiPct) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {(kpiBenefitType === 'LATENTE' ? summary.plusvaliaPct : summary.roiPct) > 0 ? '+' : ''}{(kpiBenefitType === 'LATENTE' ? summary.plusvaliaPct : summary.roiPct)?.toFixed(2)} %
              </p>
            </div>
          </div>

          {/* Line Chart */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm min-h-[350px]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-700">
                {primaryMetric === 'VALOR' ? 'Evolución de Valor de Mercado' : 'Evolución de la Plusvalía Latente'}
              </h2>
              <select 
                value={linePeriod} 
                onChange={e => setLinePeriod(e.target.value)} 
                className="text-xs border-slate-300 rounded shadow-sm focus:ring-[#5b21b6] focus:border-[#5b21b6] py-1 pl-2 pr-6"
              >
                <option value="DAY">Diario</option>
                <option value="MONTH">Mensual</option>
                <option value="YEAR">Anual</option>
              </select>
            </div>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={lineData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
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
                  
                  {isAccumulated ? (
                    <>
                      {primaryMetric === 'VALOR' && (
                        <>
                          <Area type="monotone" name="Capital Invertido" dataKey="capitalInvertido" stroke="#94a3b8" strokeWidth={1} fill="#94a3b8" fillOpacity={0.05} dot={false} hide={hiddenLines['capitalInvertido']} />
                          <Area type="monotone" name="Valor de Mercado" dataKey="valorMercado" stroke="#3b82f6" strokeWidth={1} fill="#3b82f6" fillOpacity={0.15} dot={false} hide={hiddenLines['valorMercado']} />
                        </>
                      )}

                      {primaryMetric === 'PLUSVALIA' && unit === 'EUR' && (
                        <Area type="monotone" name="Plusvalía Latente (€)" dataKey="beneficioLatente" stroke="#3b82f6" strokeWidth={1} fill="#3b82f6" fillOpacity={0.15} dot={false} hide={hiddenLines['beneficioLatente']} />
                      )}

                      {primaryMetric === 'PLUSVALIA' && unit === 'PERCENT' && (
                        <Area type="monotone" name="Plusvalía Latente (%)" dataKey="plusvaliaPct" stroke="#3b82f6" strokeWidth={1} fill="#3b82f6" fillOpacity={0.15} dot={false} hide={hiddenLines['plusvaliaPct']} />
                      )}
                    </>
                  ) : (
                    <>
                      {tickersToRender.map((t, idx) => {
                         const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#14b8a6', '#f97316'];
                         const color = colors[idx % colors.length];
                         if (primaryMetric === 'VALOR') {
                            return (
                               <React.Fragment key={t}>
                                 <Area type="monotone" name={`${t} (Invertido)`} dataKey={`capitalInvertido_${t}`} stroke={color} strokeWidth={1} strokeDasharray="3 3" opacity={0.6} fill="none" dot={false} hide={hiddenLines[`capitalInvertido_${t}`]} />
                                 <Area type="monotone" name={`${t} (Valor)`} dataKey={`valorMercado_${t}`} stroke={color} strokeWidth={1} fill={color} fillOpacity={0.05} dot={false} hide={hiddenLines[`valorMercado_${t}`]} />
                               </React.Fragment>
                            );
                         } else if (unit === 'EUR') {
                            return <Area key={t} type="monotone" name={`${t} (Plusvalía €)`} dataKey={`beneficioLatente_${t}`} stroke={color} strokeWidth={1} fill={color} fillOpacity={0.05} dot={false} hide={hiddenLines[`beneficioLatente_${t}`]} />;
                         } else {
                            return <Area key={t} type="monotone" name={`${t} (Plusvalía %)`} dataKey={`plusvaliaPct_${t}`} stroke={color} strokeWidth={1} fill={color} fillOpacity={0.05} dot={false} hide={hiddenLines[`plusvaliaPct_${t}`]} />;
                         }
                      })}
                    </>
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Bar Chart */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm min-h-[350px]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-700">Rentabilidad por Período</h2>
              <select 
                value={barPeriod} 
                onChange={e => setBarPeriod(e.target.value)} 
                className="text-xs border-slate-300 rounded shadow-sm focus:ring-[#5b21b6] focus:border-[#5b21b6] py-1 pl-2 pr-6"
              >
                <option value="DAY">Diario</option>
                <option value="MONTH">Mensual</option>
                <option value="YEAR">Anual</option>
              </select>
            </div>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={formatYAxis} />
                  <Tooltip formatter={formatTooltip} cursor={{ fill: '#f1f5f9' }} />
                  <Legend onClick={handleLegendClick} wrapperStyle={{ fontSize: '11px', cursor: 'pointer' }} />
                  <ReferenceLine y={0} stroke="#94a3b8" />
                  {isAccumulated ? (
                    unit === 'EUR' ? (
                      <Bar name="Beneficio Periodo (€)" dataKey="gains" fill="#3b82f6" radius={[4, 4, 0, 0]} hide={hiddenLines['gains']} />
                    ) : (
                      <Bar name="Rentabilidad Periodo (%)" dataKey="gainsPct" fill="#3b82f6" radius={[4, 4, 0, 0]} hide={hiddenLines['gainsPct']} />
                    )
                  ) : (
                    tickersToRender.map((t, idx) => {
                       const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#14b8a6', '#f97316'];
                       const color = colors[idx % colors.length];
                       return unit === 'EUR' ? (
                         <Bar key={t} name={`${t} (€)`} dataKey={`gains_${t}`} fill={color} radius={[4, 4, 0, 0]} hide={hiddenLines[`gains_${t}`]} />
                       ) : (
                         <Bar key={t} name={`${t} (%)`} dataKey={`gainsPct_${t}`} fill={color} radius={[4, 4, 0, 0]} hide={hiddenLines[`gainsPct_${t}`]} />
                       )
                    })
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Drawdown Chart */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm min-h-[250px]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-700">Drawdown del Portfolio</h2>
              <select 
                value={drawdownPeriod} 
                onChange={e => setDrawdownPeriod(e.target.value)} 
                className="text-xs border-slate-300 rounded shadow-sm focus:ring-[#5b21b6] focus:border-[#5b21b6] py-1 pl-2 pr-6"
              >
                <option value="DAY">Diario</option>
                <option value="MONTH">Mensual</option>
                <option value="YEAR">Anual</option>
              </select>
            </div>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={drawdownData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(val) => {
                      if(!val) return '';
                      const d = new Date(val);
                      return `${d.getMonth()+1}/${d.getFullYear().toString().slice(2)}`;
                  }} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={unit === 'EUR' ? formatYAxis : (v) => `${v.toFixed(1)}%`} />
                  <Tooltip formatter={(value) => unit === 'EUR' ? [`${Number(value).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}`, 'Drawdown'] : [`${Number(value).toFixed(2)}%`, 'Drawdown']} labelStyle={{ color: '#0f172a', fontWeight: 'bold' }} />
                  <Legend onClick={handleLegendClick} wrapperStyle={{ fontSize: '11px', cursor: 'pointer' }} />
                  {isAccumulated ? (
                    <Area type="monotone" name="Drawdown Global" dataKey={unit === 'EUR' ? "drawdownEUR" : "drawdownPct"} stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} hide={hiddenLines[unit === 'EUR' ? 'drawdownEUR' : 'drawdownPct']} />
                  ) : (
                    tickersToRender.map((t, idx) => {
                       const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#14b8a6', '#f97316'];
                       const color = colors[idx % colors.length];
                       const dk = unit === 'EUR' ? `drawdownEUR_${t}` : `drawdownPct_${t}`;
                       return (
                         <Area key={t} type="monotone" name={`${t} Drawdown`} dataKey={dk} stroke={color} fill={color} fillOpacity={0.3} hide={hiddenLines[dk]} />
                       )
                    })
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Frequency Histogram Chart */}
          {histogramData && histogramData.length > 0 && (
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm min-h-[300px]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-700">Distribución de Frecuencias</h2>
              <div className="flex items-center gap-2">
                <select 
                  value={histBins} 
                  onChange={e => setHistBins(parseInt(e.target.value))} 
                  className="text-xs border-slate-300 rounded shadow-sm focus:ring-[#5b21b6] focus:border-[#5b21b6] py-1 pl-2 pr-2"
                >
                  <option value={10}>10 Bins</option>
                  <option value={15}>15 Bins</option>
                  <option value={20}>20 Bins</option>
                  <option value={30}>30 Bins</option>
                  <option value={50}>50 Bins</option>
                </select>
                <select 
                  value={histPeriod} 
                  onChange={e => setHistPeriod(e.target.value)} 
                  className="text-xs border-slate-300 rounded shadow-sm focus:ring-[#5b21b6] focus:border-[#5b21b6] py-1 pl-2 pr-6"
                >
                  <option value="DAY">Diario</option>
                  <option value="MONTH">Mensual</option>
                  <option value="YEAR">Anual</option>
                </select>
              </div>
            </div>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={histogramData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }} barCategoryGap={0} barGap={0}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                  <Tooltip labelStyle={{ color: '#0f172a', fontWeight: 'bold' }} />
                  <Legend onClick={handleLegendClick} wrapperStyle={{ fontSize: '11px', cursor: 'pointer' }} />
                  {isAccumulated ? (
                    <>
                      <Bar name="Frecuencia (Días/Meses)" dataKey="count" fill="#3b82f6" fillOpacity={0.45} radius={[4, 4, 0, 0]} hide={hiddenLines['count']} />
                      <Line type="monotone" name="Densidad Normal" dataKey="density" stroke="#3b82f6" strokeWidth={2} dot={false} hide={hiddenLines['density']} />
                    </>
                  ) : (
                    tickersToRender.map((t, idx) => {
                       const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#14b8a6', '#f97316'];
                       const color = colors[idx % colors.length];
                       return (
                         <React.Fragment key={t}>
                           <Bar name={`Frecuencia ${t}`} dataKey={`count_${t}`} fill={color} fillOpacity={0.35} radius={[4, 4, 0, 0]} hide={hiddenLines[`count_${t}`]} />
                           <Line type="monotone" name={`Densidad ${t}`} dataKey={`density_${t}`} stroke={color} strokeWidth={2} dot={false} hide={hiddenLines[`density_${t}`]} />
                         </React.Fragment>
                       )
                    })
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
          )}
          </>
          )}

        </div>
        
        {/* Bottom Bar for Zoom */}
        <div className="flex justify-end bg-[#f0f0f0] p-1 border-t border-gray-300 shrink-0 mt-auto w-full z-50">
          <ZoomControl />
        </div>
      </div>
    </div>
  );
}
