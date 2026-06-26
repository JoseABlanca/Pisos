import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import Window from '../components/Window';
import { 
  Search, Plus, Trash2, Edit, Save, X, Download, 
  TrendingUp, TrendingDown, Landmark, Briefcase, DollarSign, Calendar, PanelLeft
} from 'lucide-react';
import { handleExportFormat } from '../utils/exportUtils';
import ZoomControl from '../components/ZoomControl';
import { useTableColumns } from '../hooks/useTableColumns';
import { useTableFilters } from '../hooks/useTableFilters';
import { exportToPDF } from '../utils/pdfExport';
import { PieChart, Pie, Cell, BarChart as ReBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import RvTransactionModal from '../components/RvTransactionModal';

export default function Portfolio() {
  const { user, queryUserIds } = useAuth();
  
  // State variables
  const [transactions, setTransactions] = useState([]);
  const [assets, setAssets] = useState([]);
  const [brokers, setBrokers] = useState([]);
  const [config, setConfig] = useState({ exchangeRates: { USD: 1.08, GBP: 0.85, CHF: 0.95 } });
  
  const [selectedHolding, setSelectedHolding] = useState(null);
  const [showTxForm, setShowTxForm] = useState(false);
  const [isEditingTx, setIsEditingTx] = useState(false);
  const [portfolioTab, setPortfolioTab] = useState('posiciones'); // 'posiciones' | 'graficos'
  const [searchQuery, setSearchQuery] = useState('');
  const [groupBy, setGroupBy] = useState('none'); // 'none' | 'symbol' | 'broker'
  const [selectedBrokers, setSelectedBrokers] = useState([]);
  const [selectedAssets, setSelectedAssets] = useState([]);
  const [showSidebar, setShowSidebar] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const [txFormData, setTxFormData] = useState({
    id: '',
    assetId: '',
    brokerId: '',
    type: 'Compra',
    date: new Date().toISOString().split('T')[0],
    quantity: '',
    price: '',
    fee: '0',
    exchangeRate: '1.0',
    currency: 'EUR',
    notes: ''
  });

  const DEFAULT_COLUMNS_PORTFOLIO = ['symbol', 'name', 'type', 'brokerName', 'quantity', 'pmc', 'currentPrice', 'totalCost', 'currentValue', 'pnl', 'pnlPercent'];
  const { 
    visibleColumns: visColsPortfolio, 
    toggleColumn: toggleColPortfolio, 
    columnWidths: colWidthsPortfolio, 
    updateColumnWidth: updateColWidthPortfolio 
  } = useTableColumns('rv-portfolio', DEFAULT_COLUMNS_PORTFOLIO);
  const { 
    applyTableFilters: applyPortfolioFilters, 
    TableHeaderWithFilter: PortfolioHeaderWithFilter, 
    renderFilterMenu: renderPortfolioFilterMenu 
  } = useTableFilters({ columnWidths: colWidthsPortfolio, updateColumnWidth: updateColWidthPortfolio });


  // Compute Portfolio holdings dynamically - declared early to avoid TDZ
  const { holdings, summary } = useMemo(() => {
    const exchangeRates = config.exchangeRates || { USD: 1.08, GBP: 0.85, CHF: 0.95 };
    const rates = { EUR: 1.0, ...exchangeRates };

    const assetsMap = new Map(assets.map(a => [a.id, a]));
    const brokersMap = new Map(brokers.map(b => [b.id, b]));

    // Chronological transactions sorting
    const chronTx = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Holds key: `assetId_brokerId` -> position detail
    const positions = {};
    let totalDividendsEUR = 0;

    chronTx.forEach(tx => {
      const asset = assetsMap.get(tx.assetId);
      const broker = brokersMap.get(tx.brokerId);
      
      const key = `${tx.assetId}_${tx.brokerId}`;
      const rate = tx.exchangeRate || 1.0;

      if (tx.type === 'Dividendo') {
        const divEUR = (parseFloat(tx.quantity) * parseFloat(tx.price) - (parseFloat(tx.fee) || 0)) / rate;
        totalDividendsEUR += divEUR;
        return;
      }

      if (!positions[key]) {
        positions[key] = {
          symbol: tx.assetId,
          name: asset?.name || tx.assetId,
          type: asset?.type || 'Acción',
          sector: asset?.sector || 'Otros',
          currency: asset?.currency || 'EUR',
          brokerId: tx.brokerId,
          brokerName: broker?.name || tx.brokerId,
          quantity: 0,
          costBasisEUR: 0,
          pmcEUR: 0
        };
      }

      const pos = positions[key];
      const q = parseFloat(tx.quantity) || 0;
      const p = parseFloat(tx.price) || 0;
      const f = parseFloat(tx.fee) || 0;

      if (tx.type === 'Compra') {
        const costEUR = (q * p + f) / rate;
        pos.costBasisEUR += costEUR;
        pos.quantity += q;
        pos.pmcEUR = pos.quantity > 0 ? pos.costBasisEUR / pos.quantity : 0;
      } else if (tx.type === 'Venta') {
        const costReductionEUR = q * pos.pmcEUR;
        pos.costBasisEUR = Math.max(0, pos.costBasisEUR - costReductionEUR);
        pos.quantity = Math.max(0, pos.quantity - q);
        if (pos.quantity === 0) {
          pos.costBasisEUR = 0;
          pos.pmcEUR = 0;
        }
      }
    });

    // Calculate current valuations in EUR
    const finalHoldings = Object.values(positions)
      .filter(pos => pos.quantity > 0)
      .map(pos => {
        const asset = assetsMap.get(pos.symbol);
        const currentPriceRaw = asset ? parseFloat(asset.currentPrice) || 0 : 0;
        const assetRate = rates[pos.currency] || 1.0;

        const totalCostEUR = pos.costBasisEUR;
        const currentValueEUR = (pos.quantity * currentPriceRaw) / assetRate;
        const pnlEUR = currentValueEUR - totalCostEUR;
        const pnlPercent = totalCostEUR > 0 ? (pnlEUR / totalCostEUR) * 100 : 0;

        return {
          ...pos,
          pmc: pos.pmcEUR,
          currentPrice: currentPriceRaw / assetRate, // in EUR
          currentPriceRaw, // original currency
          totalCost: totalCostEUR,
          currentValue: currentValueEUR,
          pnl: pnlEUR,
          pnlPercent
        };
      });

    // Summary calculation
    const totalCostEUR = finalHoldings.reduce((sum, h) => sum + h.totalCost, 0);
    const totalMarketValueEUR = finalHoldings.reduce((sum, h) => sum + h.currentValue, 0);
    const totalPnLEUR = totalMarketValueEUR - totalCostEUR;
    const totalPnLPercent = totalCostEUR > 0 ? (totalPnLEUR / totalCostEUR) * 100 : 0;

    const totalCashEUR = brokers.reduce((sum, b) => {
      const brokerRate = rates[b.currency] || 1.0;
      return sum + (parseFloat(b.cashBalance) || 0) / brokerRate;
    }, 0);

    return {
      holdings: finalHoldings,
      summary: {
        totalCost: totalCostEUR,
        totalValue: totalMarketValueEUR,
        pnl: totalPnLEUR,
        pnlPercent: totalPnLPercent,
        dividends: totalDividendsEUR,
        cash: totalCashEUR,
        grandTotal: totalMarketValueEUR + totalCashEUR
      }
    };
  }, [transactions, assets, brokers, config]);


  const filteredHoldings = useMemo(() => {
    let list = holdings;

    // Broker filter (multi-selection)
    if (selectedBrokers.length > 0) {
      list = list.filter(h => selectedBrokers.includes(h.brokerId));
    }

    // Asset filter (multi-selection)
    if (selectedAssets.length > 0) {
      list = list.filter(h => selectedAssets.includes(h.symbol));
    }

    return applyPortfolioFilters(list, 'rv-portfolio');
  }, [holdings, selectedBrokers, selectedAssets, applyPortfolioFilters]);

  const groupedHoldings = useMemo(() => {
    if (groupBy === 'none') return filteredHoldings;
    
    const groups = {};
    filteredHoldings.forEach(h => {
      const key = groupBy === 'symbol' ? h.symbol : h.brokerName;
      if (!groups[key]) {
        groups[key] = {
          symbol: groupBy === 'symbol' ? h.symbol : 'Varios',
          name: groupBy === 'symbol' ? h.name : 'Varios',
          type: groupBy === 'symbol' ? h.type : 'Varios',
          brokerName: groupBy === 'symbol' ? 'Varios' : h.brokerName,
          quantity: 0,
          totalCost: 0,
          currentValue: 0,
          pnl: 0,
          pnlPercent: 0,
          pmc: 0,
          currentPrice: 0,
          currency: groupBy === 'symbol' ? h.currency : 'EUR',
          currentPriceRaw: 0,
          isGrouped: true,
          components: []
        };
      }
      const g = groups[key];
      g.quantity += h.quantity;
      g.totalCost += h.totalCost;
      g.currentValue += h.currentValue;
      g.pnl += h.pnl;
      g.components.push(h);
    });

    return Object.values(groups).map(g => {
      g.pmc = g.quantity > 0 ? g.totalCost / g.quantity : 0;
      g.currentPrice = g.quantity > 0 ? g.currentValue / g.quantity : 0;
      g.pnlPercent = g.totalCost > 0 ? (g.pnl / g.totalCost) * 100 : 0;
      if (groupBy === 'symbol' && g.components.length > 0) {
        g.currentPriceRaw = g.components[0].currentPriceRaw;
      }
      return g;
    });
  }, [filteredHoldings, groupBy]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fetch data from Firestore
  useEffect(() => {
    if (!user) return;
    const targetUserIds = queryUserIds?.length > 0 ? queryUserIds : [user.uid];

    const unsubTxs = onSnapshot(
      query(collection(db, 'rv_transactions'), where('userId', 'in', targetUserIds)),
      (snap) => setTransactions(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
      (err) => console.error('Error fetching transactions:', err)
    );

    const unsubAssets = onSnapshot(
      query(collection(db, 'rv_assets'), where('userId', 'in', targetUserIds)),
      (snap) => setAssets(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
      (err) => console.error('Error fetching assets:', err)
    );

    const unsubBrokers = onSnapshot(
      query(collection(db, 'rv_brokers'), where('userId', 'in', targetUserIds)),
      (snap) => setBrokers(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
      (err) => console.error('Error fetching brokers:', err)
    );

    const unsubConfig = onSnapshot(
      doc(db, 'rv_config', user.uid),
      (snap) => {
        if (snap.exists()) setConfig(snap.data());
      },
      (err) => console.error('Error fetching config:', err)
    );

    return () => {
      unsubTxs();
      unsubAssets();
      unsubBrokers();
      unsubConfig();
    };
  }, [user, queryUserIds]);

  // Sync portfolio subtab to Layout
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('portfolio:subtab-change', { detail: { subtab: portfolioTab } }));
  }, [portfolioTab]);

  // Ribbon event handling
  useEffect(() => {
    const onNew = () => handleNewTx();
    const onEdit = () => {
      if (selectedHolding) {
        const matchingTxs = transactions
          .filter(t => {
            const matchAsset = selectedHolding.symbol === 'Varios' || t.assetId === selectedHolding.symbol;
            const matchBroker = selectedHolding.brokerId === 'Varios' || t.brokerId === selectedHolding.brokerId;
            return matchAsset && matchBroker;
          })
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        
        if (matchingTxs.length > 0) {
          handleEditTx(matchingTxs[0]);
        } else {
          alert('No se encontraron transacciones para esta posición.');
        }
      } else {
        alert('Por favor, seleccione una fila (posición) para modificar.');
      }
    };
    const onDelete = () => {
      if (selectedHolding) {
        const matchingTxs = transactions
          .filter(t => {
            const matchAsset = selectedHolding.symbol === 'Varios' || t.assetId === selectedHolding.symbol;
            const matchBroker = selectedHolding.brokerId === 'Varios' || t.brokerId === selectedHolding.brokerId;
            return matchAsset && matchBroker;
          })
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        
        if (matchingTxs.length > 0) {
          handleDeleteTx(matchingTxs[0]);
        } else {
          alert('No se encontraron transacciones para esta posición.');
        }
      } else {
        alert('Por favor, seleccione una fila (posición) para eliminar.');
      }
    };
    const onExport = (e) => {
      const format = e.detail?.format || 'csv';
      if (format === 'pdf') {
        const cols = [
          { header: 'Ticker', dataKey: 'symbol' },
          { header: 'Nombre', dataKey: 'name' },
          { header: 'Tipo', dataKey: 'type' },
          { header: 'Broker', dataKey: 'brokerName' },
          { header: 'Cant.', dataKey: 'quantity' },
          { header: 'PMC (€)', dataKey: 'pmc' },
          { header: 'Mercado (€)', dataKey: 'currentPrice' },
          { header: 'Coste (€)', dataKey: 'totalCost' },
          { header: 'Valor (€)', dataKey: 'currentValue' },
          { header: 'PnL (€)', dataKey: 'pnl' },
          { header: 'PnL (%)', dataKey: 'pnlPercent' }
        ];
        exportToPDF(holdings, cols, 'Cartera de Renta Variable', 'cartera.pdf');
      } else {
        handleExportFormat(holdings, 'Cartera Renta Variable', format);
      }
    };

    window.addEventListener('rv-transaction:new', onNew);
    window.addEventListener('rv-transaction:edit', onEdit);
    window.addEventListener('rv-transaction:delete', onDelete);
    window.addEventListener('rv-transaction:export', onExport);

    return () => {
      window.removeEventListener('rv-transaction:new', onNew);
      window.removeEventListener('rv-transaction:edit', onEdit);
      window.removeEventListener('rv-transaction:delete', onDelete);
      window.removeEventListener('rv-transaction:export', onExport);
    };
  }, [transactions, selectedHolding, portfolioTab, config, assets, brokers, holdings]);

  // Transaction form triggers
  const handleNewTx = () => {
    setIsEditingTx(false);
    const maxId = transactions.reduce((max, t) => {
      const num = parseInt(t.id.replace('TX', '')) || 0;
      return num > max ? num : max;
    }, 0);

    const assetId = selectedHolding && selectedHolding.symbol !== 'Varios' ? selectedHolding.symbol : (assets[0]?.id || '');
    const brokerId = selectedHolding && selectedHolding.brokerId !== 'Varios' ? selectedHolding.brokerId : (brokers[0]?.id || '');
    const selectedAsset = assets.find(a => a.id === assetId);

    setTxFormData({
      id: `TX${String(maxId + 1).padStart(3, '0')}`,
      assetId: assetId,
      brokerId: brokerId,
      type: 'Compra',
      date: new Date().toISOString().split('T')[0],
      quantity: '',
      price: '',
      fee: '0',
      exchangeRate: '1.0',
      currency: selectedAsset?.currency || 'EUR',
      notes: ''
    });
    setShowTxForm(true);
  };

  const handleEditTx = (tx) => {
    setIsEditingTx(true);
    setTxFormData({ ...tx });
    setShowTxForm(true);
  };

  const handleDeleteTx = async (tx) => {
    if (window.confirm(`¿Está seguro de que desea eliminar la transacción ${tx.id}?`)) {
      try {
        await deleteDoc(doc(db, 'rv_transactions', tx.id));
        setSelectedTx(null);
      } catch (error) {
        console.error('Error deleting transaction:', error);
        alert('Error al eliminar transacción: ' + error.message);
      }
    }
  };


  // Recharts Chart Data Prep
  const chartsData = useMemo(() => {
    const assetTypeAlloc = {};
    const sectorAlloc = {};
    const brokerAlloc = {};
    const assetCostValue = [];

    filteredHoldings.forEach(h => {
      assetTypeAlloc[h.type] = (assetTypeAlloc[h.type] || 0) + h.currentValue;
      sectorAlloc[h.sector] = (sectorAlloc[h.sector] || 0) + h.currentValue;
      brokerAlloc[h.brokerName] = (brokerAlloc[h.brokerName] || 0) + h.currentValue;

      assetCostValue.push({
        name: h.symbol,
        coste: Math.round(h.totalCost),
        valor: Math.round(h.currentValue)
      });
    });

    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

    const formatPie = (obj) => Object.entries(obj).map(([name, value], idx) => ({
      name,
      value,
      color: COLORS[idx % COLORS.length]
    }));

    return {
      types: formatPie(assetTypeAlloc),
      sectors: formatPie(sectorAlloc),
      brokers: formatPie(brokerAlloc),
      bars: assetCostValue
    };
  }, [filteredHoldings]);

  return (
    <div className="w-full h-full bg-[#d4d0c8] flex flex-col p-1 overflow-hidden font-sans select-none">
      {/* Top summary bar */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-2 p-1.5 bg-[#f0f4f9] border border-gray-300 rounded-sm">
        <div className="bg-white p-2 border border-slate-300 rounded-sm shadow-sm flex items-center space-x-3">
          <div className="p-2 bg-blue-100 rounded-full text-blue-600"><Briefcase className="w-5 h-5" /></div>
          <div>
            <p className="text-[9px] uppercase font-bold text-gray-500">Inversión (Coste)</p>
            <p className="text-[13px] font-bold text-slate-800 font-mono">
              {summary.totalCost.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
            </p>
          </div>
        </div>

        <div className="bg-white p-2 border border-slate-300 rounded-sm shadow-sm flex items-center space-x-3">
          <div className="p-2 bg-emerald-100 rounded-full text-emerald-600"><TrendingUp className="w-5 h-5" /></div>
          <div>
            <p className="text-[9px] uppercase font-bold text-gray-500">Valor de Mercado</p>
            <p className="text-[13px] font-bold text-slate-800 font-mono">
              {summary.totalValue.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
            </p>
          </div>
        </div>

        <div className={`p-2 border rounded-sm shadow-sm flex items-center space-x-3 bg-white ${summary.pnl >= 0 ? 'border-green-300' : 'border-red-300'}`}>
          <div className={`p-2 rounded-full ${summary.pnl >= 0 ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
            {summary.pnl >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
          </div>
          <div>
            <p className="text-[9px] uppercase font-bold text-gray-500">Plusvalía/Minusvalía</p>
            <p className={`text-[13px] font-bold font-mono ${summary.pnl >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {summary.pnl >= 0 ? '+' : ''}{summary.pnl.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € 
              <span className="text-[10px] ml-1">({summary.pnlPercent.toFixed(2)}%)</span>
            </p>
          </div>
        </div>

        <div className="bg-white p-2 border border-slate-300 rounded-sm shadow-sm flex items-center space-x-3">
          <div className="p-2 bg-amber-100 rounded-full text-amber-600"><DollarSign className="w-5 h-5" /></div>
          <div>
            <p className="text-[9px] uppercase font-bold text-gray-500">Dividendos Cobrados</p>
            <p className="text-[13px] font-bold text-slate-800 font-mono">
              {summary.dividends.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
            </p>
          </div>
        </div>

        <div className="bg-white p-2 border border-slate-300 rounded-sm shadow-sm flex items-center space-x-3">
          <div className="p-2 bg-slate-100 rounded-full text-slate-600"><Landmark className="w-5 h-5" /></div>
          <div>
            <p className="text-[9px] uppercase font-bold text-gray-500">Efectivo Brokers</p>
            <p className="text-[13px] font-bold text-slate-800 font-mono">
              {summary.cash.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
            </p>
          </div>
        </div>

        <div className="bg-[#4e80c8] p-2 border border-blue-600 rounded-sm shadow-sm flex items-center space-x-3 text-white">
          <div className="p-2 bg-white/20 rounded-full text-white"><Briefcase className="w-5 h-5" /></div>
          <div>
            <p className="text-[9px] uppercase font-bold text-white/80">Patrimonio Total</p>
            <p className="text-[13px] font-bold font-mono">
              {summary.grandTotal.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-row flex-1 overflow-hidden bg-white relative">
        {/* Left Sidebar filters */}
        {showSidebar && (
          <div className="w-64 bg-[#f0f4f9] border-r border-gray-200 flex flex-col shrink-0 transition-all">
            <div className="bg-[#e4ebf5] border-b border-gray-200 p-2 text-[12px] font-bold text-slate-700 flex justify-between items-center">
              <span>Filtros</span>
            </div>
            <div className="p-4 text-[11px] space-y-4 flex-1 overflow-auto">
              {/* Group By Option */}
              <div className="space-y-2 pb-2 border-b border-gray-300">
                <label className="text-slate-700 font-bold block">Agrupar tabla posiciones:</label>
                <div className="space-y-1">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="groupBy"
                      checked={groupBy === 'none'}
                      onChange={() => setGroupBy('none')}
                      className="text-indigo-600 focus:ring-indigo-500 cursor-pointer text-xs"
                    />
                    <span className={groupBy === 'none' ? 'text-indigo-700 font-bold' : 'text-slate-700'}>
                      Sin agrupar (Detalle)
                    </span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="groupBy"
                      checked={groupBy === 'symbol'}
                      onChange={() => setGroupBy('symbol')}
                      className="text-indigo-600 focus:ring-indigo-500 cursor-pointer text-xs"
                    />
                    <span className={groupBy === 'symbol' ? 'text-indigo-700 font-bold' : 'text-slate-700'}>
                      Agrupar por Acción (Ticker)
                    </span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="groupBy"
                      checked={groupBy === 'broker'}
                      onChange={() => setGroupBy('broker')}
                      className="text-indigo-600 focus:ring-indigo-500 cursor-pointer text-xs"
                    />
                    <span className={groupBy === 'broker' ? 'text-indigo-700 font-bold' : 'text-slate-700'}>
                      Agrupar por Broker
                    </span>
                  </label>
                </div>
              </div>

              {/* Broker Filter (Multi-select) */}
              <div className="space-y-2 pb-2 border-b border-gray-300">
                <label className="text-slate-700 font-bold block">Filtrar por Broker:</label>
                <div className="flex justify-between items-center text-[9px] text-blue-600 mb-1">
                  <button onClick={() => setSelectedBrokers([])} className="hover:underline cursor-pointer">Todos</button>
                  <button onClick={() => setSelectedBrokers(brokers.map(b => b.id))} className="hover:underline cursor-pointer">Ninguno</button>
                </div>
                <div className="max-h-36 overflow-y-auto space-y-1">
                  {brokers.map((broker) => {
                    const isChecked = selectedBrokers.includes(broker.id);
                    return (
                      <label key={broker.id} className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setSelectedBrokers(prev => 
                              isChecked ? prev.filter(id => id !== broker.id) : [...prev, broker.id]
                            );
                          }}
                          className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer text-xs"
                        />
                        <span className={isChecked ? 'text-indigo-700 font-bold' : 'text-slate-700'}>
                          {broker.name}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Asset Filter (Multi-select) */}
              <div className="space-y-2">
                <label className="text-slate-700 font-bold block">Filtrar por Acción:</label>
                <div className="flex justify-between items-center text-[9px] text-blue-600 mb-1">
                  <button onClick={() => setSelectedAssets([])} className="hover:underline cursor-pointer">Todos</button>
                  <button onClick={() => setSelectedAssets(assets.map(a => a.id))} className="hover:underline cursor-pointer">Ninguno</button>
                </div>
                <div className="max-h-36 overflow-y-auto space-y-1">
                  {assets.map((asset) => {
                    const isChecked = selectedAssets.includes(asset.id);
                    return (
                      <label key={asset.id} className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setSelectedAssets(prev => 
                              isChecked ? prev.filter(id => id !== asset.id) : [...prev, asset.id]
                            );
                          }}
                          className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer text-xs"
                        />
                        <span className={isChecked ? 'text-indigo-700 font-bold' : 'text-slate-700'}>
                          {asset.id} - {asset.name}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          {/* Sub-tabs menu */}
          <div className="p-1.5 border-b border-gray-200 flex justify-between items-center bg-[#f8fafc]">
            <div className="flex items-center space-x-3">
              <button 
                onClick={(e) => { e.stopPropagation(); setShowSidebar(!showSidebar); }}
                className="p-1.5 hover:bg-gray-100 rounded text-gray-500 border border-transparent hover:border-gray-300 flex items-center justify-center cursor-pointer"
                title={showSidebar ? "Ocultar panel" : "Mostrar panel"}
              >
                <PanelLeft className="w-4 h-4" />
              </button>
              <div className="flex space-x-1 border-l border-gray-300 pl-3">
                <button
                  onClick={() => setPortfolioTab('posiciones')}
                  className={`px-3 py-1 text-[11px] font-bold border rounded-sm transition-all cursor-pointer ${
                    portfolioTab === 'posiciones'
                      ? 'bg-blue-600 text-white border-blue-700'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  Posiciones Abiertas
                </button>

                <button
                  onClick={() => setPortfolioTab('graficos')}
                  className={`px-3 py-1 text-[11px] font-bold border rounded-sm transition-all cursor-pointer ${
                    portfolioTab === 'graficos'
                      ? 'bg-blue-600 text-white border-blue-700'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  Gráficos de Distribución
                </button>
              </div>
            </div>

            <div className="relative" onClick={e => e.stopPropagation()}>
              <input 
                type="text" 
                placeholder="Buscar en el fichero (Alt+B)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-2 pr-8 py-1 border-b border-gray-400 text-[12px] w-64 outline-none focus:border-blue-500 bg-transparent"
              />
              <Search className="w-4 h-4 absolute right-1 top-1/2 -translate-y-1/2 text-gray-500" />
            </div>
          </div>

          {/* Holdings View */}
          {portfolioTab === 'posiciones' && (
            <div className="win-table-container">
              <table className="clean-table">
                <thead>
                  <tr>
                    {visColsPortfolio.includes('symbol') && (
                      <PortfolioHeaderWithFilter 
                        label="Ticker" 
                        columnKey="symbol" 
                        data={holdings} 
                        tableId="rv-portfolio" 
                      />
                    )}
                    {visColsPortfolio.includes('name') && (
                      <PortfolioHeaderWithFilter 
                        label="Nombre" 
                        columnKey="name" 
                        data={holdings} 
                        tableId="rv-portfolio" 
                      />
                    )}
                    {visColsPortfolio.includes('type') && (
                      <PortfolioHeaderWithFilter 
                        label="Tipo" 
                        columnKey="type" 
                        data={holdings} 
                        tableId="rv-portfolio" 
                      />
                    )}
                    {visColsPortfolio.includes('brokerName') && (
                      <PortfolioHeaderWithFilter 
                        label="Broker" 
                        columnKey="brokerName" 
                        data={holdings} 
                        tableId="rv-portfolio" 
                      />
                    )}
                    {visColsPortfolio.includes('quantity') && (
                      <PortfolioHeaderWithFilter 
                        label="Títulos" 
                        columnKey="quantity" 
                        data={holdings} 
                        tableId="rv-portfolio" 
                        className="text-right"
                      />
                    )}
                    {visColsPortfolio.includes('pmc') && (
                      <PortfolioHeaderWithFilter 
                        label="P.Medio Compra" 
                        columnKey="pmc" 
                        data={holdings} 
                        tableId="rv-portfolio" 
                        className="text-right"
                      />
                    )}
                    {visColsPortfolio.includes('currentPrice') && (
                      <PortfolioHeaderWithFilter 
                        label="Precio Mercado" 
                        columnKey="currentPrice" 
                        data={holdings} 
                        tableId="rv-portfolio" 
                        className="text-right"
                      />
                    )}
                    {visColsPortfolio.includes('totalCost') && (
                      <PortfolioHeaderWithFilter 
                        label="Coste Total" 
                        columnKey="totalCost" 
                        data={holdings} 
                        tableId="rv-portfolio" 
                        className="text-right"
                      />
                    )}
                    {visColsPortfolio.includes('currentValue') && (
                      <PortfolioHeaderWithFilter 
                        label="Valor Actual" 
                        columnKey="currentValue" 
                        data={holdings} 
                        tableId="rv-portfolio" 
                        className="text-right"
                      />
                    )}
                    {visColsPortfolio.includes('pnl') && (
                      <PortfolioHeaderWithFilter 
                        label="Rentabilidad" 
                        columnKey="pnl" 
                        data={holdings} 
                        tableId="rv-portfolio" 
                        className="text-right"
                      />
                    )}
                    {visColsPortfolio.includes('pnlPercent') && (
                      <PortfolioHeaderWithFilter 
                        label="% PnL" 
                        columnKey="pnlPercent" 
                        data={holdings} 
                        tableId="rv-portfolio" 
                        className="text-right"
                      />
                    )}
                  </tr>
                </thead>
                <tbody>
                  {groupedHoldings.length === 0 ? (
                    <tr>
                      <td colSpan={visColsPortfolio.length} className="text-center py-8 text-gray-400 font-medium">
                        No hay posiciones abiertas en cartera. Registre una nueva compra o cargue datos de ejemplo.
                      </td>
                    </tr>
                  ) : (
                    groupedHoldings.map((h, index) => (
                      <tr
                        key={index}
                        onClick={() => setSelectedHolding(selectedHolding?.symbol === h.symbol && selectedHolding?.brokerId === h.brokerId ? null : h)}
                        className={selectedHolding?.symbol === h.symbol && selectedHolding?.brokerId === h.brokerId ? 'selected' : ''}
                      >
                        {visColsPortfolio.includes('symbol') && <td>{h.symbol}</td>}
                        {visColsPortfolio.includes('name') && <td>{h.name}</td>}
                        {visColsPortfolio.includes('type') && <td>{h.type}</td>}
                        {visColsPortfolio.includes('brokerName') && <td>{h.brokerName}</td>}
                        {visColsPortfolio.includes('quantity') && <td className="font-mono text-right">{h.quantity}</td>}
                        {visColsPortfolio.includes('pmc') && (
                          <td className="font-mono text-right">
                            {h.pmc.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €
                          </td>
                        )}
                        {visColsPortfolio.includes('currentPrice') && (
                          <td className="font-mono text-right">
                            {h.currency && h.currency !== 'EUR' && h.currentPriceRaw ? (
                              <>
                                <span className="font-semibold text-slate-800">
                                  {h.currentPriceRaw.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} {h.currency}
                                </span>
                                <span className="text-slate-400 text-[10px] block font-normal">
                                  {h.currentPrice.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                                </span>
                              </>
                            ) : (
                              `${h.currentPrice.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
                            )}
                          </td>
                        )}
                        {visColsPortfolio.includes('totalCost') && (
                          <td className="font-mono text-right">
                            {h.totalCost.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                          </td>
                        )}
                        {visColsPortfolio.includes('currentValue') && (
                          <td className="font-mono text-right font-bold text-slate-700">
                            {h.currentValue.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                          </td>
                        )}
                        {visColsPortfolio.includes('pnl') && (
                          <td className={`font-mono text-right font-bold ${h.pnl >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                            {h.pnl >= 0 ? '+' : ''}{h.pnl.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                          </td>
                        )}
                        {visColsPortfolio.includes('pnlPercent') && (
                          <td className={`font-mono text-right font-bold ${h.pnl >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                            {h.pnl >= 0 ? '+' : ''}{h.pnlPercent.toFixed(2)}%
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}



          {/* Charts View */}
          {portfolioTab === 'graficos' && (
            <div className="flex-1 overflow-auto p-4 bg-slate-50 space-y-6">
              {holdings.length === 0 ? (
                <div className="text-center py-16 text-gray-400 font-medium">
                  Cargue datos o registre transacciones para visualizar los gráficos del portfolio.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Allocation by asset type */}
                    <div className="bg-white p-4 border border-gray-200 shadow-sm rounded flex flex-col items-center">
                      <h4 className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-4">
                        Distribución por Tipo de Activo
                      </h4>
                      <div className="w-full h-48">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={chartsData.types}
                              cx="50%"
                              cy="50%"
                              outerRadius={65}
                              fill="#8884d8"
                              dataKey="value"
                              label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                              labelLine={false}
                            >
                              {chartsData.types.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value) => `${value.toLocaleString('es-ES')} €`} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Allocation by sector */}
                    <div className="bg-white p-4 border border-gray-200 shadow-sm rounded flex flex-col items-center">
                      <h4 className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-4">
                        Distribución por Sector
                      </h4>
                      <div className="w-full h-48">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={chartsData.sectors}
                              cx="50%"
                              cy="50%"
                              outerRadius={65}
                              fill="#8884d8"
                              dataKey="value"
                              label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                              labelLine={false}
                            >
                              {chartsData.sectors.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value) => `${value.toLocaleString('es-ES')} €`} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Allocation by broker */}
                    <div className="bg-white p-4 border border-gray-200 shadow-sm rounded flex flex-col items-center">
                      <h4 className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-4">
                        Distribución por Broker
                      </h4>
                      <div className="w-full h-48">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={chartsData.brokers}
                              cx="50%"
                              cy="50%"
                              outerRadius={65}
                              fill="#8884d8"
                              dataKey="value"
                              label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                              labelLine={false}
                            >
                              {chartsData.brokers.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value) => `${value.toLocaleString('es-ES')} €`} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  {/* Cost basis vs Market value bar chart */}
                  <div className="bg-white p-6 border border-gray-200 shadow-sm rounded">
                    <h4 className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-4">
                      Comparativa Coste de Compra vs Valor de Mercado Actual (€)
                    </h4>
                    <div className="w-full h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <ReBarChart
                          data={chartsData.bars}
                          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip formatter={(value) => `${value.toLocaleString('es-ES')} €`} />
                          <Legend />
                          <Bar dataKey="coste" name="Coste de Adquisición" fill="#94a3b8" />
                          <Bar dataKey="valor" name="Valor de Mercado Actual" fill="#3b82f6" />
                        </ReBarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          <div className="flex justify-between items-center bg-[#f0f0f0] p-1 border-t border-[#808080] text-[10px] shrink-0 select-none">
            <div>
              {portfolioTab === 'posiciones' 
                ? `${groupedHoldings.length} posiciones encontradas` 
                : ''
              }
            </div>
            <ZoomControl />
          </div>
        </div>
      </div>

      {/* Transaction Entry Form Modal */}
      <RvTransactionModal
        isOpen={showTxForm}
        onClose={() => {
          setShowTxForm(false);
        }}
        userId={user.uid}
        assets={assets}
        brokers={brokers}
        transactions={transactions}
        editTx={isEditingTx ? txFormData : null}
        defaultAssetId={selectedHolding && selectedHolding.symbol !== 'Varios' ? selectedHolding.symbol : ''}
        defaultBrokerId={selectedHolding && selectedHolding.brokerId !== 'Varios' ? selectedHolding.brokerId : ''}
      />
      {renderPortfolioFilterMenu()}
    </div>
  );
}
