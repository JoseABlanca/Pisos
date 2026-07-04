import { 
  Building2, 
  Calculator, 
  BarChart3, 
  Wrench, 
  HelpCircle, 
  TrendingUp, 
  Coins, 
  Percent
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
    <div className="w-full h-full flex items-center justify-center bg-slate-50 p-4 font-sans text-slate-800">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-4xl w-full flex flex-col overflow-hidden">
        
        {/* Header Section */}
        <div className="bg-gradient-to-r from-blue-900 to-blue-700 px-8 py-10 flex flex-col items-center justify-center text-white relative overflow-hidden">
          <div className="absolute inset-0 bg-blue-900/20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-400/20 via-transparent to-transparent"></div>
          <h1 className="text-5xl font-black mb-3 tracking-tight z-10">NEXO</h1>
          <p className="text-blue-100 font-medium text-sm md:text-base tracking-wide z-10 uppercase">
            Gestión Contable y Patrimonial Integrada
          </p>
        </div>

        {/* Content Area */}
        <div className="p-8 md:p-10 bg-slate-50/50">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-6 text-center">
            Seleccione un módulo para comenzar
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {modules.map(mod => (
              <button
                key={mod.name}
                onClick={() => window.dispatchEvent(new CustomEvent('module:select', { detail: mod.name }))}
                className="group flex flex-col items-start p-5 bg-white border border-slate-200 rounded-xl hover:border-blue-500 hover:shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 text-left"
              >
                <div className="bg-blue-50 p-3 rounded-lg mb-4 group-hover:bg-blue-500 transition-colors duration-200">
                  <mod.icon className="w-6 h-6 text-blue-600 group-hover:text-white transition-colors duration-200" strokeWidth={1.5} />
                </div>
                <span className="text-sm font-bold text-slate-800 mb-1.5">{mod.name}</span>
                <span className="text-xs text-slate-500 leading-relaxed">{mod.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-white border-t border-slate-100 px-8 py-4 flex justify-between items-center text-xs text-slate-400 font-medium">
          <span>© {new Date().getFullYear()} Nexo Systems</span>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Sistema en línea</span>
          </div>
        </div>

      </div>
    </div>
  );
}
