import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

export default function PunteoModal({ isOpen, onClose }) {
  const [punteoType, setPunteoType] = useState('importe'); // 'importe' or 'saldo'

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
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9999] flex items-center justify-center font-sans" onClick={onClose}>
      <div 
        className="bg-white border-2 border-[#808080] shadow-lg w-[480px] flex flex-col" 
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center px-3 py-1.5 border-b border-gray-300">
          <div className="flex items-center space-x-2">
            <div className="w-5 h-5 flex flex-wrap gap-[1px]">
              {/* Little grid icon to mimic the screenshot's top-left corner */}
              {[...Array(9)].map((_, i) => (
                <div key={i} className={`w-1.5 h-1.5 border border-gray-400 ${[0, 1, 3, 4].includes(i) ? 'bg-gray-200' : 'bg-transparent'}`}></div>
              ))}
            </div>
            <span className="text-[12px] font-normal text-gray-800 tracking-wide">Punteo automático de apuntes</span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-red-600 focus:outline-none">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 text-[11px] text-gray-800 space-y-4">
          <p>Selecciona el tipo de punteo.</p>

          {/* Option 1: Por mismo importe */}
          <div className="space-y-2">
            <label className="flex items-center space-x-2 font-bold cursor-pointer">
              <input 
                type="radio" 
                name="punteoType" 
                checked={punteoType === 'importe'} 
                onChange={() => setPunteoType('importe')}
                className="w-3 h-3 text-blue-600"
              />
              <span>Punteo automático por mismo importe</span>
            </label>
            
            <div className={`pl-6 space-y-2 ${punteoType !== 'importe' ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="flex items-center space-x-2">
                <span className="w-24 border border-gray-300 bg-gray-100 px-1 py-0.5 text-center cursor-default">Cuenta inicial:</span>
                <input type="text" className="border border-gray-300 px-1 py-0.5 w-24 outline-none" />
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-24 border border-gray-300 bg-gray-100 px-1 py-0.5 text-center cursor-default">Cuenta final:</span>
                <input type="text" className="border border-gray-300 px-1 py-0.5 w-24 outline-none" />
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-24">Fecha inicial:</span>
                <input type="date" defaultValue="2026-01-01" className="border border-gray-300 px-1 py-0.5 w-32 outline-none" />
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-24">Fecha final:</span>
                <input type="date" defaultValue="2026-12-31" className="border border-gray-300 px-1 py-0.5 w-32 outline-none" />
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-24">Diario:</span>
                <select className="border border-gray-300 px-1 py-0.5 w-48 outline-none">
                  <option>GENERAL</option>
                </select>
              </div>
            </div>
          </div>

          {/* Option 2: Por saldo arrastrado igual a cero */}
          <div className="space-y-2 mt-4">
            <label className="flex items-center space-x-2 font-bold cursor-pointer">
              <input 
                type="radio" 
                name="punteoType" 
                checked={punteoType === 'saldo'} 
                onChange={() => setPunteoType('saldo')}
                className="w-3 h-3 text-blue-600"
              />
              <span>Punteo automático por saldo arrastrado igual a cero</span>
            </label>
            
            <div className={`pl-6 space-y-2 ${punteoType !== 'saldo' ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="flex items-center space-x-2">
                <span className="w-24 border border-gray-300 bg-gray-100 px-1 py-0.5 text-center cursor-default">Cuenta inicial:</span>
                <input type="text" className="border border-gray-300 bg-gray-100 px-1 py-0.5 w-24 outline-none" disabled />
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-24 border border-gray-300 bg-gray-100 px-1 py-0.5 text-center cursor-default">Cuenta final:</span>
                <input type="text" className="border border-gray-300 bg-gray-100 px-1 py-0.5 w-24 outline-none" disabled />
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-24 text-gray-500">Hasta la fecha:</span>
                <input type="date" defaultValue="2026-12-31" className="border border-gray-300 px-1 py-0.5 w-32 outline-none" />
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-24 text-gray-500">Diario:</span>
                <select className="border border-gray-300 px-1 py-0.5 w-48 outline-none">
                  <option>GENERAL</option>
                </select>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="bg-gray-100 border-t border-gray-300 px-4 py-3 flex justify-end space-x-2 mt-2">
          <button 
            onClick={onClose}
            className="border border-gray-400 bg-white hover:bg-gray-50 px-4 py-1 rounded-sm text-[11px] shadow-sm font-medium w-24"
          >
            Aceptar
          </button>
          <button 
            onClick={onClose}
            className="border border-gray-400 bg-white hover:bg-gray-50 px-4 py-1 rounded-sm text-[11px] shadow-sm font-medium w-24"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
