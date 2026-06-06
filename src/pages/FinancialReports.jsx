import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db, functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { 
  FileText, 
  Send, 
  ArrowUpRight, 
  ArrowDownRight, 
  PieChart, 
  Activity, 
  Columns,
  Mail,
  Calendar
} from 'lucide-react';

export default function FinancialReports() {
  const [searchParams] = useSearchParams();
  const { user, queryUserIds } = useAuth();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'balance'); // balance, income, cashflow, dates
  const [accounts, setAccounts] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Date Filters
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [startMonth, setStartMonth] = useState(0); // 0-11
  const [endMonth, setEndMonth] = useState(11); // 0-11

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!user) return;
    
    const qAccs = query(collection(db, 'accounts'), where('userId', 'in', queryUserIds?.length > 0 ? queryUserIds : [user.uid]));
    const unsubAccs = onSnapshot(qAccs, (snap) => {
      const accs = snap.docs.map(doc => {
        const data = doc.data();
        const code = data.code || '';
        
        // Estandarizar parentId (manejar camelCase o snake_case)
        let parentId = data.parentId !== undefined ? data.parentId : data.parent_id;
        if (parentId === undefined) parentId = null;

        // Inferir tipo si falta para que el reporte lo agrupe bien
        let type = data.type;
        if (!type && code) {
          const first = code.charAt(0);
          if (['2', '3', '4', '5'].includes(first)) type = 'Activo';
          else if (first === '6' || first === '8') type = 'Gasto';
          else if (first === '7' || first === '9') type = 'Ingreso';
          else if (first === '1') {
            if (code.startsWith('10') || code.startsWith('11') || code.startsWith('12')) type = 'Patrimonio';
            else type = 'Pasivo';
          }
        }

        return { 
          id: doc.id, 
          ...data,
          parentId,
          type: type || 'Activo'
        };
      });
      setAccounts(accs);
      setLoading(prev => entries.length > 0 ? false : prev);
    });

    const qEntries = query(collection(db, 'journal_entries'), where('userId', 'in', queryUserIds?.length > 0 ? queryUserIds : [user.uid]));
    const unsubEntries = onSnapshot(qEntries, (snap) => {
      const ents = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setEntries(ents);
      setLoading(false);
    });

    return () => {
      unsubAccs();
      unsubEntries();
    };
  }, [user]);

  const handleSendReport = async () => {
    setSending(true);
    try {
      const sendEmail = httpsCallable(functions, 'sendFinancialReport');
      await sendEmail({ reportType: activeTab, year: selectedYear, startMonth, endMonth });
      alert('Reporte enviado correctamente a la lista de correos configurada.');
    } catch (error) {
      console.error(error);
      alert('Error al enviar el reporte. Asegúrese de haber configurado el SMTP en Herramientas → Configuración.');
    }
    setSending(false);
  };

  const calculateTotal = (types) => {
    return accounts
      .filter(acc => types.includes(acc.type))
      .reduce((sum, acc) => sum + (computedBalances[acc.id] || 0), 0);
  };

  // Helper para agrupar cuentas por sub-categorías (Activo Corriente vs No Corriente, etc)
  const getSubGroup = (account) => {
    const code = account.code || '';
    if (account.type === 'Activo') {
      if (code.startsWith('2')) return 'Activo No Corriente';
      return 'Activo Corriente';
    }
    if (account.type === 'Pasivo') {
      if (code.startsWith('1')) return 'Pasivo No Corriente';
      return 'Pasivo Corriente';
    }
    return account.type;
  };

  const computedBalances = useMemo(() => {
    const bMap = {};
    
    // Filter entries by date
    const startLimit = new Date(selectedYear, startMonth, 1);
    const endLimit = new Date(selectedYear, endMonth + 1, 0, 23, 59, 59);

    const calc = (id) => {
      if (bMap[id] !== undefined) return bMap[id];
      
      const account = accounts.find(a => a.id === id);
      if (!account) return 0;

      // Sum movements from journal entries
      let movementSum = 0;
      entries.forEach(entry => {
        const entryDate = new Date(entry.date);
        
        // For Balance, we take everything until endLimit
        // For Income/Expense, we only take within range
        const isIncomeExpense = ['Ingreso', 'Gasto'].includes(account.type);
        const isInRange = isIncomeExpense 
          ? (entryDate >= startLimit && entryDate <= endLimit)
          : (entryDate <= endLimit);

        if (isInRange && entry.lines) {
          entry.lines.forEach(line => {
            if (line.accountId === id) {
              const debit = parseFloat(line.debit) || 0;
              const credit = parseFloat(line.credit) || 0;
              const isAssetOrExpense = ['Activo', 'Gasto'].includes(account.type);
              movementSum += isAssetOrExpense ? (debit - credit) : (credit - debit);
            }
          });
        }
      });

      let sum = movementSum;
      const children = accounts.filter(a => String(a.parentId) === String(id));
      for (const child of children) {
        sum += calc(child.id);
      }
      bMap[id] = sum;
      return sum;
    };

    accounts.forEach(a => calc(a.id));
    return bMap;
  }, [accounts, entries, selectedYear, startMonth, endMonth]);

  const formatCurrency = (amount) => {
    const formatted = Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    return amount < 0 ? `(${formatted})` : `${formatted}`;
  };

  const ReportRow = ({ label, value, isTotal = false, indent = 0, isHeader = false, isSubHeader = false, hasTopLine = false, hasBottomLine = false }) => (
    <div className={`flex justify-between py-1.5 ${isHeader ? 'mb-2 mt-4 text-[#595edb]' : ''} ${isSubHeader ? 'font-bold italic mt-2' : ''} ${isTotal ? 'mt-1 font-bold pt-2' : ''} ${hasTopLine ? 'border-t border-black pt-2' : ''} ${hasBottomLine ? 'border-b-2 border-black pb-2' : ''}`}>
      <span className={`${indent > 0 ? `pl-${indent * 4}` : ''} ${isHeader ? 'font-bold text-xl' : 'text-[15px]'} ${!isHeader && !isSubHeader && !isTotal ? 'text-slate-800' : ''}`}>
        {label}
      </span>
      {!isHeader && !isSubHeader && (
        <span className={`font-mono text-[15px] ${isTotal ? 'font-bold' : 'text-slate-800'}`}>
          {formatCurrency(value)}
        </span>
      )}
    </div>
  );

  const AccountTree = ({ docAccounts, level = 1 }) => {
    const sorted = [...docAccounts].sort((a, b) => (a.code || '').localeCompare(b.code || ''));
    return sorted.map(a => {
      const balance = computedBalances[a.id] || 0;
      if (Math.abs(balance) < 0.01) return null;
      const children = accounts.filter(child => String(child.parentId) === String(a.id));
      const activeChildren = children.filter(c => Math.abs(computedBalances[c.id] || 0) > 0.01);
      
      return (
        <div key={a.id}>
          <ReportRow label={a.name} value={balance} indent={level} />
          {activeChildren.length > 0 && (
            <AccountTree docAccounts={activeChildren} level={level + 1} />
          )}
        </div>
      );
    });
  };

  const renderBalanceSheet = () => {
    const currentAssetsList = accounts.filter(a => a.type === 'Activo' && getSubGroup(a) === 'Activo Corriente');
    const nonCurrentAssetsList = accounts.filter(a => a.type === 'Activo' && getSubGroup(a) === 'Activo No Corriente');
    const equityList = accounts.filter(a => a.type === 'Patrimonio');
    const liabilitiesList = accounts.filter(a => a.type === 'Pasivo');

    const getTopLevel = (list) => list.filter(a => !a.parentId || !list.find(p => String(p.id) === String(a.parentId)));

    const currentAssetsTop = getTopLevel(currentAssetsList);
    const nonCurrentAssetsTop = getTopLevel(nonCurrentAssetsList);
    const equityTop = getTopLevel(equityList);
    const liabilitiesTop = getTopLevel(liabilitiesList);

    const totalCurrentAssets = currentAssetsTop.reduce((s, a) => s + (computedBalances[a.id] || 0), 0);
    const totalNonCurrentAssets = nonCurrentAssetsTop.reduce((s, a) => s + (computedBalances[a.id] || 0), 0);
    const totalAssets = totalCurrentAssets + totalNonCurrentAssets;

    const totalEquity = equityTop.reduce((s, a) => s + (computedBalances[a.id] || 0), 0);
    const totalLiabilities = liabilitiesTop.reduce((s, a) => s + (computedBalances[a.id] || 0), 0);
    const totalEquityLiabilities = totalEquity + totalLiabilities;

    if (Math.abs(totalAssets) < 0.01 && Math.abs(totalEquityLiabilities) < 0.01) {
      return (
        <div className="max-w-4xl mx-auto bg-white p-12 text-center text-slate-400 italic font-sans border border-dashed border-slate-200">
          No hay cuentas con saldo para mostrar en este informe.
        </div>
      );
    }

    return (
      <div className="max-w-4xl mx-auto bg-white p-12 text-black font-sans">
        <div className="flex justify-end border-b-2 border-black pb-2 mb-8">
          <span className="font-bold text-lg">
            {new Date().toLocaleDateString('es-ES', { month: 'long', day: '2-digit', year: 'numeric' })}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-12">
          {/* BLOQUE DE ACTIVOS */}
          <section>
            <div className="text-[#4a69bd] py-1 font-black uppercase tracking-widest text-lg mb-4">
              I. ACTIVO
            </div>
            
            {Math.abs(totalNonCurrentAssets) > 0.01 && (
              <div className="mb-6 pl-4">
                <ReportRow label="A) ACTIVO NO CORRIENTE" isSubHeader />
                <AccountTree docAccounts={nonCurrentAssetsTop} level={1} />
                <ReportRow label="Total Activo No Corriente" value={totalNonCurrentAssets} isTotal hasTopLine />
              </div>
            )}

            {Math.abs(totalCurrentAssets) > 0.01 && (
              <div className="mb-4 pl-4">
                <ReportRow label="B) ACTIVO CORRIENTE" isSubHeader />
                <AccountTree docAccounts={currentAssetsTop} level={1} />
                <ReportRow label="Total Activo Corriente" value={totalCurrentAssets} isTotal hasTopLine />
              </div>
            )}
            
            <div className="mt-4">
              <ReportRow label="Total Activo" value={totalAssets} isTotal hasTopLine />
            </div>
          </section>

          {/* BLOQUE DE PASIVO */}
          <section>
            <div className="text-[#4a69bd] py-1 font-black uppercase tracking-widest text-lg mb-4">
              II. PASIVO
            </div>
            
            {Math.abs(totalLiabilities) > 0.01 && (
              <div className="mb-6 pl-4">
                <AccountTree docAccounts={liabilitiesTop} level={1} />
                <ReportRow label="Total Pasivo" value={totalLiabilities} isTotal hasTopLine />
              </div>
            )}
          </section>

          {/* BLOQUE DE PATRIMONIO NETO */}
          <section>
            <div className="text-[#4a69bd] py-1 font-black uppercase tracking-widest text-lg mb-4">
              III. PATRIMONIO NETO
            </div>
            
            <div className="mb-4 pl-4">
              <AccountTree docAccounts={equityTop} level={1} />
              <ReportRow label="Total Patrimonio Neto" value={totalEquity} isTotal hasTopLine />
            </div>
          </section>
        </div>
      </div>
    );
  };

  const renderIncomeStatement = () => {
    const incomesList = accounts.filter(a => a.type === 'Ingreso');
    const expensesList = accounts.filter(a => a.type === 'Gasto');

    const getTopLevel = (list) => list.filter(a => !a.parentId || !list.find(p => String(p.id) === String(a.parentId)));

    const incomesTop = getTopLevel(incomesList);
    const expensesTop = getTopLevel(expensesList);

    const totalIncomes = incomesTop.reduce((s, a) => s + (computedBalances[a.id] || 0), 0);
    const totalExpenses = expensesTop.reduce((s, a) => s + (computedBalances[a.id] || 0), 0);
    const result = totalIncomes - totalExpenses;

    if (Math.abs(totalIncomes) < 0.01 && Math.abs(totalExpenses) < 0.01) {
      return (
        <div className="max-w-4xl mx-auto bg-white p-12 text-center text-slate-400 italic font-sans border border-dashed border-slate-200">
          No hay movimientos de ingresos o gastos para mostrar en este informe.
        </div>
      );
    }

    return (
      <div className="max-w-4xl mx-auto bg-white p-12 text-black font-sans">
        <div className="flex justify-end border-b-2 border-black pb-2 mb-8">
          <span className="font-bold text-lg">
            {new Date().toLocaleDateString('es-ES', { month: 'long', day: '2-digit', year: 'numeric' })}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {Math.abs(totalIncomes) > 0.01 && (
            <section>
              <ReportRow label="INGRESOS DE EXPLOTACIÓN" isHeader />
              <div className="mb-4 pl-4">
                <AccountTree docAccounts={incomesTop} level={1} />
                <ReportRow label="Total Ingresos" value={totalIncomes} isTotal />
              </div>
            </section>
          )}
          
          {Math.abs(totalExpenses) > 0.01 && (
            <section className="mt-4">
              <ReportRow label="GASTOS DE EXPLOTACIÓN" isHeader />
              <div className="mb-4 pl-4">
                <AccountTree docAccounts={expensesTop} level={1} />
                <ReportRow label="Total Gastos" value={totalExpenses} isTotal />
              </div>
            </section>
          )}

          <section className="mt-8">
            <ReportRow label="RESULTADO DEL EJERCICIO" value={result} isTotal />
          </section>
        </div>
      </div>
    );
  };

  const renderDateSettings = () => {
    const years = [...new Set(entries.map(e => new Date(e.date).getFullYear()))].sort((a, b) => b - a);
    if (years.length === 0) years.push(new Date().getFullYear());

    const months = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    return (
      <div className="max-w-4xl mx-auto bg-white p-6 md:p-12 shadow-sm border border-slate-200">
        <div className="flex items-center space-x-3 mb-8 border-b pb-4">
          <Calendar className="w-6 h-6 text-blue-800" />
          <h2 className="text-xl font-black uppercase tracking-tight text-slate-800">Configuración de Periodo</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-400 mb-2">Año de Ejercicio</label>
            <select 
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="w-full bg-slate-50 border border-slate-200 rounded-none px-4 py-3 font-bold text-slate-700 outline-none focus:border-blue-500 transition-all"
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase text-slate-400 mb-2">Mes Inicial</label>
            <select 
              value={startMonth}
              onChange={(e) => setStartMonth(parseInt(e.target.value))}
              className="w-full bg-slate-50 border border-slate-200 rounded-none px-4 py-3 font-bold text-slate-700 outline-none focus:border-blue-500 transition-all"
            >
              {months.map((m, i) => <option key={i} value={i} disabled={i > endMonth}>{m}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase text-slate-400 mb-2">Mes Final</label>
            <select 
              value={endMonth}
              onChange={(e) => setEndMonth(parseInt(e.target.value))}
              className="w-full bg-slate-50 border border-slate-200 rounded-none px-4 py-3 font-bold text-slate-700 outline-none focus:border-blue-500 transition-all"
            >
              {months.map((m, i) => <option key={i} value={i} disabled={i < startMonth}>{m}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-12 p-6 bg-blue-50 border border-blue-100 flex items-start space-x-4">
          <div className="p-2 bg-blue-100 rounded-full">
            <Activity className="w-5 h-5 text-blue-800" />
          </div>
          <div>
            <h3 className="text-sm font-black text-blue-900 uppercase mb-1">Impacto en los Reportes</h3>
            <p className="text-xs text-blue-800/70 leading-relaxed">
              Los cambios realizados aquí filtrarán inmediatamente los datos de <span className="font-bold">Balance</span>, <span className="font-bold">Resultados</span> y <span className="font-bold">Caja</span>. 
              El balance mostrará la situación acumulada hasta el fin del periodo seleccionado.
            </p>
          </div>
        </div>
      </div>
    );
  };

  const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  return (
    <div className="p-4 md:p-6 min-h-screen bg-slate-100">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <div>
          <div className="flex items-center space-x-3 mb-1">
            <FileText className="text-slate-800 w-8 h-8" />
            <h1 className="text-2xl md:text-3xl font-display font-black text-slate-900 uppercase tracking-tighter italic border-b-4 border-slate-900">
              INFORMES <span className="text-blue-800">OFICIALES</span>
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Generación bajo normativa NIFF / PGC Español</p>
            <div className="h-1 w-1 bg-slate-300 rounded-full" />
            <p className="text-[10px] text-blue-700 font-black uppercase tracking-widest bg-blue-50 px-2 py-0.5 border border-blue-100">
              {months[startMonth]} - {months[endMonth]} {selectedYear}
            </p>
          </div>
        </div>
        
        <button 
          onClick={handleSendReport}
          disabled={sending}
          className="w-full md:w-auto bg-slate-900 text-white hover:bg-black transition-all shadow-lg hover:shadow-xl rounded-none px-8 h-12 flex items-center justify-center space-x-3 uppercase tracking-widest text-[10px] font-black"
        >
          {sending ? <Activity className="w-5 h-5 animate-spin" /> : <Mail className="w-5 h-5" />}
          <span>Certificar y Enviar por Email</span>
        </button>
      </div>

      {/* Report Tabs - Scrollable on mobile */}
      <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 mb-8 scrollbar-hide">
        <div className="flex min-w-max space-x-px bg-slate-300 p-0.5 shadow-sm">
          {[
            { id: 'balance', label: 'Balance', icon: Columns },
            { id: 'income', label: 'Resultados', icon: PieChart },
            { id: 'cashflow', label: 'Efectivo', icon: Activity },
            { id: 'dates', label: 'Fechas', icon: Calendar },
            { id: 'informe', label: 'Looker', icon: PieChart }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 px-6 md:px-8 py-3 transition-all font-black uppercase text-[10px] tracking-widest ${
                activeTab === tab.id 
                ? 'bg-white text-slate-900' 
                : 'bg-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content Area */}
      <div className="pb-20">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-40 space-y-4">
            <Activity className="w-12 h-12 text-blue-900 animate-spin" />
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Analizando registros oficiales...</p>
          </div>
        ) : (
          <div className="animate-in fade-in zoom-in-95 duration-700">
            {activeTab === 'balance' && renderBalanceSheet()}
            {activeTab === 'income' && renderIncomeStatement()}
            {activeTab === 'cashflow' && renderCashFlow()}
            {activeTab === 'dates' && renderDateSettings()}
            {activeTab === 'informe' && (
               <iframe width="100%" height="100%" src="https://datastudio.google.com/embed/reporting/3f2ab6f8-a779-4f74-bdcf-97fe1b5d85b1/page/WaZzF" frameBorder="0" style={{ border: 0, minHeight: '80vh' }} allowFullScreen sandbox="allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
