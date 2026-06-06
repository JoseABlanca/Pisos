import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const { confirmReset } = useAuth();
  const navigate = useNavigate();

  const oobCode = searchParams.get('oobCode');
  const mode = searchParams.get('mode');

  useEffect(() => {
    // Basic validation to check if the link is valid
    if (!oobCode || mode !== 'resetPassword') {
      setError('El enlace de recuperación es inválido o ha expirado.');
    }
  }, [oobCode, mode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      return setError('Las contraseñas no coinciden');
    }
    if (newPassword.length < 6) {
      return setError('La contraseña debe tener al menos 6 caracteres');
    }

    try {
      setLoading(true);
      setError('');
      await confirmReset(oobCode, newPassword);
      setSuccess(true);
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch (err) {
      setError('Error al cambiar la contraseña. El enlace puede haber expirado.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md bg-surface-lowest p-8 rounded-2xl ghost-border shadow-ambient relative overflow-hidden">
        {/* Top accent bar */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-primary-container" />
        
        <h1 className="text-display font-display font-extrabold text-primary text-3xl mb-6 text-center tracking-tighter">
          Restablecer Contraseña
        </h1>

        {success ? (
          <div className="text-center space-y-4">
            <div className="bg-success/5 border border-success/10 text-success text-sm font-medium p-4 rounded-xl">
              ¡Contraseña actualizada con éxito!
            </div>
            <p className="text-sm text-outline">
              Redirigiendo al inicio de sesión...
            </p>
          </div>
        ) : error && (!oobCode || mode !== 'resetPassword') ? (
          <div className="text-center space-y-6">
            <div className="bg-error/5 border border-error/10 text-error text-sm font-medium p-4 rounded-xl">
              {error}
            </div>
            <Link to="/login" className="block w-full py-3 bg-surface-low border border-outline-variant text-on-surface rounded-xl font-bold hover:bg-surface transition-all">
              Volver al Login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-outline mb-1.5 ml-1">Nueva Contraseña</label>
              <input 
                type="password" 
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-surface-low border border-transparent focus:border-primary/30 rounded-xl px-4 py-3 text-sm outline-none transition-all"
                placeholder="••••••••"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-outline mb-1.5 ml-1">Confirmar Contraseña</label>
              <input 
                type="password" 
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-surface-low border border-transparent focus:border-primary/30 rounded-xl px-4 py-3 text-sm outline-none transition-all"
                placeholder="••••••••"
                required
              />
            </div>
            
            {error && (
              <div className="bg-error/5 border border-error/10 text-error text-[11px] font-medium p-3 rounded-lg text-center">
                {error}
              </div>
            )}
            
            <button 
              type="submit"
              disabled={loading}
              className={`w-full py-3.5 bg-primary text-white rounded-xl font-bold shadow-ambient transition-all mt-2 ${loading ? 'opacity-70 cursor-not-allowed' : 'hover:bg-primary-container active:scale-[0.98]'}`}
            >
              {loading ? 'Guardando...' : 'Cambiar Contraseña'}
            </button>

            <div className="mt-6 text-center">
              <Link to="/login" className="text-xs text-primary font-bold hover:underline">
                Volver al Login
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
