import React, { useState, useEffect } from 'react';
import { X, FileSearch } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

export default function BankReconciliationModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('conciliacion');
  const { user, queryUserIds } = useAuth();
  const [bankAccounts, setBankAccounts] = useState([]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'accounts'), where('userId', 'in', queryUserIds?.length > 0 ? queryUserIds : [user.uid]));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => d.data());
      const banks = docs.filter(a => a.code && a.code.startsWith('572')).sort((a, b) => a.code.localeCompare(b.code));
      setBankAccounts(banks);
    });
    return () => unsubscribe();
  }, [user]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9999] flex items-center justify-center font-sans p-2" onClick={onClose}>
      <div 
        className="bg-white border-2 border-[#808080] shadow-lg w-[900px] max-w-full h-[700px] max-h-full flex flex-col overflow-hidden" 
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center px-3 py-1.5 border-b border-gray-300">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 border border-gray-400 bg-gray-50 flex items-center justify-center relative">
              <FileSearch className="w-5 h-5 text-gray-500" strokeWidth={1} />
              <div className="absolute top-0 right-[-5px] w-4 h-full border border-gray-400 bg-gray-50 -z-10" />
              <div className="absolute top-0 right-[-10px] w-4 h-full border border-gray-400 bg-gray-50 -z-20" />
            </div>
            <span className="text-[12px] font-normal text-gray-600 tracking-wide">Conciliación bancaria</span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-red-600 focus:outline-none">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Top Filters */}
        <div className="px-4 py-3 flex flex-wrap gap-4 items-center text-[11px] text-gray-800 border-b border-gray-200 overflow-x-auto shrink-0">
          <div className="flex items-center space-x-2 whitespace-nowrap">
            <span className="font-semibold">Fecha inicial / final</span>
            <input type="date" defaultValue="2026-01-01" className="border border-gray-400 px-1 py-0.5 w-28 outline-none focus:border-blue-500" />
            <span>/</span>
            <input type="date" defaultValue="2026-12-31" className="border border-gray-400 px-1 py-0.5 w-28 outline-none focus:border-blue-500" />
          </div>
          
          <div className="flex items-center space-x-2 whitespace-nowrap">
            <span className="font-semibold">Banco:</span>
            <select className="border border-gray-400 px-1 py-0.5 w-64 outline-none focus:border-blue-500">
              {bankAccounts.length === 0 ? (
                <option>Cargando cuentas...</option>
              ) : (
                bankAccounts.map(account => (
                  <option key={account.code} value={account.code}>
                    {account.code} - {account.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="flex items-center space-x-2 whitespace-nowrap">
            <span className="font-semibold">Movimientos:</span>
            <select className="border border-gray-400 px-1 py-0.5 w-24 outline-none focus:border-blue-500">
              <option>Todos</option>
            </select>
          </div>
        </div>

        {/* Main Content: Sidebar + Tabs */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar (Months) */}
          <div className="w-12 bg-white flex flex-col text-[11px] text-gray-600 border-r border-gray-200 overflow-y-auto shrink-0">
            {['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'].map((month, idx) => (
              <div key={idx} className="px-2 py-1.5 hover:bg-gray-100 cursor-pointer text-center">{month}</div>
            ))}
          </div>

          {/* Right Area (Tabs & Tables) */}
          <div className="flex-1 flex flex-col p-2 bg-white">
            {/* Tab Headers */}
            <div className="flex border-b border-gray-300">
              <button 
                className={`px-3 py-1 text-[11px] ${activeTab === 'conciliacion' ? 'bg-white border-t border-x border-gray-300 -mb-[1px] text-gray-800 font-semibold' : 'text-gray-600 hover:text-gray-800'}`}
                onClick={() => setActiveTab('conciliacion')}
              >
                Conciliación
              </button>
              <button 
                className={`px-3 py-1 text-[11px] ${activeTab === 'movimientos' ? 'bg-white border-t border-x border-gray-300 -mb-[1px] text-gray-800 font-semibold' : 'text-gray-600 hover:text-gray-800'}`}
                onClick={() => setActiveTab('movimientos')}
              >
                Movimientos
              </button>
              <button 
                className={`px-3 py-1 text-[11px] ${activeTab === 'operaciones' ? 'bg-white border-t border-x border-gray-300 -mb-[1px] text-gray-800 font-semibold' : 'text-gray-600 hover:text-gray-800'}`}
                onClick={() => setActiveTab('operaciones')}
              >
                Operaciones
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 border border-gray-300 mt-2 flex flex-col p-2 space-y-4 overflow-y-auto">
              
              {/* Movimientos Table Area */}
              <div className="flex flex-col h-1/2 min-h-[150px]">
                <span className="text-[11px] text-gray-700 font-semibold mb-1">Movimientos</span>
                <div className="flex-1 border border-gray-400 overflow-auto bg-white">
                  <table className="w-full text-left text-[11px] whitespace-nowrap">
                    <thead className="sticky top-0 bg-white shadow-sm">
                      <tr className="border-b border-gray-400 text-gray-700">
                        <th className="px-2 py-1 font-normal border-r border-gray-300">PUNTEO</th>
                        <th className="px-2 py-1 font-normal border-r border-gray-300">DIARIO</th>
                        <th className="px-2 py-1 font-normal border-r border-gray-300">FECHA</th>
                        <th className="px-2 py-1 font-normal border-r border-gray-300">ASIENTO</th>
                        <th className="px-2 py-1 font-normal border-r border-gray-300">ORDEN</th>
                        <th className="px-2 py-1 font-normal border-r border-gray-300">CONCEPTO</th>
                        <th className="px-2 py-1 font-normal border-r border-gray-300">DOCUMENTO</th>
                        <th className="px-2 py-1 font-normal border-r border-gray-300 text-right w-24">DEBE</th>
                        <th className="px-2 py-1 font-normal text-right w-24">HABER</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Empty rows for layout */}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Operaciones Table Area */}
              <div className="flex flex-col h-1/2 min-h-[150px]">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[11px] text-gray-700 font-semibold">Operaciones</span>
                  <button className="text-[10px] text-blue-600 hover:underline">Copiar al portapapeles</button>
                </div>
                <div className="flex-1 border border-gray-400 overflow-auto bg-white">
                  <table className="w-full text-left text-[11px] whitespace-nowrap">
                    <thead className="sticky top-0 bg-white shadow-sm">
                      <tr className="border-b border-gray-400 text-gray-700">
                        <th className="px-2 py-1 font-normal border-r border-gray-300">PUNTEO</th>
                        <th className="px-2 py-1 font-normal border-r border-gray-300">FECHA</th>
                        <th className="px-2 py-1 font-normal border-r border-gray-300">CONCEPTO</th>
                        <th className="px-2 py-1 font-normal border-r border-gray-300">Nº OPER./DOCUMENTO</th>
                        <th className="px-2 py-1 font-normal border-r border-gray-300 text-right w-24">DEBE</th>
                        <th className="px-2 py-1 font-normal text-right w-24">HABER</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Empty rows for layout */}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Selección Area */}
              <div className="flex flex-col">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-gray-700 font-semibold">Selección</span>
                  <button className="text-[10px] text-blue-600 hover:underline">Copiar al portapapeles</button>
                </div>
                <div className="h-8 border border-gray-400 mt-1 bg-white"></div>
              </div>

            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col shrink-0">
          {/* Info bar */}
          <div className="bg-[#fdf3c3] border-t border-gray-300 px-3 py-1 flex items-center">
            <span className="text-[11px] font-bold text-gray-700">INFO:</span>
          </div>
          
          {/* Buttons */}
          <div className="bg-gray-100 border-t border-gray-300 px-4 py-2 flex flex-wrap justify-between items-center gap-2">
            <div className="flex flex-wrap gap-2">
              <button className="border border-gray-400 bg-white hover:bg-gray-50 px-3 py-1 text-[11px] shadow-sm">
                Imprimir
              </button>
              <button className="border border-gray-400 bg-white hover:bg-gray-50 px-3 py-1 text-[11px] shadow-sm">
                Creación manual de asiento
              </button>
              <button className="border border-gray-400 bg-white hover:bg-gray-50 px-3 py-1 text-[11px] shadow-sm">
                Conciliación automática de movimientos
              </button>
            </div>
            
            <div className="flex gap-2">
              <button className="border border-gray-400 bg-white hover:bg-gray-50 px-3 py-1 text-[11px] shadow-sm font-semibold">
                Cargar datos
              </button>
              <button onClick={onClose} className="border border-gray-400 bg-white hover:bg-gray-50 px-5 py-1 text-[11px] shadow-sm">
                Salir
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
