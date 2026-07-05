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
  const [barPeriod, setBarPeriod] = useState(() => localStorage.getItem('rv_metrics_period') || 'MONTH'); // 'DAY', 'MONTH', 'YEAR'

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
  useEffect(() => { localStorage.setItem('rv_metrics_period', barPeriod); }, [barPeriod]);
  useEffect(() => { localStorage.setItem('rv_metrics_kpi_type', kpiBenefitType); }, [kpiBenefitType]);

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
    if (!selectedBrokers.includes('ALL')) txs = txs.filter(t => {
       const b = rvBrokers[t.brokerId];
       const name = b ? b.name : t.brokerId;
       return selectedBrokers.includes(name);
    });
    if (!selectedAccounts.includes('ALL')) txs = txs.filter(t => {
       const b = rvBrokers[t.brokerId];
       const acc = b ? b.accountNumber : null;
       return selectedAccounts.includes(acc);
    });
    
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
    let realizedGainsByAsset = {};
    
    const dailyMap = {};
    const periodMap = {}; 
    let lastKnownPrices = {}; 

    let currentDate = new Date(firstDate);
    while (currentDate <= today) {
      const dateStr = currentDate.toISOString().split('T')[0];
      
      if (txByDate[dateStr]) {
        txByDate[dateStr].forEach(tx => {
          const tKey = `${tx.assetId}_${tx.brokerId}`;
          const tAsset = tx.assetId;
          
          if (!holdings[tKey]) holdings[tKey] = { assetId: tAsset, shares: 0, avgCost: 0 };
          
          const qty = Number(tx.quantity || 0);
          const price = Number(tx.price || 0);
          const rate = Number(tx.exchangeRate || 1);
          const fee = Number(tx.fee || 0);
          const amtInEur = (qty * price) / rate;
          const feeInEur = fee / rate;

          if (tx.type === 'Compra') {
            const oldTotalCost = holdings[tKey].shares * holdings[tKey].avgCost;
            holdings[tKey].shares += qty;
            if (holdings[tKey].shares > 0) {
              holdings[tKey].avgCost = (oldTotalCost + amtInEur + feeInEur) / holdings[tKey].shares;
            }
          } else if (tx.type === 'Venta') {
            const costOfSold = holdings[tKey].avgCost * qty;
            const gain = (amtInEur - costOfSold - feeInEur);
            cumulativeRealizedGains += gain;
            realizedGainsByAsset[tAsset] = (realizedGainsByAsset[tAsset] || 0) + gain;
            
            holdings[tKey].shares = Math.max(0, holdings[tKey].shares - qty);
            if (holdings[tKey].shares === 0) holdings[tKey].avgCost = 0;
          } else if (tx.type === 'Dividendo') {
            const gain = (amtInEur - feeInEur);
            cumulativeRealizedGains += gain;
            realizedGainsByAsset[tAsset] = (realizedGainsByAsset[tAsset] || 0) + gain;
          }
        });
      }

      let capitalInvertido = 0;
      let valorMercado = 0;

      // Calculate exchange rates for this day
      const ratesForDay = { EUR: 1.0, USD: 1.08, GBP: 0.85, CHF: 0.95, JPY: 130.0, ...(config?.exchangeRates || {}) };
      const isToday = dateStr === today.toISOString().split('T')[0];
      
      Object.values(assets).forEach(a => {
         if (a.type && a.type.toLowerCase() === 'divisa') {
            const h = history[a.id];
            let price = isToday ? (parseFloat(a.currentPrice) || h?.[dateStr] || 0) : (h?.[dateStr] !== undefined ? h[dateStr] : parseFloat(a.currentPrice) || 0);
            if (price > 0) {
              const id = String(a.id).toUpperCase();
              const name = String(a.name).toUpperCase();
              if (id === 'USD' || id === 'GBP' || id === 'CHF' || id === 'JPY') ratesForDay[id] = price;
              else if (id.includes('EURUSD') || name.includes('EUR/USD') || name.includes('EURUSD')) ratesForDay['USD'] = price;
              else if (id.includes('EURGBP') || name.includes('EUR/GBP') || name.includes('EURGBP')) ratesForDay['GBP'] = price;
              else if (id.includes('EURCHF') || name.includes('EUR/CHF') || name.includes('EURCHF')) ratesForDay['CHF'] = price;
              else if (id.includes('EURJPY') || name.includes('EUR/JPY') || name.includes('EURJPY')) ratesForDay['JPY'] = price;
              else if (id.startsWith('EUR') && id.length >= 6) ratesForDay[id.substring(3, 6)] = price;
            }
         }
      });

      let dayObj = {
        date: dateStr,
        capitalInvertido: 0,
        valorMercado: 0,
        beneficioLatente: 0,
        plusvaliaPct: 0,
        beneficioTotal: 0,
        rentabilidadPct: 0
      };

      Object.keys(holdings).forEach(tKey => {
        const hld = holdings[tKey];
        const tAsset = hld.assetId;
        
        // Only include if there are shares, or if there is realized gain for this asset
        if (hld.shares > 0 || realizedGainsByAsset[tAsset]) {
          
          if (history[tAsset] && history[tAsset][dateStr] !== undefined) {
            lastKnownPrices[tAsset] = history[tAsset][dateStr];
          }
          
          let priceRaw = lastKnownPrices[tAsset];
          if (isToday && assets[tAsset] && assets[tAsset].currentPrice) {
            priceRaw = parseFloat(assets[tAsset].currentPrice) || priceRaw;
          }
          
          let priceEUR = hld.avgCost; // default to cost if no price
          if (priceRaw !== undefined) {
            const curr = assets[tAsset]?.currency || 'EUR';
            const rate = ratesForDay[curr] || 1.0;
            priceEUR = priceRaw / rate;
          }
          
          let assetCapitalInvertido = (hld.shares * hld.avgCost);
          let assetValorMercado = (hld.shares * priceEUR);
          
          capitalInvertido += assetCapitalInvertido;
          valorMercado += assetValorMercado;
          
          let assetBeneficioLatente = assetValorMercado - assetCapitalInvertido;
          
          dayObj[`capitalInvertido_${tAsset}`] = (dayObj[`capitalInvertido_${tAsset}`] || 0) + assetCapitalInvertido;
          dayObj[`valorMercado_${tAsset}`] = (dayObj[`valorMercado_${tAsset}`] || 0) + assetValorMercado;
          dayObj[`beneficioLatente_${tAsset}`] = (dayObj[`beneficioLatente_${tAsset}`] || 0) + assetBeneficioLatente;
        }
      });
      
      // Calculate pct and realized gains at the asset level to avoid broker duplication
      Object.keys(assets).forEach(tAsset => {
         if (dayObj[`capitalInvertido_${tAsset}`] !== undefined || realizedGainsByAsset[tAsset]) {
            const capInv = dayObj[`capitalInvertido_${tAsset}`] || 0;
            const latente = dayObj[`beneficioLatente_${tAsset}`] || 0;
            const benTotal = latente + (realizedGainsByAsset[tAsset] || 0);
            
            dayObj[`beneficioTotal_${tAsset}`] = benTotal;
            dayObj[`plusvaliaPct_${tAsset}`] = capInv > 0 ? (latente / capInv) * 100 : 0;
            dayObj[`rentabilidadPct_${tAsset}`] = capInv > 0 ? (benTotal / capInv) * 100 : 0;
         }
      });

      const beneficioLatente = valorMercado - capitalInvertido;
      const beneficioTotal = beneficioLatente + cumulativeRealizedGains;
      const plusvaliaPct = capitalInvertido > 0 ? (beneficioLatente / capitalInvertido) * 100 : 0;
      const rentabilidadPct = capitalInvertido > 0 ? (beneficioTotal / capitalInvertido) * 100 : 0;

      dayObj.capitalInvertido = capitalInvertido;
      dayObj.valorMercado = valorMercado;
      dayObj.beneficioLatente = beneficioLatente;
      dayObj.plusvaliaPct = plusvaliaPct;
      dayObj.beneficioTotal = beneficioTotal;
      dayObj.rentabilidadPct = rentabilidadPct;

      dailyMap[dateStr] = dayObj;

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

    // Apply Temporalidad (barPeriod) to lineChartData
    if (barPeriod !== 'DAY') {
       const periodMapForLine = {};
       lineChartData.forEach(day => {
          let periodKey = day.date.substring(0, barPeriod === 'YEAR' ? 4 : 7);
          periodMapForLine[periodKey] = { ...day, date: periodKey }; // Store last day of period
       });
       lineChartData = Object.values(periodMapForLine);
    }

    // ----- EXACT CURRENT SUMMARY CALCULATION (Matches Portfolio.jsx) -----
    let exactCurrentCost = 0;
    let exactCurrentValue = 0;
    let exactRealizedGains = 0;
    let exactAssetStats = {};

    const currentRates = { EUR: 1.0, USD: 1.08, GBP: 0.85, CHF: 0.95, JPY: 130.0, ...(config?.exchangeRates || {}) };
    Object.values(assets).forEach(a => {
      if (a.type && a.type.toLowerCase() === 'divisa') {
        const price = parseFloat(a.currentPrice);
        if (price > 0) {
          const id = String(a.id).toUpperCase();
          const name = String(a.name).toUpperCase();
          if (id === 'USD' || id === 'GBP' || id === 'CHF' || id === 'JPY') currentRates[id] = price;
          else if (id.includes('EURUSD') || name.includes('EUR/USD') || name.includes('EURUSD')) currentRates['USD'] = price;
          else if (id.includes('EURGBP') || name.includes('EUR/GBP') || name.includes('EURGBP')) currentRates['GBP'] = price;
          else if (id.includes('EURCHF') || name.includes('EUR/CHF') || name.includes('EURCHF')) currentRates['CHF'] = price;
          else if (id.includes('EURJPY') || name.includes('EUR/JPY') || name.includes('EURJPY')) currentRates['JPY'] = price;
          else if (id.startsWith('EUR') && id.length >= 6) currentRates[id.substring(3, 6)] = price;
        }
      }
    });

    const positions = {};
    let grossProfit = 0;
    let grossLoss = 0;
    let totalCommissions = 0;
    let winningTrades = 0;
    let losingTrades = 0;
    let evenTrades = 0;
    let maxConsecutiveLosses = 0;
    let currentConsecutiveLosses = 0;
    let totalTrades = 0;

    txs.forEach(tx => {
      const key = `${tx.assetId}_${tx.brokerId}`;
      const tAsset = tx.assetId;
      if (!positions[key]) positions[key] = { assetId: tAsset, qty: 0, costEUR: 0, realized: 0 };
      const rate = tx.exchangeRate || 1.0;
      const q = parseFloat(tx.quantity) || 0;
      const p = parseFloat(tx.price) || 0;
      const f = parseFloat(tx.fee) || 0;

      totalCommissions += f / rate;

      if (tx.type === 'Compra') {
        positions[key].costEUR += (q * p + f) / rate;
        positions[key].qty += q;
      } else if (tx.type === 'Venta') {
        const pmc = positions[key].qty > 0 ? positions[key].costEUR / positions[key].qty : 0;
        const costReduction = q * pmc;
        positions[key].costEUR = Math.max(0, positions[key].costEUR - costReduction);
        positions[key].qty = Math.max(0, positions[key].qty - q);
        
        const gain = ((q * p - f) / rate) - costReduction;
        exactRealizedGains += gain;
        positions[key].realized += gain;

        totalTrades++;
        if (gain > 0.01) {
          grossProfit += gain;
          winningTrades++;
          currentConsecutiveLosses = 0;
        } else if (gain < -0.01) {
          grossLoss += Math.abs(gain);
          losingTrades++;
          currentConsecutiveLosses++;
          if (currentConsecutiveLosses > maxConsecutiveLosses) maxConsecutiveLosses = currentConsecutiveLosses;
        } else {
          evenTrades++;
          currentConsecutiveLosses = 0;
        }

      } else if (tx.type === 'Dividendo') {
        const gain = (q * p - f) / rate;
        exactRealizedGains += gain;
        positions[key].realized += gain;
        // Dividend could be considered as gross profit but not a "trade" per se. We will add it to gross profit.
        grossProfit += gain > 0 ? gain : 0;
      }
    });

    Object.keys(positions).forEach(key => {
      const pos = positions[key];
      const asset = assets[pos.assetId];
      const currentPriceRaw = asset ? parseFloat(asset.currentPrice) || 0 : 0;
      const assetRate = currentRates[asset?.currency] || 1.0;
      
      const posVal = (pos.qty * currentPriceRaw) / assetRate;
      
      if (!exactAssetStats[pos.assetId]) {
        exactAssetStats[pos.assetId] = { capitalInvertido: 0, valorMercado: 0, beneficioTotal: 0 };
      }
      
      exactAssetStats[pos.assetId].capitalInvertido += pos.costEUR;
      exactAssetStats[pos.assetId].valorMercado += posVal;
      exactAssetStats[pos.assetId].beneficioTotal += (posVal - pos.costEUR) + pos.realized;
      
      if (pos.qty > 0) {
        exactCurrentCost += pos.costEUR;
        exactCurrentValue += posVal;
      }
    });

    const exactTotalGains = (exactCurrentValue - exactCurrentCost) + exactRealizedGains;
    const exactLatente = exactCurrentValue - exactCurrentCost;
    const exactPlusvaliaPct = exactCurrentCost > 0 ? (exactLatente / exactCurrentCost) * 100 : 0;
    const exactRoiPct = exactCurrentCost > 0 ? (exactTotalGains / exactCurrentCost) * 100 : 0;

    // Apply exact current values to the final point on the chart
    if (lineChartData.length > 0) {
      const lastIdx = lineChartData.length - 1;
      lineChartData[lastIdx].capitalInvertido = exactCurrentCost;
      lineChartData[lastIdx].valorMercado = exactCurrentValue;
      lineChartData[lastIdx].beneficioLatente = exactLatente;
      lineChartData[lastIdx].plusvaliaPct = exactPlusvaliaPct;
      lineChartData[lastIdx].beneficioTotal = exactTotalGains;
      lineChartData[lastIdx].rentabilidadPct = exactRoiPct;
      
      Object.keys(exactAssetStats).forEach(key => {
         lineChartData[lastIdx][`capitalInvertido_${key}`] = exactAssetStats[key].capitalInvertido;
         lineChartData[lastIdx][`valorMercado_${key}`] = exactAssetStats[key].valorMercado;
         lineChartData[lastIdx][`beneficioTotal_${key}`] = exactAssetStats[key].beneficioTotal;
         const latente = exactAssetStats[key].valorMercado - exactAssetStats[key].capitalInvertido;
         lineChartData[lastIdx][`beneficioLatente_${key}`] = latente;
         const cap = exactAssetStats[key].capitalInvertido;
         lineChartData[lastIdx][`plusvaliaPct_${key}`] = cap > 0 ? (latente / cap) * 100 : 0;
         lineChartData[lastIdx][`rentabilidadPct_${key}`] = cap > 0 ? (exactAssetStats[key].beneficioTotal / cap) * 100 : 0;
      });
    }

    let maxDrawdownPct = 0;
    let peakValue = 0;
    let prevVal = null;
    const dailyReturns = [];

    lineChartData.forEach(day => {
       const equity = day.valorMercado + (day.beneficioTotal - day.beneficioLatente); 
       if (equity > peakValue) peakValue = equity;
       if (peakValue > 0) {
          const ddPct = (peakValue - equity) / peakValue;
          if (ddPct > maxDrawdownPct) maxDrawdownPct = ddPct;
       }
       if (prevVal !== null && prevVal > 0) {
          const ret = (equity - prevVal) / prevVal;
          dailyReturns.push(ret);
       }
       prevVal = equity;
    });

    let avgReturn = 0;
    let stdDev = 0;
    let sharpeRatio = 0;
    if (dailyReturns.length > 0) {
       avgReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
       const variance = dailyReturns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / dailyReturns.length;
       stdDev = Math.sqrt(variance);
       sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;
    }

    const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : (grossProfit > 0 ? '99.00' : '0.00');
    const percentProfitable = totalTrades > 0 ? ((winningTrades / totalTrades) * 100).toFixed(2) : '0.00';
    const avgTrade = totalTrades > 0 ? ((grossProfit - grossLoss) / totalTrades).toFixed(2) : '0.00';
    const avgWin = winningTrades > 0 ? (grossProfit / winningTrades).toFixed(2) : '0.00';
    const avgLoss = losingTrades > 0 ? (grossLoss / losingTrades).toFixed(2) : '0.00';
    const ratioWinLoss = avgLoss > 0 ? (avgWin / avgLoss).toFixed(2) : (avgWin > 0 ? '99.00' : '0.00');

    return { 
      lineData: lineChartData, 
      barData: barChartData, 
      summary: { 
        currentCapital: exactCurrentCost,
        currentValue: exactCurrentValue,
        totalGains: exactTotalGains,
        latenteGains: exactLatente,
        roiPct: exactRoiPct,
        plusvaliaPct: exactPlusvaliaPct,
        metrics: {
          totalNetProfit: exactTotalGains,
          grossProfit,
          grossLoss,
          totalCommissions,
          profitFactor,
          maxDrawdownPct: (maxDrawdownPct * 100).toFixed(2),
          sharpeRatio: sharpeRatio.toFixed(2),
          totalTrades,
          percentProfitable,
          winningTrades,
          losingTrades,
          evenTrades,
          avgTrade,
          avgWin,
          avgLoss,
          ratioWinLoss,
          maxConsecutiveLosses
        }
      } 
    };
  }, [transactions, history, assets, config, selectedTickers, selectedBrokers, selectedAccounts, startDate, endDate, barPeriod]);

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
        <div className="w-72 bg-[#f4f5f8] border-r border-slate-200 flex-shrink-0 flex flex-col h-full overflow-y-auto">
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
              <h3 className="text-[11px] font-bold text-slate-700 mb-2">Activos:</h3>
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
        </div>
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
          
          {activeView === 'metricas' && (
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm max-w-4xl mx-auto w-full">
              <h2 className="text-xl font-bold text-slate-800 mb-6">
                Métricas de la Estrategia {kpiBenefitType === 'LATENTE' ? '(Solo Latente)' : '(Realizado + Latente)'}
              </h2>
              
              <div className="flex flex-col gap-8">
                
                <table className="w-full text-sm text-left">
                  <tbody>
                    <tr className="border-b border-slate-200">
                      <td className="py-2 text-slate-600">Beneficio {kpiBenefitType === 'LATENTE' ? 'latente' : 'neto total'} (Total profit)</td>
                      <td className={`py-2 font-medium ${(kpiBenefitType === 'LATENTE' ? summary.latenteGains : summary.metrics?.totalNetProfit) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {(kpiBenefitType === 'LATENTE' ? summary.latenteGains : summary.metrics?.totalNetProfit)?.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                      </td>
                    </tr>
                    
                    {kpiBenefitType !== 'LATENTE' && (
                      <>
                        <tr className="border-b border-slate-200">
                          <td className="py-2 text-slate-600">Beneficio bruto (Gross profit)</td>
                          <td className="py-2 font-medium text-green-600">{summary.metrics?.grossProfit?.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</td>
                        </tr>
                        <tr className="border-b border-slate-200">
                          <td className="py-2 text-slate-600">Pérdida bruta (Gross loss)</td>
                          <td className="py-2 font-medium text-red-600">{summary.metrics?.grossLoss?.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</td>
                        </tr>
                        <tr className="border-b border-slate-200">
                          <td className="py-2 text-slate-600">Comisiones pagadas (Commission)</td>
                          <td className="py-2 font-medium text-slate-800">{summary.metrics?.totalCommissions?.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</td>
                        </tr>
                        <tr className="border-b border-slate-200">
                          <td className="py-2 text-slate-600">Factor de beneficio (Profit factor)</td>
                          <td className="py-2 font-medium text-slate-800">{summary.metrics?.profitFactor}</td>
                        </tr>
                        <tr className="border-b border-slate-200">
                          <td className="py-2 text-slate-600">Drawdown Máximo (Max. drawdown)</td>
                          <td className="py-2 font-medium text-red-600">{summary.metrics?.maxDrawdownPct} %</td>
                        </tr>
                        <tr className="border-b border-slate-200">
                          <td className="py-2 text-slate-600">Ratio de Sharpe (Sharpe ratio)</td>
                          <td className="py-2 font-medium text-slate-800">{summary.metrics?.sharpeRatio}</td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>

                {kpiBenefitType === 'LATENTE' ? (
                  <div className="bg-amber-50 p-4 rounded-md text-amber-800 text-sm border border-amber-200">
                    ⚠️ <strong>Modo Solo Latente:</strong> Las estadísticas de trading (aciertos, rachas, medias, drawdown) se calculan únicamente sobre el histórico de operaciones ya cerradas (Realizado) o curvas de capital consolidadas. Cambia el filtro lateral a "Realizado+Latente" para visualizar el desglose completo.
                  </div>
                ) : (
                  <>
                    <table className="w-full text-sm text-left">
                      <tbody>
                        <tr className="border-b border-slate-200">
                          <td className="py-2 text-slate-600">Total de ventas (Total # of trades)</td>
                          <td className="py-2 font-medium text-slate-800">{summary.metrics?.totalTrades}</td>
                        </tr>
                    <tr className="border-b border-slate-200">
                      <td className="py-2 text-slate-600">Porcentaje de acierto (Percent profitable)</td>
                      <td className="py-2 font-medium text-slate-800">{summary.metrics?.percentProfitable} %</td>
                    </tr>
                    <tr className="border-b border-slate-200">
                      <td className="py-2 text-slate-600">Ventas ganadoras (# of winning trades)</td>
                      <td className="py-2 font-medium text-green-600">{summary.metrics?.winningTrades}</td>
                    </tr>
                    <tr className="border-b border-slate-200">
                      <td className="py-2 text-slate-600">Ventas perdedoras (# of losing trades)</td>
                      <td className="py-2 font-medium text-red-600">{summary.metrics?.losingTrades}</td>
                    </tr>
                    <tr className="border-b border-slate-200">
                      <td className="py-2 text-slate-600">Ventas a cero (# of even trades)</td>
                      <td className="py-2 font-medium text-slate-800">{summary.metrics?.evenTrades}</td>
                    </tr>
                    <tr className="border-b border-slate-200">
                      <td className="py-2 text-slate-600">Racha de pérdidas (Max. consecutive losses)</td>
                      <td className="py-2 font-medium text-red-600">{summary.metrics?.maxConsecutiveLosses}</td>
                    </tr>
                  </tbody>
                </table>

                <table className="w-full text-sm text-left">
                  <tbody>
                    <tr className="border-b border-slate-200">
                      <td className="py-2 text-slate-600">Media por venta (Avg. trade)</td>
                      <td className="py-2 font-medium text-slate-800">€ {summary.metrics?.avgTrade}</td>
                    </tr>
                    <tr className="border-b border-slate-200">
                      <td className="py-2 text-slate-600">Media de ventas ganadoras (Avg. winning trade)</td>
                      <td className="py-2 font-medium text-green-600">€ {summary.metrics?.avgWin}</td>
                    </tr>
                    <tr className="border-b border-slate-200">
                      <td className="py-2 text-slate-600">Media de ventas perdedoras (Avg. losing trade)</td>
                      <td className="py-2 font-medium text-red-600">€ {summary.metrics?.avgLoss}</td>
                    </tr>
                    <tr className="border-b border-slate-200">
                      <td className="py-2 text-slate-600">Ratio Ganancia/Pérdida (Ratio avg. win / avg. loss)</td>
                      <td className="py-2 font-medium text-slate-800">{summary.metrics?.ratioWinLoss}</td>
                    </tr>
                  </tbody>
                </table>
                </>
                )}

              </div>
            </div>
          )}

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
                  
                  {selectedTickers.includes('ALL') ? (
                    <>
                      {primaryMetric === 'VALOR' && (
                        <>
                          <Line type="monotone" name="Capital Invertido" dataKey="capitalInvertido" stroke="#94a3b8" strokeWidth={2} dot={false} hide={hiddenLines['capitalInvertido']} />
                          <Line type="monotone" name="Valor de Mercado" dataKey="valorMercado" stroke="#3b82f6" strokeWidth={2} dot={false} hide={hiddenLines['valorMercado']} />
                        </>
                      )}

                      {primaryMetric === 'PLUSVALIA' && unit === 'EUR' && (
                        <Line type="monotone" name="Plusvalía Latente (€)" dataKey="beneficioLatente" stroke="#10b981" strokeWidth={2} dot={false} hide={hiddenLines['beneficioLatente']} />
                      )}

                      {primaryMetric === 'PLUSVALIA' && unit === 'PERCENT' && (
                        <Line type="monotone" name="Plusvalía Latente (%)" dataKey="plusvaliaPct" stroke="#10b981" strokeWidth={2} dot={false} hide={hiddenLines['plusvaliaPct']} />
                      )}
                    </>
                  ) : (
                    <>
                      {selectedTickers.map((t, idx) => {
                         const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#14b8a6', '#f97316'];
                         const color = colors[idx % colors.length];
                         if (primaryMetric === 'VALOR') {
                            return (
                               <React.Fragment key={t}>
                                 <Line type="monotone" name={`${t} (Invertido)`} dataKey={`capitalInvertido_${t}`} stroke={color} strokeWidth={2} strokeDasharray="3 3" opacity={0.6} dot={false} hide={hiddenLines[`capitalInvertido_${t}`]} />
                                 <Line type="monotone" name={`${t} (Valor)`} dataKey={`valorMercado_${t}`} stroke={color} strokeWidth={2} dot={false} hide={hiddenLines[`valorMercado_${t}`]} />
                               </React.Fragment>
                            );
                         } else if (unit === 'EUR') {
                            return <Line key={t} type="monotone" name={`${t} (Plusvalía €)`} dataKey={`beneficioLatente_${t}`} stroke={color} strokeWidth={2} dot={false} hide={hiddenLines[`beneficioLatente_${t}`]} />;
                         } else {
                            return <Line key={t} type="monotone" name={`${t} (Plusvalía %)`} dataKey={`plusvaliaPct_${t}`} stroke={color} strokeWidth={2} dot={false} hide={hiddenLines[`plusvaliaPct_${t}`]} />;
                         }
                      })}
                    </>
                  )}
                </LineChart>
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
          </>
          )}

        </div>
      </div>
    </div>
  );
}
