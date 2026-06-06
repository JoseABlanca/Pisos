import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const { signup, googleLogin } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      return setError('Las contraseñas no coinciden');
    }
    setError('');
    try {
      await signup(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError('Error al crear la cuenta. Verifica los datos.');
    }
  };

  const handleGoogleLogin = async () => {
    try {
      await googleLogin();
      navigate('/dashboard');
    } catch (err) {
      setError('Error al registrarse con Google');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md bg-surface-lowest p-8 rounded-2xl ghost-border shadow-ambient relative overflow-hidden">
        {/* Decorative element */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-success to-primary-container" />
        
        <h1 className="text-display font-display font-extrabold text-primary text-4xl mb-2 text-center tracking-tighter">
          Nexo
        </h1>
        <p className="text-on-surface-variant text-sm text-center mb-8">Crea tu libro contable digital</p>
        
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-outline mb-1.5 ml-1">Email</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-surface-low border border-transparent focus:border-primary/30 rounded-xl px-4 py-3 text-sm outline-none transition-all"
              placeholder="nombre@empresa.com"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-outline mb-1.5 ml-1">Contraseña</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
            className="w-full py-3.5 bg-primary text-white rounded-xl font-bold shadow-ambient hover:bg-primary-container active:scale-[0.98] transition-all mt-4"
          >
            Crear Cuenta
          </button>

          <div className="relative flex items-center justify-center py-1">
            <div className="w-full border-t border-outline-variant/30"></div>
            <span className="bg-surface-lowest px-3 text-[10px] text-outline font-bold uppercase tracking-widest absolute">O</span>
          </div>

          <button 
            type="button"
            onClick={handleGoogleLogin}
            className="w-full py-3 bg-white border border-outline-variant text-on-surface rounded-xl font-bold flex items-center justify-center space-x-2 hover:bg-surface-low transition-all"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.26.81-.58z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            <span>Registrarse con Google</span>
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-outline-variant/10 text-center">
          <p className="text-xs text-on-surface-variant">
            ¿Ya tienes una cuenta? {' '}
            <Link to="/login" className="text-primary font-bold hover:underline">
              Inicia Sesión
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
