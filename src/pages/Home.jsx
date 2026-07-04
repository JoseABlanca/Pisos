import { 
  Building2, 
  Calculator, 
  BarChart3, 
  Wrench, 
  HelpCircle, 
  TrendingUp, 
  Coins, 
  Percent,
  Terminal
} from 'lucide-react';

export default function Home() {
  const modules = [
    { name: 'Contabilidad', desc: 'Gestión de asientos y cuentas', icon: Calculator },
    { name: 'Inversiones inmobiliarias', desc: 'Gestión de propiedades y alquileres', icon: Building2 },
    { name: 'Renta variable', desc: 'Cartera de acciones y dividendos', icon: TrendingUp },
    { name: 'Crowdfunding', desc: 'Préstamos y participaciones', icon: Coins },
    { name: 'Impuestos', desc: 'Modelos y estimaciones fiscales', icon: Percent },
    { name: 'Informes', desc: 'Métricas y balances globales', icon: BarChart3 },
    { name: 'Herramientas', desc: 'Utilidades y configuración', icon: Wrench },
    { name: 'Ayuda', desc: 'Documentación del sistema', icon: HelpCircle }
  ];

  return (
    <div className="w-full h-full flex items-center justify-center bg-[#808080] p-4" style={{ backgroundImage: 'radial-gradient(#909090 1px, transparent 1px)', backgroundSize: '4px 4px' }}>
      
      {/* Classic Window Wrapper */}
      <div className="bg-[#c0c0c0] border-t-2 border-l-2 border-white border-b-2 border-r-2 border-black/80 shadow-[2px_2px_10px_rgba(0,0,0,0.5)] max-w-3xl w-full flex flex-col">
        
        {/* Title Bar */}
        <div className="bg-gradient-to-r from-[#000080] to-[#1084d0] px-2 py-1 flex justify-between items-center text-white select-none">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4" />
            <span className="font-bold text-[12px] tracking-wide">NEXO - Sistema de Gestión Patrimonial Integrada</span>
          </div>
          <div className="flex gap-1">
            <div className="w-4 h-4 bg-[#c0c0c0] border-t border-l border-white border-b border-r border-black/80 flex items-center justify-center text-black font-bold text-[10px] cursor-not-allowed leading-none">_</div>
            <div className="w-4 h-4 bg-[#c0c0c0] border-t border-l border-white border-b border-r border-black/80 flex items-center justify-center text-black font-bold text-[10px] cursor-not-allowed leading-none">□</div>
            <div className="w-4 h-4 bg-[#c0c0c0] border-t border-l border-white border-b border-r border-black/80 flex items-center justify-center text-black font-bold text-[10px] cursor-not-allowed leading-none">X</div>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-6 flex flex-col items-center bg-[#c0c0c0]">
          
          <div className="text-center mb-8 flex flex-col items-center">
            <div className="bg-[#000080] text-white px-8 py-3 rounded-sm shadow-sm border border-[#000040]">
              <h1 className="text-5xl font-extrabold mb-1 tracking-widest drop-shadow-md">NEXO</h1>
            </div>
            <p className="text-[#333] font-bold text-[14px] mt-4 uppercase tracking-wide">Panel de Control Principal</p>
          </div>
          
          <div className="w-full bg-white border-t-2 border-l-2 border-black/60 border-b-2 border-r-2 border-white p-6 shadow-inner">
            <p className="text-[11px] text-[#000080] font-bold mb-4 uppercase border-b-2 border-[#000080] pb-1.5 inline-block">
              Seleccione un módulo para inicializar
            </p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              {modules.map(mod => (
                <button
                  key={mod.name}
                  onClick={() => window.dispatchEvent(new CustomEvent('module:select', { detail: mod.name }))}
                  className="flex items-start text-left space-x-3 bg-[#c0c0c0] border-t-2 border-l-2 border-white border-b-2 border-r-2 border-black/80 hover:bg-[#d4d0c8] active:border-t-2 active:border-l-2 active:border-black/80 active:border-b-2 active:border-r-2 active:border-white p-2.5 transition-none focus:outline-none"
                >
                  <div className="bg-[#000080] p-1.5 border border-white shadow-sm">
                    <mod.icon className="w-5 h-5 text-white" strokeWidth={1.5} />
                  </div>
                  <div className="flex flex-col flex-1 justify-center">
                    <span className="text-[12px] text-black font-bold leading-none mb-1">{mod.name}</span>
                    <span className="text-[10px] text-gray-700 leading-none">{mod.desc}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 text-[10px] text-gray-600 font-medium w-full flex justify-between px-1">
            <span>© {new Date().getFullYear()} Sistema Nexo</span>
            <span>Estado: Conectado</span>
          </div>

        </div>
      </div>
    </div>
  );
}
