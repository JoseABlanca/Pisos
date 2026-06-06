import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLocation } from 'react-router-dom';
import { db } from '../firebase/config';
import { doc, getDoc } from 'firebase/firestore';

export default function Dashboard() {
  const { user, queryUserIds } = useAuth();
  const location = useLocation();
  const dashboardType = location.state?.dashboardType || 'inversiones_todos'; // fallback default
  const [iframeUrl, setIframeUrl] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    async function fetchUrl() {
      setLoading(true);
      const docRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.dashboard_urls && data.dashboard_urls[dashboardType]) {
          setIframeUrl(data.dashboard_urls[dashboardType]);
        } else {
          setIframeUrl('');
        }
      }
      setLoading(false);
    }
    fetchUrl();
  }, [user, dashboardType]);

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="flex-1 w-full h-full relative flex items-center justify-center">
        {loading ? (
          <div className="text-gray-500 font-medium">Cargando dashboard...</div>
        ) : iframeUrl ? (
          <iframe 
            src={iframeUrl} 
            frameBorder="0" 
            className="absolute inset-0 w-full h-full border-0"
            allowFullScreen 
            sandbox="allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          ></iframe>
        ) : (
          <div className="text-gray-500 font-medium text-center">
            <p className="mb-2">No hay URL configurada para esta vista.</p>
            <p className="text-xs">Ve a Configuración {'>'} Dashboard URLs para añadirla.</p>
          </div>
        )}
      </div>
    </div>
  );
}
