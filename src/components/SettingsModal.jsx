import React, { useState, useEffect } from 'react';
import { Settings, LayoutDashboard, Link2 } from 'lucide-react';
import { db, auth } from '../firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import SettingsComponent from '../pages/Settings';
import Window from './Window';

export default function SettingsModal({ isOpen, onClose, realEstates }) {
  const { user, queryUserIds } = useAuth();
  const [activeTab, setActiveTab] = useState('general');
  const [showSidebar, setShowSidebar] = useState(true);
  const [dashConfig, setDashConfig] = useState({
    contabilidad_balance: '',
    contabilidad_resultados: '',
    contabilidad_flujo: '',
    inversiones_todos: '',
  });
  const [saving, setSaving] = useState(false);
  const [linkEmail, setLinkEmail] = useState('');
  const [linkPassword, setLinkPassword] = useState('');
  const [linking, setLinking] = useState(false);
  const [linkedAccounts, setLinkedAccounts] = useState([]);

  useEffect(() => {
    if (!isOpen || !user) return;
    async function fetchConfig() {
      const docRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.dashboard_urls) {
          setDashConfig(prev => ({ ...prev, ...data.dashboard_urls }));
        }
        if (data.linkedAccounts) {
          setLinkedAccounts(data.linkedAccounts);
        }
      }
    }
    fetchConfig();
  }, [isOpen, user]);

  const handleSaveDash = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await setDoc(doc(db, 'users', user.uid), {
        dashboard_urls: dashConfig,
        updatedAt: new Date()
      }, { merge: true });
      alert('Configuración de Dashboard guardada correctamente');
    } catch (error) {
      console.error(error);
      alert('Error al guardar');
    }
    setSaving(false);
  };

  const handleDashChange = (key, value) => {
    setDashConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleLinkAccount = async (e) => {
    e.preventDefault();
    if (!linkEmail || !linkPassword) return;
    setLinking(true);
    try {
      const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${auth.app.options.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: linkEmail, password: linkPassword, returnSecureToken: true })
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error.message || 'Error al vincular');
      }

      const linkedUid = data.localId;
      if (linkedUid === user.uid) {
        alert('No puedes vincular tu propia cuenta.');
        setLinking(false);
        return;
      }
      
      if (linkedAccounts.includes(linkedUid)) {
        alert('Esta cuenta ya está vinculada.');
        setLinking(false);
        return;
      }

      const newLinkedAccounts = [...linkedAccounts, linkedUid];
      await setDoc(doc(db, 'users', user.uid), {
        linkedAccounts: newLinkedAccounts,
        updatedAt: new Date()
      }, { merge: true });
      
      setLinkedAccounts(newLinkedAccounts);
      setLinkEmail('');
      setLinkPassword('');
      alert('¡Cuenta vinculada correctamente! Ahora podrás ver sus datos en la aplicación.');

    } catch (err) {
      console.error(err);
      alert('Error al vincular: Verifica el email y la contraseña.');
    }
    setLinking(false);
  };

  if (!isOpen) return null;

  const headerContent = {
    general: { icon: <Settings className="w-8 h-8 text-slate-600" />, text: "Gestiona las opciones generales." },
    dashboard: { icon: <LayoutDashboard className="w-8 h-8 text-slate-600" />, text: "Gestiona las URLs de los distintos Dashboards." },
    vinculaciones: { icon: <Link2 className="w-8 h-8 text-slate-600" />, text: "Gestiona las cuentas contables vinculadas." }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100000] flex items-center justify-center font-sans p-4">
      <Window
        title="Configuración de ANTIGRAVITY"
        onClose={onClose}
        width="950px"
        height="650px"
        onMenuClick={() => setShowSidebar(s => !s)}
      >
        <div className="flex flex-col h-full bg-[#f0f0f0] text-[12px] text-slate-800 p-2 gap-2">
          
          <div className="flex flex-row flex-1 overflow-hidden gap-2 relative">
            {/* Sidebar - toggled by the Window menu button */}
            {showSidebar && (
              <div className="w-[200px] border border-gray-400 bg-white flex flex-col shrink-0 overflow-y-auto pt-2">
                <button 
                  className={`text-left px-4 py-2 hover:bg-[#e8e8e8] ${activeTab === 'general' ? 'bg-[#d0d0d0]' : ''}`}
                  onClick={() => setActiveTab('general')}
                >
                  General
                </button>
                <button 
                  className={`text-left px-4 py-2 hover:bg-[#e8e8e8] ${activeTab === 'dashboard' ? 'bg-[#d0d0d0]' : ''}`}
                  onClick={() => setActiveTab('dashboard')}
                >
                  Dashboard URLs
                </button>
                <button 
                  className={`text-left px-4 py-2 hover:bg-[#e8e8e8] ${activeTab === 'vinculaciones' ? 'bg-[#d0d0d0]' : ''}`}
                  onClick={() => setActiveTab('vinculaciones')}
                >
                  Vinculaciones
                </button>
              </div>
            )}

            {/* Content Area */}
            <div className="flex-1 border border-gray-400 bg-[#fafafa] flex flex-col overflow-hidden relative">
              
              {/* Header */}
              <div className="flex items-center gap-4 p-4">
                {headerContent[activeTab].icon}
                <span className="text-[13px] font-semibold">{headerContent[activeTab].text}</span>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                
                {activeTab === 'general' && (
                  <div className="border border-gray-300 bg-white h-full overflow-y-auto p-4">
                    <SettingsComponent />
                  </div>
                )}
                
                {activeTab === 'dashboard' && (
                  <form onSubmit={handleSaveDash} className="space-y-4">
                    <div className="bg-[#eeeeee] p-1.5 font-semibold text-slate-700 border border-gray-300 border-b-0">
                      Módulo Contabilidad
                    </div>
                    <div className="border border-gray-300 bg-white p-4 space-y-4 mb-4">
                      <div className="grid grid-cols-[150px_1fr] items-center gap-4">
                        <label className="text-right">Balance General:</label>
                        <input type="url" value={dashConfig.contabilidad_balance || ''} onChange={(e) => handleDashChange('contabilidad_balance', e.target.value)} className="border border-gray-400 px-2 py-1 w-full" />
                      </div>
                      <div className="grid grid-cols-[150px_1fr] items-center gap-4">
                        <label className="text-right">Cuenta de Resultados:</label>
                        <input type="url" value={dashConfig.contabilidad_resultados || ''} onChange={(e) => handleDashChange('contabilidad_resultados', e.target.value)} className="border border-gray-400 px-2 py-1 w-full" />
                      </div>
                      <div className="grid grid-cols-[150px_1fr] items-center gap-4">
                        <label className="text-right">Flujo de Caja:</label>
                        <input type="url" value={dashConfig.contabilidad_flujo || ''} onChange={(e) => handleDashChange('contabilidad_flujo', e.target.value)} className="border border-gray-400 px-2 py-1 w-full" />
                      </div>
                    </div>

                    <div className="bg-[#eeeeee] p-1.5 font-semibold text-slate-700 border border-gray-300 border-b-0">
                      Módulo Inversiones Inmobiliarias
                    </div>
                    <div className="border border-gray-300 bg-white p-4 space-y-4">
                      <div className="grid grid-cols-[150px_1fr] items-center gap-4">
                        <label className="text-right">Todos los activos:</label>
                        <input type="url" value={dashConfig.inversiones_todos || ''} onChange={(e) => handleDashChange('inversiones_todos', e.target.value)} className="border border-gray-400 px-2 py-1 w-full" />
                      </div>

                      {realEstates && realEstates.length > 0 && (
                        <div className="mt-4 space-y-2 border-t pt-4 border-dashed border-gray-300">
                          <p className="font-semibold mb-2">Activos Específicos:</p>
                          {realEstates.map(re => {
                            const key = `inversiones_${re.id}`;
                            return (
                              <div key={re.id} className="grid grid-cols-[150px_1fr] items-center gap-4">
                                <label className="text-right truncate" title={re.name || re.address || re.id}>{re.name || re.address || re.id}:</label>
                                <input type="url" value={dashConfig[key] || ''} onChange={(e) => handleDashChange(key, e.target.value)} className="border border-gray-400 px-2 py-1 w-full" />
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end gap-2 mt-4">
                      <button type="submit" disabled={saving} className="px-4 py-1 border border-gray-400 bg-gray-100 hover:bg-gray-200">
                        {saving ? 'Guardando...' : 'Guardar ubicación'}
                      </button>
                    </div>
                  </form>
                )}

                {activeTab === 'vinculaciones' && (
                  <div className="space-y-4">
                    <div className="bg-[#eeeeee] p-1.5 font-semibold text-slate-700 border border-gray-300 border-b-0">
                      Vincular Nueva Cuenta
                    </div>
                    <form onSubmit={handleLinkAccount} className="border border-gray-300 bg-white p-4 space-y-4">
                      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
                        <label className="text-right">Email:</label>
                        <input type="email" required value={linkEmail} onChange={e => setLinkEmail(e.target.value)} className="border border-gray-400 px-2 py-1 w-full" />
                      </div>
                      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
                        <label className="text-right">Contraseña:</label>
                        <input type="password" required value={linkPassword} onChange={e => setLinkPassword(e.target.value)} className="border border-gray-400 px-2 py-1 w-full" />
                      </div>
                      <div className="flex justify-end gap-2 mt-2">
                        <button type="submit" disabled={linking} className="px-4 py-1 border border-gray-400 bg-gray-100 hover:bg-gray-200">
                          {linking ? 'Verificando...' : 'Nueva'}
                        </button>
                      </div>
                    </form>

                    <div className="bg-[#eeeeee] p-1.5 font-semibold text-slate-700 border border-gray-300 border-b-0 mt-6">
                      Cuentas Vinculadas
                    </div>
                    <div className="border border-gray-300 bg-white p-4 min-h-[150px]">
                      {linkedAccounts.length === 0 ? (
                        <p className="text-gray-500 italic">No tienes cuentas vinculadas.</p>
                      ) : (
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-gray-300 bg-[#f0f0f0]">
                              <th className="p-2 font-semibold">UID DE CUENTA</th>
                              <th className="p-2 font-semibold w-24 text-center">ESTADO</th>
                            </tr>
                          </thead>
                          <tbody>
                            {linkedAccounts.map((uid, idx) => (
                              <tr key={idx} className="border-b border-gray-200 hover:bg-gray-50">
                                <td className="p-2">{uid}</td>
                                <td className="p-2 text-center"><span className="text-green-700 bg-green-100 px-2 py-0.5 rounded">Activa</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Footer */}
          <div className="flex justify-end gap-2 shrink-0 pt-2 pb-1 pr-1">
             <button className="px-6 py-1 border border-gray-400 bg-gray-100 hover:bg-gray-200 shadow-sm" onClick={onClose}>Aceptar</button>
             <button className="px-6 py-1 border border-gray-400 bg-gray-100 hover:bg-gray-200 shadow-sm" onClick={onClose}>Cancelar</button>
          </div>
        </div>
      </Window>
    </div>
  );
}
