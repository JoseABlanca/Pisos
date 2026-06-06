import { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { Save, Mail, Shield, CloudUpload, AlertCircle, CheckCircle } from 'lucide-react';
import { migrateLocalData } from '../services/migrationService';

export default function Settings() {
  const { user, queryUserIds } = useAuth();
  const [config, setConfig] = useState({
    email_server: '',
    email_password: '',
    recipient_emails: '',
    company_name: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrationStats, setMigrationStats] = useState(null);

  useEffect(() => {
    async function fetchConfig() {
      if (!user) return;
      const docRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setConfig({
          email_server: data.email_server || '',
          email_password: data.email_password || '',
          recipient_emails: data.recipient_emails || '',
          company_name: data.company_name || ''
        });
      }
      setLoading(false);
    }
    fetchConfig();
  }, [user]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await setDoc(doc(db, 'users', user.uid), {
        ...config,
        updatedAt: new Date()
      }, { merge: true });
      alert('Configuración guardada correctamente');
    } catch (error) {
      console.error(error);
      alert('Error al guardar');
    }
    setSaving(false);
  };

  const handleMigrate = async () => {
    if (!window.confirm('¿Deseas subir tus datos locales a la nube? Esto no borrará tus datos locales, solo los copiará a Firebase.')) return;
    setMigrating(true);
    try {
      const result = await migrateLocalData(user.uid);
      setMigrationStats(result);
    } catch (error) {
      console.error(error);
      alert('Error durante la migración');
    }
    setMigrating(false);
  };

  if (loading) return <div className="p-8">Cargando configuración...</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center space-x-3 mb-8">
        <div className="p-2 bg-primary rounded-lg">
          <Settings className="text-white w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-black text-on-surface uppercase tracking-tight">Configuración del Sistema</h1>
          <p className="text-xs text-on-surface-variant font-bold uppercase italic">Nexo Pro v4.3.0 / Setup</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Email Section */}
        <div className="bg-surface-lowest rounded-xl border border-outline-variant shadow-ambient overflow-hidden">
          <div className="bg-surface-low px-6 py-3 border-b border-outline-variant flex items-center space-x-2">
            <Mail className="w-4 h-4 text-primary" />
            <h2 className="text-xs font-black uppercase tracking-widest">Configuración de Reportes (SMTP)</h2>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-outline mb-1.5 ml-1">Email Emisor</label>
                <input 
                  type="email"
                  value={config.email_server}
                  onChange={(e) => setConfig({...config, email_server: e.target.value})}
                  className="w-full bg-background border border-outline-variant/50 rounded-lg px-4 py-2.5 text-sm focus:border-primary outline-none transition-all"
                  placeholder="ejemplo@google.com"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-outline mb-1.5 ml-1">Contraseña de Aplicación</label>
                <input 
                  type="password"
                  value={config.email_password}
                  onChange={(e) => setConfig({...config, email_password: e.target.value})}
                  className="w-full bg-background border border-outline-variant/50 rounded-lg px-4 py-2.5 text-sm focus:border-primary outline-none transition-all"
                  placeholder="••••••••••••••••"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-outline mb-1.5 ml-1">Destinatarios (Separados por coma)</label>
              <textarea 
                value={config.recipient_emails}
                onChange={(e) => setConfig({...config, recipient_emails: e.target.value})}
                className="w-full bg-background border border-outline-variant/50 rounded-lg px-4 py-2.5 text-sm focus:border-primary outline-none transition-all h-[115px] resize-none"
                placeholder="admin@empresa.com, contabilidad@empresa.com"
              />
            </div>
          </div>
        </div>

        {/* Company Section */}
        <div className="bg-surface-lowest rounded-xl border border-outline-variant shadow-ambient overflow-hidden">
          <div className="bg-surface-low px-6 py-3 border-b border-outline-variant flex items-center space-x-2">
            <Shield className="w-4 h-4 text-primary" />
            <h2 className="text-xs font-black uppercase tracking-widest">Datos de la Empresa</h2>
          </div>
          <div className="p-6">
            <label className="block text-[10px] font-black uppercase text-outline mb-1.5 ml-1">Nombre Comercial / Razón Social</label>
            <input 
              type="text"
              value={config.company_name}
              onChange={(e) => setConfig({...config, company_name: e.target.value})}
              className="w-full bg-background border border-outline-variant/50 rounded-lg px-4 py-2.5 text-sm focus:border-primary outline-none transition-all"
              placeholder="Nexo Contabilidades S.L."
            />
          </div>
        </div>

        {/* Migration Section */}
        <div className="bg-surface-lowest rounded-xl border border-outline-variant shadow-ambient overflow-hidden">
          <div className="bg-surface-low px-6 py-3 border-b border-outline-variant flex items-center space-x-2">
            <CloudUpload className="w-4 h-4 text-primary" />
            <h2 className="text-xs font-black uppercase tracking-widest">Sincronización con la Nube</h2>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-sm text-on-surface-variant">
              Si tienes datos guardados localmente en este navegador, puedes subirlos a tu cuenta de Firebase para acceder a ellos desde cualquier dispositivo.
            </p>
            
            {migrationStats ? (
              <div className="bg-success/10 border border-success/20 rounded-lg p-4 space-y-2">
                <div className="flex items-center space-x-2 text-success font-bold text-sm">
                  <CheckCircle className="w-4 h-4" />
                  <span>Migración Completada</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>Propiedades: <span className="font-bold">{migrationStats.properties}</span></div>
                  <div>Propietarios: <span className="font-bold">{migrationStats.partners}</span></div>
                  <div>Clientes: <span className="font-bold">{migrationStats.customers}</span></div>
                  <div>Alquileres: <span className="font-bold">{migrationStats.rentals}</span></div>
                </div>
                {migrationStats.errors.length > 0 && (
                  <div className="mt-2 text-error text-[10px]">
                    {migrationStats.errors.map((err, i) => <div key={i}>⚠ {err}</div>)}
                  </div>
                )}
                <button 
                  onClick={() => setMigrationStats(null)}
                  className="text-[10px] uppercase font-black text-outline hover:text-primary transition-colors"
                >
                  Cerrar resumen
                </button>
              </div>
            ) : (
              <button 
                type="button"
                onClick={handleMigrate}
                disabled={migrating}
                className="flex items-center space-x-2 bg-primary text-white px-6 py-3 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-primary-dark transition-all disabled:opacity-50"
              >
                {migrating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Migrando datos...</span>
                  </>
                ) : (
                  <>
                    <CloudUpload className="w-4 h-4" />
                    <span>Subir datos locales a Firebase</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <button 
            type="submit"
            disabled={saving}
            className="btn-classic-primary flex items-center space-x-2 h-12 px-8 uppercase tracking-widest"
          >
            {saving ? <span>Guardando...</span> : (
              <>
                <Save className="w-4 h-4" />
                <span>Guardar Configuración</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
