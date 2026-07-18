import React, { useState, useEffect, useMemo } from 'react';
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
import ResizableSidebar from '../components/ResizableSidebar';
import { useOutletContext } from 'react-router-dom';

export default function Portfolio() {
  const { tableZoom } = useOutletContext() || { tableZoom: 1 };
  const { user, queryUserIds } = useAuth();
  
  // State variables
  const [transactions, setTransactions] = useState([]);
  const [assets, setAssets] = useState([]);
  const [brokers, setBrokers] = useState([]);
  const [config, setConfig] = useState({ exchangeRates: { USD: 1.08, GBP: 0.85, CHF: 0.95 } });
  
  const [selectedTx, setSelectedTx] = useState(null);
  const [selectedHolding, setSelectedHolding] = useState(null);
  const [showTxForm, setShowTxForm] = useState(false);
  const [isEditingTx, setIsEditingTx] = useState(false);
  const [portfolioTab, setPortfolioTab] = useState('posiciones'); // 'posiciones' | 'graficos'
  const [searchQuery, setSearchQuery] = useState('');
  const [brokerFilter, setBrokerFilter] = useState('todos');
  const [showSidebar, setShowSidebar] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [groupBy, setGroupBy] = useState('none');

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
  const { visibleColumns: visColsPortfolio, toggleColumn: toggleColPortfolio , columnWidths, updateColumnWidth} = useTableColumns('rv-portfolio', DEFAULT_COLUMNS_PORTFOLIO);
  const { applyTableFilters, TableHeaderWithFilter, renderFilterMenu } = useTableFilters({ columnWidths, updateColumnWidth });

  const DEFAULT_COLUMNS_TX = ['id', 'date', 'assetId', 'brokerName', 'type', 'quantity', 'price', 'fee', 'currency', 'exchangeRate', 'totalAmount'];
  const { visibleColumns: visColsTx, toggleColumn: toggleColTx } = useTableColumns('rv-transactions-grid', DEFAULT_COLUMNS_TX);

  // Compute Portfolio holdings dynamically - declared early to avoid TDZ
  const { holdings, summary } = useMemo(() => {
    // Start with config or default fallback rates
    const rates = {
      EUR: 1.0,
      USD: 1.08,
      GBP: 0.85,
      CHF: 0.95,
      JPY: 130.0,
      ...(config.exchangeRates || {})
    };

    // Override dynamically from Divisa assets registered in rv_assets
    assets.forEach(a => {
      if (a.type && a.type.toLowerCase() === 'divisa') {
        const price = parseFloat(a.currentPrice);
        if (price > 0) {
          const id = String(a.id).toUpperCase();
          const name = String(a.name).toUpperCase();
          
          if (id === 'USD' || id === 'GBP' || id === 'CHF' || id === 'JPY') {
            rates[id] = price;
          } else if (id.includes('EURUSD') || name.includes('EUR/USD') || name.includes('EURUSD')) {
            rates['USD'] = price;
          } else if (id.includes('EURGBP') || name.includes('EUR/GBP') || name.includes('EURGBP')) {
            rates['GBP'] = price;
          } else if (id.includes('EURCHF') || name.includes('EUR/CHF') || name.includes('EURCHF')) {
            rates['CHF'] = price;
          } else if (id.includes('EURJPY') || name.includes('EUR/JPY') || name.includes('EURJPY')) {
            rates['JPY'] = price;
          } else if (id.startsWith('EUR') && id.length >= 6) {
            const currencyCode = id.substring(3, 6);
            rates[currencyCode] = price;
          }
        }
      }
    });

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

  // Transactions list sorting & filtering - declared early to avoid TDZ
  const sortedTransactions = useMemo(() => {
    return [...transactions]
      .filter(tx => {
        // Broker filter
        if (brokerFilter !== 'todos' && tx.brokerId !== brokerFilter) return false;
        
        // Search query
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          return (
            tx.assetId.toLowerCase().includes(q) ||
            (tx.assetName || '').toLowerCase().includes(q) ||
            tx.brokerName.toLowerCase().includes(q) ||
            tx.type.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, brokerFilter, searchQuery]);

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

  // Ribbon event handling
  useEffect(() => {
    const onNew = () => handleNewTx();
    const onEdit = () => {
      alert('Para modificar transacciones, por favor vaya a la pestaña de Transacciones en el menú superior.');
    };
    const onDelete = () => {
      alert('Para eliminar transacciones, por favor vaya a la pestaña de Transacciones en el menú superior.');
    };
    const onExport = (e) => {
      const format = e.detail?.format || 'csv';
      if (portfolioTab === 'posiciones') {
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
      } else {
        if (format === 'pdf') {
          const cols = [
            { header: 'ID', dataKey: 'id' },
            { header: 'Fecha', dataKey: 'date' },
            { header: 'Activo', dataKey: 'assetId' },
            { header: 'Broker', dataKey: 'brokerName' },
            { header: 'Tipo', dataKey: 'type' },
            { header: 'Cant.', dataKey: 'quantity' },
            { header: 'Precio', dataKey: 'price' },
            { header: 'Comis.', dataKey: 'fee' },
            { header: 'Cambio', dataKey: 'exchangeRate' },
            { header: 'Divisa', dataKey: 'currency' }
          ];
          exportToPDF(sortedTransactions, cols, 'Historial Transacciones Renta Variable', 'transacciones_rv.pdf');
        } else {
          handleExportFormat(sortedTransactions, 'Transacciones Renta Variable', format);
        }
      }
    };
    const onToggleColumn = (e) => {
      if (portfolioTab === 'posiciones') toggleColPortfolio(e.detail.columnId);
      else toggleColTx(e.detail.columnId);
    };

    window.addEventListener('rv-transaction:new', onNew);
    window.addEventListener('rv-transaction:edit', onEdit);
    window.addEventListener('rv-transaction:delete', onDelete);
    window.addEventListener('rv-transaction:export', onExport);
    window.addEventListener('toggle-column', onToggleColumn);

    return () => {
      window.removeEventListener('rv-transaction:new', onNew);
      window.removeEventListener('rv-transaction:edit', onEdit);
      window.removeEventListener('rv-transaction:delete', onDelete);
      window.removeEventListener('rv-transaction:export', onExport);
      window.removeEventListener('toggle-column', onToggleColumn);
    };
  }, [transactions, selectedTx, portfolioTab, config, assets, brokers, holdings, sortedTransactions]);

  // Transaction form triggers
  const handleNewTx = () => {
    setIsEditingTx(false);
    const maxId = transactions.reduce((max, t) => {
      const num = parseInt(t.id.replace('TX', '')) || 0;
      return num > max ? num : max;
    }, 0);
    setTxFormData({
      id: `TX${String(maxId + 1).padStart(3, '0')}`,
      assetId: assets[0]?.id || '',
      brokerId: brokers[0]?.id || '',
      type: 'Compra',
      date: new Date().toISOString().split('T')[0],
      quantity: '',
      price: '',
      fee: '0',
      exchangeRate: '1.0',
      currency: assets[0]?.currency || 'EUR',
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

  const handleSaveTx = async (e) => {
    e.preventDefault();
    if (!txFormData.assetId || !txFormData.brokerId) {
      alert('Debe seleccionar un activo y un broker.');
      return;
    }

    try {
      const selectedAsset = assets.find(a => a.id === txFormData.assetId);
      const selectedBroker = brokers.find(b => b.id === txFormData.brokerId);

      const qty = parseFloat(txFormData.quantity) || 0;
      const prc = parseFloat(txFormData.price) || 0;
      const feeVal = parseFloat(txFormData.fee) || 0;
      const rate = parseFloat(txFormData.exchangeRate) || 1.0;

      const totalAmt = txFormData.type === 'Compra' 
        ? qty * prc + feeVal 
        : txFormData.type === 'Venta' 
        ? qty * prc - feeVal 
        : qty * prc; // Dividendo total bruto/neto

      const cleanData = {
        ...txFormData,
        assetName: selectedAsset?.name || txFormData.assetId,
        brokerName: selectedBroker?.name || txFormData.brokerId,
        quantity: qty,
        price: prc,
        fee: feeVal,
        exchangeRate: rate,
        totalAmount: totalAmt,
        userId: user.uid,
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'rv_transactions', txFormData.id), cleanData);
      setShowTxForm(false);
      setSelectedTx(null);
    } catch (error) {
      console.error('Error saving transaction:', error);
      alert('Error al guardar la transacción: ' + error.message);
    }
  };

  // Memoized filtered holdings
  const filteredHoldings = useMemo(() => {
    return holdings.filter(h => {
      if (brokerFilter !== 'todos' && h.brokerId !== brokerFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return h.symbol.toLowerCase().includes(q) || h.name.toLowerCase().includes(q);
      }
      return true;
    });
  }, [holdings, brokerFilter, searchQuery]);

  // Recharts Chart Data Prep
  const chartsData = useMemo(() => {
    const assetTypeAlloc = {};
    const assetAlloc = {};
    const brokerAlloc = {};
    const assetCostValueMap = {};

    filteredHoldings.forEach(h => {
      assetTypeAlloc[h.type] = (assetTypeAlloc[h.type] || 0) + h.currentValue;
      assetAlloc[h.symbol] = (assetAlloc[h.symbol] || 0) + h.currentValue;
      brokerAlloc[h.brokerName] = (brokerAlloc[h.brokerName] || 0) + h.currentValue;

      if (!assetCostValueMap[h.symbol]) {
        assetCostValueMap[h.symbol] = { name: h.symbol, coste: 0, valor: 0 };
      }
      assetCostValueMap[h.symbol].coste += h.totalCost;
      assetCostValueMap[h.symbol].valor += h.currentValue;
    });

    const assetCostValue = Object.values(assetCostValueMap).map(item => ({
      name: item.name,
      coste: Math.round(item.coste),
      valor: Math.round(item.valor)
    }));

    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

    const formatPie = (obj) => Object.entries(obj).map(([name, value], idx) => ({
      name,
      value,
      color: COLORS[idx % COLORS.length]
    }));

    return {
      types: formatPie(assetTypeAlloc),
      assets: formatPie(assetAlloc),
      brokers: formatPie(brokerAlloc),
      bars: assetCostValue
    };
  }, [filteredHoldings]);

  // Table row renderer helper
  const renderRow = (h) => {
    return (
      <tr
        key={`${h.symbol}_${h.brokerId}`}
        onClick={() => setSelectedHolding(selectedHolding?.symbol === h.symbol && selectedHolding?.brokerId === h.brokerId ? null : h)}
        className={selectedHolding?.symbol === h.symbol && selectedHolding?.brokerId === h.brokerId ? 'selected' : ''}
      >
        
                  {visColsPortfolio.map(col => {
                    switch(col) {
                    case 'symbol': return (<td
 key="symbol" className="font-mono font-bold">{h.symbol}</td>);
                    case 'name': return (<td
 key="name">{h.name}</td>);
                    case 'type': return (<td
 key="type">{h.type}</td>);
                    case 'brokerName': return (<td
 key="brokerName">{h.brokerName}</td>);
                    case 'quantity': return (<td
 key="quantity" className="font-mono text-right">{h.quantity}</td>);
                    case 'pmc': return (<td
 key="pmc" className="font-mono text-right">
            {h.pmc.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €
          </td>);
                    case 'currentPrice': return (<td
 key="currentPrice" className="font-mono text-right">
            {h.currency !== 'EUR' && h.currentPriceRaw !== undefined && h.currentPriceRaw !== null ? (
              <span className="text-[10px] text-gray-500 mr-1.5">
                ({h.currentPriceRaw.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} {h.currency})
              </span>
            ) : null}
            <span>
              {h.currentPrice.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €
            </span>
          </td>);
                    case 'totalCost': return (<td
 key="totalCost" className="font-mono text-right">
            {h.totalCost.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
          </td>);
                    case 'currentValue': return (<td
 key="currentValue" className="font-mono text-right font-bold text-slate-700">
            {h.currentValue.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
          </td>);
                    case 'pnl': return (<td
 key="pnl" className={`font-mono text-right font-bold ${h.pnl >= 0 ? 'text-green-700' : 'text-red-600'}`}>
            {h.pnl >= 0 ? '+' : ''}{h.pnl.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
          </td>);
                    case 'pnlPercent': return (<td
 key="pnlPercent" className={`font-mono text-right font-bold ${h.pnl >= 0 ? 'text-green-700' : 'text-red-600'}`}>
            {h.pnl >= 0 ? '+' : ''}{h.pnlPercent.toFixed(2)}%
          </td>);
                    default: return null;
                    }
                  })}
    
      </tr>
    );
  };

  // Grouped by Broker renderer
  const renderGroupedByBroker = () => {
    const groups = {};
    filteredHoldings.forEach(h => {
      const bId = h.brokerId || 'Desconocido';
      if (!groups[bId]) groups[bId] = [];
      groups[bId].push(h);
    });

    return Object.entries(groups).map(([bId, items]) => {
      const broker = brokers.find(b => b.id === bId);
      const brokerName = broker ? broker.name : bId;
      const accNum = broker ? broker.accountNumber || 'Sin cuenta' : 'Sin cuenta';

      const groupCost = items.reduce((sum, item) => sum + item.totalCost, 0);
      const groupValue = items.reduce((sum, item) => sum + item.currentValue, 0);
      const groupPnL = groupValue - groupCost;
      const groupPnLPercent = groupCost > 0 ? (groupPnL / groupCost) * 100 : 0;

      return (
        <React.Fragment key={bId}>
          <tr className="bg-slate-100 font-bold border-b border-gray-300">
            <td colSpan={visColsPortfolio.length} className="text-blue-800 text-xs py-2 px-3">
              Broker: <span className="underline">{brokerName}</span> (Cuenta: {accNum})
            </td>
          </tr>
          {items.map(h => renderRow(h))}
          <tr className="bg-slate-50 font-bold border-b border-gray-300 text-slate-700">
            
                  {visColsPortfolio.map(col => {
                    switch(col) {
                    case 'symbol': return (<td
 key="symbol"></td>);
                    case 'name': return (<td
 key="name" className="text-right italic">Subtotal {brokerName}:</td>);
                    case 'type': return (<td
 key="type"></td>);
                    case 'brokerName': return (<td
 key="brokerName"></td>);
                    case 'quantity': return (<td
 key="quantity"></td>);
                    case 'pmc': return (<td
 key="pmc"></td>);
                    case 'currentPrice': return (<td
 key="currentPrice"></td>);
                    case 'totalCost': return (<td
 key="totalCost" className="font-mono text-right border-t border-gray-400">
                {groupCost.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
              </td>);
                    case 'currentValue': return (<td
 key="currentValue" className="font-mono text-right border-t border-gray-400">
                {groupValue.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
              </td>);
                    case 'pnl': return (<td
 key="pnl" className={`font-mono text-right border-t border-gray-400 ${groupPnL >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                {groupPnL >= 0 ? '+' : ''}{groupPnL.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
              </td>);
                    case 'pnlPercent': return (<td
 key="pnlPercent" className={`font-mono text-right border-t border-gray-400 ${groupPnL >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                {groupPnL >= 0 ? '+' : ''}{groupPnLPercent.toFixed(2)}%
              </td>);
                    default: return null;
                    }
                  })}
    
          </tr>
        </React.Fragment>
      );
    });
  };

  // Grouped by Acciones (Ticker) renderer
  const renderGroupedByAcciones = () => {
    const groups = {};
    filteredHoldings.forEach(h => {
      const sym = h.symbol || 'Otros';
      if (!groups[sym]) groups[sym] = [];
      groups[sym].push(h);
    });

    return Object.entries(groups).map(([sym, items]) => {
      const assetName = items[0]?.name || sym;

      const groupQty = items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);
      const groupCost = items.reduce((sum, item) => sum + item.totalCost, 0);
      const groupValue = items.reduce((sum, item) => sum + item.currentValue, 0);
      const groupPnL = groupValue - groupCost;
      const groupPnLPercent = groupCost > 0 ? (groupPnL / groupCost) * 100 : 0;

      return (
        <React.Fragment key={sym}>
          <tr className="bg-slate-100 font-bold border-b border-gray-300">
            <td colSpan={visColsPortfolio.length} className="text-blue-800 text-xs py-2 px-3">
              Activo: <span className="underline">{sym}</span> - {assetName}
            </td>
          </tr>
          {items.map(h => renderRow(h))}
          <tr className="bg-slate-50 font-bold border-b border-gray-300 text-slate-700">
            
                  {visColsPortfolio.map(col => {
                    switch(col) {
                    case 'symbol': return (<td
 key="symbol"></td>);
                    case 'name': return (<td
 key="name" className="text-right italic">Subtotal {sym}:</td>);
                    case 'type': return (<td
 key="type"></td>);
                    case 'brokerName': return (<td
 key="brokerName"></td>);
                    case 'quantity': return (<td
 key="quantity" className="font-mono text-right border-t border-gray-400">
                {groupQty}
              </td>);
                    case 'pmc': return (<td
 key="pmc" className="font-mono text-right border-t border-gray-400">
                {groupQty > 0 ? (groupCost / groupQty).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '0,00'} €
              </td>);
                    case 'currentPrice': return (<td
 key="currentPrice"></td>);
                    case 'totalCost': return (<td
 key="totalCost" className="font-mono text-right border-t border-gray-400">
                {groupCost.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
              </td>);
                    case 'currentValue': return (<td
 key="currentValue" className="font-mono text-right border-t border-gray-400">
                {groupValue.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
              </td>);
                    case 'pnl': return (<td
 key="pnl" className={`font-mono text-right border-t border-gray-400 ${groupPnL >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                {groupPnL >= 0 ? '+' : ''}{groupPnL.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
              </td>);
                    case 'pnlPercent': return (<td
 key="pnlPercent" className={`font-mono text-right border-t border-gray-400 ${groupPnL >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                {groupPnL >= 0 ? '+' : ''}{groupPnLPercent.toFixed(2)}%
              </td>);
                    default: return null;
                    }
                  })}
    
          </tr>
        </React.Fragment>
      );
    });
  };

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
          <ResizableSidebar className=" bg-[#f0f4f9] border-r border-gray-200 flex flex-col shrink-0 transition-all">
            <div className="bg-[#e4ebf5] border-b border-gray-200 p-2 text-[12px] font-bold text-slate-700 flex justify-between items-center">
              <span>Filtros</span>
            </div>
            <div className="p-4 text-[11px] space-y-4 flex-1 overflow-auto">
              {/* Group By */}
              <div className="space-y-2">
                <label className="text-slate-700 font-bold">Agrupar por:</label>
                <select
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value)}
                  className="win-input w-full bg-white"
                >
                  <option value="none">Sin agrupación</option>
                  <option value="broker">Broker</option>
                  <option value="acciones">Acciones (Ticker)</option>
                </select>
              </div>

              {/* Broker Filter */}
              <div className="space-y-2 pt-2 border-t border-gray-300">
                <label className="text-slate-700 font-bold">Filtrar por Cuenta de Broker:</label>
                <div className="space-y-1">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="brokerFilter"
                      checked={brokerFilter === 'todos'}
                      onChange={() => setBrokerFilter('todos')}
                      className="text-indigo-600 focus:ring-indigo-500 cursor-pointer text-xs"
                    />
                    <span className={brokerFilter === 'todos' ? 'text-indigo-700 font-bold' : 'text-slate-700'}>
                      Todas las cuentas
                    </span>
                  </label>
                  {brokers.map((broker) => (
                    <label key={broker.id} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="brokerFilter"
                        checked={brokerFilter === broker.id}
                        onChange={() => setBrokerFilter(broker.id)}
                        className="text-indigo-600 focus:ring-indigo-500 cursor-pointer text-xs"
                      />
                      <span className={brokerFilter === broker.id ? 'text-indigo-700 font-bold' : 'text-slate-700'}>
                        {broker.accountNumber ? `${broker.name} (${broker.accountNumber})` : broker.name}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </ResizableSidebar>
        )}

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          {/* Sub-tabs menu */}
          <div className="p-1.5 border-b border-gray-200 flex justify-between items-center bg-[#f8fafc]">
            <div className="flex space-x-1">
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
            
            <div className="flex items-center space-x-3">
              <div className="relative" onClick={e => e.stopPropagation()}>
                <input
                  type="text"
                  placeholder="Buscar en el fichero (Alt+B)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-2 pr-8 py-1 border-b border-gray-400 text-[12px] w-64 outline-none focus:border-blue-500 bg-transparent font-sans"
                />
                <Search className="w-4 h-4 absolute right-1 top-1/2 -translate-y-1/2 text-gray-500" />
              </div>
              <button
                onClick={() => setShowSidebar(!showSidebar)}
                className={`p-1.5 rounded border transition-colors cursor-pointer flex items-center justify-center ${
                  showSidebar 
                    ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100' 
                    : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-100'
                }`}
                title={showSidebar ? 'Ocultar Panel' : 'Mostrar Panel'}
              >
                <PanelLeft className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Holdings View */}
          {portfolioTab === 'posiciones' && (
            <div className="win-table-container">
              <table style={{ zoom: tableZoom }} className="clean-table">
                <thead>
                  <tr>
                    
                  {visColsPortfolio.map(col => {
                    switch(col) {
                    case 'symbol': return (<th
 key="symbol" style={{ width: '80px' }}>Ticker</th>);
                    case 'name': return (<th
 key="name" style={{ width: '180px' }}>Nombre</th>);
                    case 'type': return (<th
 key="type" style={{ width: '100px' }}>Tipo</th>);
                    case 'brokerName': return (<th
 key="brokerName" style={{ width: '150px' }}>Broker</th>);
                    case 'quantity': return (<th
 key="quantity" style={{ width: '90px' }}>Títulos</th>);
                    case 'pmc': return (<th
 key="pmc" style={{ width: '110px' }}>P.Medio Compra</th>);
                    case 'currentPrice': return (<th
 key="currentPrice" style={{ width: '160px' }}>Precio Mercado</th>);
                    case 'totalCost': return (<th
 key="totalCost" style={{ width: '110px' }}>Coste Total</th>);
                    case 'currentValue': return (<th
 key="currentValue" style={{ width: '110px' }}>Valor Actual</th>);
                    case 'pnl': return (<th
 key="pnl" style={{ width: '110px' }}>Rentabilidad</th>);
                    case 'pnlPercent': return (<th
 key="pnlPercent" style={{ width: '90px' }}>% PnL</th>);
                    default: return null;
                    }
                  })}
    
                  </tr>
                </thead>
                <tbody>
                  {filteredHoldings.length === 0 ? (
                    <tr>
                      <td colSpan={visColsPortfolio.length} className="text-center py-8 text-gray-400 font-medium">
                        No hay posiciones abiertas en cartera. Registre una nueva compra o cargue datos de ejemplo.
                      </td>
                    </tr>
                  ) : groupBy === 'broker' ? (
                    renderGroupedByBroker()
                  ) : groupBy === 'acciones' ? (
                    renderGroupedByAcciones()
                  ) : (
                    filteredHoldings.map((h) => renderRow(h))
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

                    {/* Allocation by asset */}
                    <div className="bg-white p-4 border border-gray-200 shadow-sm rounded flex flex-col items-center">
                      <h4 className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-4">
                        Distribución por Acción
                      </h4>
                      <div className="w-full h-48">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={chartsData.assets}
                              cx="50%"
                              cy="50%"
                              outerRadius={65}
                              fill="#8884d8"
                              dataKey="value"
                              label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                              labelLine={false}
                            >
                              {chartsData.assets.map((entry, index) => (
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
        </div>
      </div>

      {/* Transaction Entry Form Modal */}
      {showTxForm && (
        <div className="fixed inset-0 bg-black/35 backdrop-blur-xs flex items-center justify-center z-[200]">
          <Window
            title={isEditingTx ? `Modificar Transacción: ${txFormData.id}` : 'Nueva Transacción de Renta Variable'}
            onClose={() => setShowTxForm(false)}
            width="550px"
            height="auto"
            initialPos={{ x: (window.innerWidth - 550) / 2, y: 100 }}
          >
            <form onSubmit={handleSaveTx} className="p-4 space-y-3">
              <div className="win-form-row">
                <label className="win-form-label">ID Transacción:</label>
                <input
                  type="text"
                  value={txFormData.id}
                  onChange={(e) => setTxFormData({ ...txFormData, id: e.target.value })}
                  placeholder="ej. TX001"
                  disabled={isEditingTx}
                  required
                  className="win-input flex-1 uppercase font-mono"
                />
              </div>

              <div className="win-form-row">
                <label className="win-form-label">Activo (Ticker):</label>
                <select
                  value={txFormData.assetId}
                  onChange={(e) => {
                    const selected = assets.find(a => a.id === e.target.value);
                    setTxFormData({ 
                      ...txFormData, 
                      assetId: e.target.value,
                      currency: selected?.currency || 'EUR'
                    });
                  }}
                  className="win-input flex-1"
                >
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.id} - {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="win-form-row">
                <label className="win-form-label">Broker:</label>
                <select
                  value={txFormData.brokerId}
                  onChange={(e) => setTxFormData({ ...txFormData, brokerId: e.target.value })}
                  className="win-input flex-1"
                >
                  {brokers.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.id})
                    </option>
                  ))}
                </select>
              </div>

              <div className="win-form-row">
                <label className="win-form-label">Tipo Operación:</label>
                <select
                  value={txFormData.type}
                  onChange={(e) => setTxFormData({ ...txFormData, type: e.target.value })}
                  className="win-input flex-1"
                >
                  <option value="Compra">Compra</option>
                  <option value="Venta">Venta</option>
                  <option value="Dividendo">Dividendo</option>
                </select>
              </div>

              <div className="win-form-row">
                <label className="win-form-label">Fecha:</label>
                <input
                  type="date"
                  value={txFormData.date}
                  onChange={(e) => setTxFormData({ ...txFormData, date: e.target.value })}
                  required
                  className="win-input flex-1"
                />
              </div>

              <div className="win-form-row">
                <label className="win-form-label">Cantidad (Títulos):</label>
                <input
                  type="number"
                  step="0.000001"
                  value={txFormData.quantity}
                  onChange={(e) => setTxFormData({ ...txFormData, quantity: e.target.value })}
                  placeholder="ej. 10"
                  required
                  className="win-input flex-1"
                />
              </div>

              <div className="win-form-row">
                <label className="win-form-label">{txFormData.type === 'Dividendo' ? 'Importe bruto por Título:' : 'Precio Unitario:'}</label>
                <input
                  type="number"
                  step="0.0001"
                  value={txFormData.price}
                  onChange={(e) => setTxFormData({ ...txFormData, price: e.target.value })}
                  placeholder="ej. 150.25"
                  required
                  className="win-input flex-1"
                />
              </div>

              <div className="win-form-row">
                <label className="win-form-label">Comisiones:</label>
                <input
                  type="number"
                  step="0.01"
                  value={txFormData.fee}
                  onChange={(e) => setTxFormData({ ...txFormData, fee: e.target.value })}
                  placeholder="ej. 2.00"
                  required
                  className="win-input flex-1"
                />
              </div>

              <div className="win-form-row">
                <label className="win-form-label">Tipo Cambio (USD/EUR...):</label>
                <input
                  type="number"
                  step="0.0001"
                  value={txFormData.exchangeRate}
                  onChange={(e) => setTxFormData({ ...txFormData, exchangeRate: e.target.value })}
                  placeholder="ej. 1.08 (deje 1.0 si es en EUR)"
                  required
                  className="win-input flex-1"
                />
              </div>

              <div className="win-form-row">
                <label className="win-form-label">Divisa:</label>
                <input
                  type="text"
                  value={txFormData.currency}
                  readOnly
                  className="win-input flex-1 bg-slate-100 font-bold"
                />
              </div>

              <div className="win-form-row items-start">
                <label className="win-form-label pt-1.5">Notas:</label>
                <textarea
                  value={txFormData.notes}
                  onChange={(e) => setTxFormData({ ...txFormData, notes: e.target.value })}
                  placeholder="Notas descriptivas..."
                  rows={2}
                  className="win-input flex-1 font-sans resize-none"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowTxForm(false)}
                  className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold border border-slate-300 rounded cursor-pointer transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold rounded cursor-pointer transition-colors flex items-center space-x-1"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Guardar</span>
                </button>
              </div>
            </form>
          </Window>
        </div>
      )}
    
      {/* Bottom Bar for Zoom */}
      <div className="flex justify-end bg-[#f0f0f0] p-1 border-t border-gray-300 shrink-0 mt-auto w-full z-50">
        <ZoomControl />
      </div>
</div>
  );
}
