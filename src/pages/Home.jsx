import { Building2, Calculator, BarChart3, Wrench, HelpCircle } from 'lucide-react';

export default function Home() {
  const modules = [
    { name: 'Contabilidad', icon: Calculator },
    { name: 'Inversiones inmobiliarias', icon: Building2 },
    { name: 'Informes', icon: BarChart3 },
    { name: 'Herramientas', icon: Wrench },
    { name: 'Ayuda', icon: HelpCircle }
  ];

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[#f0f0f0]">
      <div className="text-center p-12 bg-white border border-[#d4d0c8] shadow-sm max-w-2xl w-full flex flex-col items-center">
        <h1 className="text-5xl font-bold text-[#5c6bc0] mb-4 uppercase tracking-widest">Nexo</h1>
        <p className="text-gray-600 mb-8 font-medium">Gestión contable y patrimonial integrada</p>
        
        <p className="text-[12px] text-gray-500 italic mb-6">
          Seleccione un módulo para comenzar.
        </p>
        
        <div className="flex flex-wrap justify-center gap-2 mt-4">
          {modules.map(mod => (
            <button
              key={mod.name}
              onClick={() => window.dispatchEvent(new CustomEvent('module:select', { detail: mod.name }))}
              className="flex items-center space-x-2 border border-gray-300 bg-white hover:bg-blue-50 px-3 py-1.5 min-w-[150px] transition-colors"
            >
              <mod.icon className="w-5 h-5 text-[#5c6bc0]" strokeWidth={1.5} />
              <span className="text-[13px] text-gray-700 font-medium">{mod.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
