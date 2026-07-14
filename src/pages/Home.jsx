import React, { useState, useEffect, useMemo } from 'react';
import { 
  Building2, 
  Calculator, 
  BarChart3, 
  Wrench, 
  HelpCircle, 
  TrendingUp, 
  Coins, 
  Percent,
  Wallet,
  Calendar,
  LogOut,
  User,
  ArrowUpRight,
  TrendingDown,
  Sparkles,
  Briefcase
} from 'lucide-react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

export default function Home() {
  const { user, logout, queryUserIds } = useAuth();
  
  // State variables for collections
  const [accounts, setAccounts] = useState([]);
  const [journalEntries, setJournalEntries] = useState([]);
  const [properties, setProperties] = useState([]);
  const [rvTransactions, setRvTransactions] = useState([]);
  const [rvAssets, setRvAssets] = useState([]);
  const [brokers, setBrokers] = useState([]);
  const [cfProjects, setCfProjects] = useState([]);
  const [cfTransactions, setCfTransactions] = useState([]);
  const [budgets, setBudgets] = useState([]);

  // Fetch all data reactively
  useEffect(() => {
    if (!user) return;
    const targetUserIds = queryUserIds?.length > 0 ? queryUserIds : [user.uid];

    const unsubAcc = onSnapshot(query(collection(db, 'accounts'), where('userId', 'in', targetUserIds)), snap => {
      setAccounts(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    });
    const unsubJournal = onSnapshot(query(collection(db, 'journal_entries'), where('userId', 'in', targetUserIds)), snap => {
      setJournalEntries(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    });
    const unsubProp = onSnapshot(query(collection(db, 'properties'), where('userId', 'in', targetUserIds)), snap => {
      setProperties(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    });
    const unsubRvTx = onSnapshot(query(collection(db, 'rv_transactions'), where('userId', 'in', targetUserIds)), snap => {
      setRvTransactions(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    });
    const unsubRvAsset = onSnapshot(query(collection(db, 'rv_assets'), where('userId', 'in', targetUserIds)), snap => {
      setRvAssets(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    });
    const unsubBroker = onSnapshot(query(collection(db, 'brokers'), where('userId', 'in', targetUserIds)), snap => {
      setBrokers(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    });
    const unsubCfProj = onSnapshot(query(collection(db, 'cf_projects'), where('userId', 'in', targetUserIds)), snap => {
      setCfProjects(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    });
    const unsubCfTx = onSnapshot(query(collection(db, 'cf_transactions'), where('userId', 'in', targetUserIds)), snap => {
      setCfTransactions(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    });
    const unsubBudgets = onSnapshot(query(collection(db, 'budgets'), where('userId', 'in', targetUserIds)), snap => {
      setBudgets(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    });

    return () => {
      unsubAcc();
      unsubJournal();
      unsubProp();
      unsubRvTx();
      unsubRvAsset();
      unsubBroker();
      unsubCfProj();
      unsubCfTx();
      unsubBudgets();
    };
  }, [user, queryUserIds]);

  // Compute calculated metrics
  const kpis = useMemo(() => {
    // 1. Bank balances (Tesorería grupo 57)
    let bankBalance = 0;
    let bankBalance572 = 0;
    const bankAccounts = accounts.filter(a => a.code && a.code.startsWith('57') && a.code.length > 4);
    const bankAccIds = new Set(bankAccounts.map(a => a.id));
    const bankAccCodes = new Set(bankAccounts.map(a => a.code));

    // Patrimonio Neto variables
    let totalActivo = 0;
    let totalPasivo = 0;

    accounts.forEach(a => {
      const amt = parseFloat(a.balance_actual) || 0;
      const code = String(a.code || '');
      
      // For bank balance
      if (a.code && a.code.startsWith('57') && a.code.length > 4) {
        bankBalance += amt;
      }
      if (a.code && a.code.startsWith('572')) {
        bankBalance572 += amt;
      }

      // For Patrimonio Neto
      const isActivo = a.type === 'Activo';
      const isPasivo = a.type === 'Pasivo' && !(code.startsWith('10') || code.startsWith('11') || code.startsWith('12') || code.startsWith('13'));
      if (isActivo) totalActivo += amt;
      else if (isPasivo) totalPasivo += amt;
    });

    journalEntries.forEach(entry => {
      entry.lines?.forEach(l => {
        const accId = String(l.accountId || '');
        const accCode = String(l.accountCode || '');
        const debit = parseFloat(l.debit) || 0;
        const credit = parseFloat(l.credit) || 0;

        // For bank balance
        if (bankAccIds.has(accId) || bankAccCodes.has(accCode) || accCode.startsWith('572') || accCode.startsWith('570')) {
          bankBalance += (debit - credit);
          if (accCode.startsWith('572')) {
            bankBalance572 += (debit - credit);
          }
        }

        // For Patrimonio Neto
        const acc = accounts.find(a => a.id === accId || a.code === accCode);
        if (acc) {
          const code = String(acc.code || '');
          const isActivo = acc.type === 'Activo';
          const isPasivo = acc.type === 'Pasivo' && !(code.startsWith('10') || code.startsWith('11') || code.startsWith('12') || code.startsWith('13'));
          
          if (isActivo) {
            totalActivo += (debit - credit);
          } else if (isPasivo) {
            totalPasivo += (credit - debit);
          }
        }
      });
    });

    const patrimonioNeto = totalActivo - totalPasivo;

    // 2. Real estate (Inmuebles) values & mortgages
    let realEstateValue = 0;
    let realEstateMortgages = 0;
    properties.forEach(p => {
      const val = parseFloat(p.currentValue || p.financials?.currentValue || p.acquisitionPrice || p.financials?.purchasePrice) || 0;
      const mort = parseFloat(p.mortgagePending) || 0;
      realEstateValue += val;
      realEstateMortgages += mort;
    });

    // 3. Renta Variable holdings & cash
    const chronTx = [...rvTransactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const positions = {};
    let totalDividendsEUR = 0;

    chronTx.forEach(tx => {
      const asset = rvAssets.find(a => a.id === tx.assetId);
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
          currency: asset?.currency || 'EUR',
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

    const rates = { EUR: 1.0, USD: 1.08, GBP: 0.85, CHF: 0.95 };
    rvAssets.forEach(a => {
      if (a.type && a.type.toLowerCase() === 'divisa') {
        const price = parseFloat(a.currentPrice);
        if (price > 0) {
          const id = String(a.id).toUpperCase();
          if (id === 'USD' || id === 'GBP' || id === 'CHF') rates[id] = price;
        }
      }
    });

    let rvPortfolioCost = 0;
    let rvPortfolioValue = 0;

    Object.values(positions).forEach(pos => {
      if (pos.quantity <= 0) return;
      const asset = rvAssets.find(a => a.id === pos.symbol);
      const currentPriceRaw = asset ? parseFloat(asset.currentPrice) || 0 : 0;
      const assetRate = rates[pos.currency] || 1.0;
      
      const totalCostEUR = pos.costBasisEUR;
      const currentValueEUR = (pos.quantity * currentPriceRaw) / assetRate;
      
      rvPortfolioCost += totalCostEUR;
      rvPortfolioValue += currentValueEUR;
    });

    const rvBrokerCash = brokers.reduce((sum, b) => {
      const brokerRate = rates[b.currency] || 1.0;
      return sum + (parseFloat(b.cashBalance) || 0) / brokerRate;
    }, 0);

    const rvLatente = rvPortfolioValue - rvPortfolioCost;

    // 4. Crowdfunding investments & earnings
    const activeProjectIds = new Set(cfProjects.map(p => p.id));
    let cfInvested = 0;
    cfTransactions.forEach(tx => {
      const pId = tx.projectId;
      const amt = parseFloat(tx.amount) || 0;
      const isPurchase = tx.type === 'Compra';

      if (pId && activeProjectIds.has(pId)) {
        cfInvested += isPurchase ? amt : -amt;
      }
    });

    let cfRentsNet = 0;
    cfProjects.forEach(p => {
      const incomeCebe = String(p.incomeCebeId || '').trim().replace(/^(CEBE|CECO)/i, '');
      const expenseCeco = String(p.expenseCecoId || '').trim().replace(/^(CEBE|CECO)/i, '');

      let gross = 0;
      let expenses = 0;

      journalEntries.forEach(entry => {
        if (incomeCebe) {
          const entryCebe = String(entry.cebe || '').trim().replace(/^(CEBE|CECO)/i, '');
          if (entryCebe && entryCebe.startsWith(incomeCebe)) {
            gross += parseFloat(entry.total) || 0;
          }
        }
        if (expenseCeco) {
          const entryCeco = String(entry.ceco || '').trim().replace(/^(CEBE|CECO)/i, '');
          if (entryCeco && entryCeco.startsWith(expenseCeco)) {
            expenses += parseFloat(entry.total) || 0;
          }
        }
      });
      cfRentsNet += (gross - expenses);
    });

    const cfValue = cfInvested + cfRentsNet;

    // 6. Ingresos y Gastos Previstos (Budgets for next month)
    const today = new Date();
    let nextMonthIndex = today.getMonth() + 1;
    let targetYear = today.getFullYear();
    if (nextMonthIndex > 11) {
      nextMonthIndex = 0;
      targetYear += 1;
    }

    let ingresosPrevistos = 0;
    let gastosPrevistos = 0;

    budgets.forEach(b => {
      if (b.year === targetYear) {
        const val = parseFloat(b.months?.[nextMonthIndex]) || 0;
        const code = String(b.accountCode || '');
        const isExpense = b.isExpense !== undefined ? b.isExpense : (code.startsWith('6') || code.startsWith('8'));
        
        if (code.startsWith('7')) {
          ingresosPrevistos += val;
        } else if (isExpense) {
          gastosPrevistos += val;
        }
      }
    });

    return {
      patrimonio: patrimonioNeto,
      liquidez: bankBalance572 + rvPortfolioValue,
      bankBalance,
      bankBalance572,
      totalActivo,
      totalPasivo,
      rvLatente,
      rvPortfolioValue,
      rvBrokerCash,
      realEstateValue,
      realEstateMortgages,
      cfValue,
      ingresosPrevistos,
      gastosPrevistos
    };
  }, [accounts, journalEntries, properties, rvTransactions, rvAssets, brokers, cfProjects, cfTransactions, budgets]);

  const modules = [
    { name: 'Contabilidad', desc: 'Gestión de asientos y cuentas', icon: Calculator },
    { name: 'Laboral', desc: 'Gestión de nóminas, empresas y contratos', icon: Briefcase },
    { name: 'Inversiones inmobiliarias', desc: 'Gestión de propiedades y alquileres', icon: Building2 },
    { name: 'Renta variable', desc: 'Cartera de acciones y dividendos', icon: TrendingUp },
    { name: 'Crowdfunding', desc: 'Préstamos y participaciones', icon: Coins },
    { name: 'Impuestos', desc: 'Modelos y estimaciones fiscales', icon: Percent },
    { name: 'Informes', desc: 'Métricas y balances globales', icon: BarChart3 },
    { name: 'Herramientas', desc: 'Utilidades y configuración', icon: Wrench },
    { name: 'Ayuda', desc: 'Documentación del sistema', icon: HelpCircle }
  ];

  return (
    <div className="w-full h-full min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800">
      
      {/* Main header managed by Layout.jsx */}

      {/* Main Content Dashboard */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-8 overflow-y-auto">
        
        {/* Title */}
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Cuadro de Mando Global</h2>
          <p className="text-xs text-slate-500">Resumen integral y acceso a los módulos contables.</p>
        </div>

        {/* 5 KPI Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          
          {/* Card 1: Patrimonio Actual */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-full translate-x-8 -translate-y-8 group-hover:scale-110 transition-transform duration-300"></div>
            <div className="relative flex flex-col justify-between h-full">
              <div className="flex justify-between items-start mb-4">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Patrimonio Actual</span>
                <div className="p-2 bg-blue-500/10 text-blue-600 rounded-xl">
                  <Wallet className="w-5 h-5" />
                </div>
              </div>
              <div>
                <p className="text-2xl font-black text-slate-900 tracking-tight font-mono">
                  {kpis.patrimonio.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </p>
                <div className="mt-2 text-[10px] text-slate-500 space-y-0.5 border-t border-slate-100 pt-2">
                  <div className="flex justify-between">
                    <span>Total Activos:</span>
                    <span className="font-bold">{(kpis.totalActivo || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Pasivos:</span>
                    <span className="font-bold">{(kpis.totalPasivo || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Liquidez */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-full translate-x-8 -translate-y-8 group-hover:scale-110 transition-transform duration-300"></div>
            <div className="relative flex flex-col justify-between h-full">
              <div className="flex justify-between items-start mb-4">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Liquidez</span>
                <div className="p-2 bg-emerald-500/10 text-emerald-600 rounded-xl">
                  <Coins className="w-5 h-5" />
                </div>
              </div>
              <div>
                <p className="text-2xl font-black text-slate-900 tracking-tight font-mono">
                  {kpis.liquidez.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </p>
                <div className="mt-2 text-[10px] text-slate-500 space-y-0.5 border-t border-slate-100 pt-2">
                  <div className="flex justify-between">
                    <span>Tesorería:</span>
                    <span className="font-bold">{(kpis.bankBalance572 || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Valor Mercado RV:</span>
                    <span className="font-bold">{(kpis.rvPortfolioValue || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Ingresos Previstos Este Mes */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group">
            <div className="relative flex flex-col justify-between h-full">
              <div className="flex justify-between items-start mb-4">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ingresos Previstos</span>
                  <span className="text-[9px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-bold uppercase mt-1 w-max">
                    Previsión
                  </span>
                </div>
                <div className="p-2 bg-slate-100 text-slate-500 rounded-xl">
                  <ArrowUpRight className="w-5 h-5 text-blue-500" />
                </div>
              </div>
              <div>
                <p className="text-2xl font-black text-blue-600 tracking-tight font-mono">
                  {kpis.ingresosPrevistos.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </p>
                <p className="text-[9px] text-slate-450 mt-2 italic uppercase">
                  Mes: {new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toLocaleString('es-ES', { month: 'long' })}
                </p>
              </div>
            </div>
          </div>

          {/* Card 4: Gastos Previstos Este Mes */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group">
            <div className="relative flex flex-col justify-between h-full">
              <div className="flex justify-between items-start mb-4">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Gastos Previstos</span>
                  <span className="text-[9px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-bold uppercase mt-1 w-max">
                    Previsión
                  </span>
                </div>
                <div className="p-2 bg-slate-100 text-slate-500 rounded-xl">
                  <TrendingDown className="w-5 h-5 text-amber-500" />
                </div>
              </div>
              <div>
                <p className="text-2xl font-black text-amber-600 tracking-tight font-mono">
                  {kpis.gastosPrevistos.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </p>
                <p className="text-[9px] text-slate-450 mt-2 italic uppercase">
                  Mes: {new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toLocaleString('es-ES', { month: 'long' })}
                </p>
              </div>
            </div>
          </div>

          {/* Card 5: Neto Previsto Este Mes */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group">
            <div className="relative flex flex-col justify-between h-full">
              <div className="flex justify-between items-start mb-4">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Neto Previsto</span>
                  <span className="text-[9px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded font-bold uppercase mt-1 w-max">
                    Previsión
                  </span>
                </div>
                <div className="p-2 bg-slate-100 text-slate-500 rounded-xl">
                  <Sparkles className="w-5 h-5 text-purple-500" />
                </div>
              </div>
              <div>
                <p className="text-2xl font-black text-purple-600 tracking-tight font-mono">
                  {(kpis.ingresosPrevistos - kpis.gastosPrevistos).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </p>
                <p className="text-[9px] text-slate-450 mt-2 italic uppercase">
                  Mes: {new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toLocaleString('es-ES', { month: 'long' })}
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* Modules Section */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Módulos del Sistema</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {modules.map(mod => (
              <button
                key={mod.name}
                onClick={() => window.dispatchEvent(new CustomEvent('module:select', { detail: mod.name }))}
                className="group flex flex-col items-start p-6 bg-white border border-slate-200 rounded-2xl hover:border-blue-500 hover:shadow-lg transition-all duration-250 text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                <div className="bg-blue-50 p-3.5 rounded-xl mb-4 group-hover:bg-blue-600 transition-colors duration-200">
                  <mod.icon className="w-6 h-6 text-blue-600 group-hover:text-white transition-colors duration-200" strokeWidth={1.5} />
                </div>
                <span className="text-sm font-black text-slate-900 mb-1.5">{mod.name}</span>
                <span className="text-xs text-slate-500 leading-relaxed">{mod.desc}</span>
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 px-6 py-4 flex justify-between items-center text-xs text-slate-400 font-medium select-none shrink-0">
        <span>© {new Date().getFullYear()} Nexo Systems</span>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span>Sistema en línea</span>
        </div>
      </footer>

    </div>
  );
}
