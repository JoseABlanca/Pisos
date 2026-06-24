import { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, doc, writeBatch, setDoc, getDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { Save, RefreshCw, Database } from 'lucide-react';

export default function RvConfig() {
  const { user } = useAuth();
  const [sectors, setSectors] = useState('Tecnología, Salud, Consumo, Telecomunicaciones, Financiero, Energía, Cripto, Inmobiliario');
  const [exchangeRates, setExchangeRates] = useState({
    USD: 1.08,
    GBP: 0.85,
    CHF: 0.95
  });
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Fetch existing config from Firestore
  useEffect(() => {
    if (!user) return;
    const fetchConfig = async () => {
      try {
        const docRef = doc(db, 'rv_config', user.uid);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          if (data.sectors) setSectors(data.sectors.join(', '));
          if (data.exchangeRates) setExchangeRates(data.exchangeRates);
        }
      } catch (error) {
        console.error('Error fetching config:', error);
      }
    };
    fetchConfig();
  }, [user]);

  // Handle ribbon actions via custom events
  useEffect(() => {
    const onSave = () => handleSave();
    const onSeed = () => handleSeedMockData();

    window.addEventListener('rv-config:save', onSave);
    window.addEventListener('rv-config:seed', onSeed);

    return () => {
      window.removeEventListener('rv-config:save', onSave);
      window.removeEventListener('rv-config:seed', onSeed);
    };
  }, [sectors, exchangeRates, user]);

  const handleSave = async () => {
    if (!user) return;
    setIsLoading(true);
    setMessage('');
    try {
      const cleanSectors = sectors
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      await setDoc(doc(db, 'rv_config', user.uid), {
        sectors: cleanSectors,
        exchangeRates: {
          USD: parseFloat(exchangeRates.USD) || 1,
          GBP: parseFloat(exchangeRates.GBP) || 1,
          CHF: parseFloat(exchangeRates.CHF) || 1
        },
        userId: user.uid,
        updatedAt: new Date().toISOString()
      });

      setMessage('✓ Configuración guardada correctamente.');
    } catch (error) {
      console.error('Error saving config:', error);
      setMessage('✗ Error al guardar configuración: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSeedMockData = async () => {
    if (!user) return;
    if (
      !window.confirm(
        '¿Está seguro de que desea cargar los datos de ejemplo? Esto agregará activos, brokers y transacciones de prueba a su cuenta.'
      )
    ) {
      return;
    }

    setIsLoading(true);
    setMessage('Cargando datos de ejemplo...');

    try {
      const batch = writeBatch(db);

      // 1. Seed Assets (rv_assets)
      const mockAssets = [
        { id: 'AAPL', name: 'Apple Inc.', isin: 'US0378331005', type: 'Acción', sector: 'Tecnología', currency: 'USD', currentPrice: 182.50, country: 'EE.UU.' },
        { id: 'MSFT', name: 'Microsoft Corp.', isin: 'US5949181045', type: 'Acción', sector: 'Tecnología', currency: 'USD', currentPrice: 425.80, country: 'EE.UU.' },
        { id: 'TEF.MC', name: 'Telefónica S.A.', isin: 'ES0178430E18', type: 'Acción', sector: 'Telecomunicaciones', currency: 'EUR', currentPrice: 4.25, country: 'España' },
        { id: 'IWDA.AS', name: 'iShares Core MSCI World ETF', isin: 'IE00B4L5Y983', type: 'ETF', sector: 'Otros', currency: 'EUR', currentPrice: 89.20, country: 'Irlanda' },
        { id: 'BTC', name: 'Bitcoin', isin: 'BTC-USD', type: 'Criptomoneda', sector: 'Cripto', currency: 'USD', currentPrice: 65400.00, country: 'Global' }
      ];

      mockAssets.forEach((asset) => {
        const docRef = doc(db, 'rv_assets', asset.id);
        batch.set(docRef, {
          ...asset,
          userId: user.uid,
          updatedAt: new Date().toISOString()
        });
      });

      // 2. Seed Brokers (rv_brokers)
      const mockBrokers = [
        { id: 'BR001', name: 'Interactive Brokers', regulation: 'SEC / FINRA (EEUU)', currency: 'USD', cashBalance: 1450.75, accountingAccount: '572005', status: 'activo' },
        { id: 'BR002', name: 'MyInvestor', regulation: 'CNMV (España)', currency: 'EUR', cashBalance: 4250.00, accountingAccount: '572006', status: 'activo' },
        { id: 'BR003', name: 'DeGiro', regulation: 'AFM (Países Bajos)', currency: 'EUR', cashBalance: 320.15, accountingAccount: '572007', status: 'activo' }
      ];

      mockBrokers.forEach((broker) => {
        const docRef = doc(db, 'rv_brokers', broker.id);
        batch.set(docRef, {
          ...broker,
          userId: user.uid,
          updatedAt: new Date().toISOString()
        });
      });

      // 3. Seed Transactions (rv_transactions)
      const mockTransactions = [
        // iShares MSCI World ETF (EUR)
        { id: 'TX001', assetId: 'IWDA.AS', assetName: 'iShares Core MSCI World ETF', brokerId: 'BR002', brokerName: 'MyInvestor', type: 'Compra', date: '2024-01-05', quantity: 50, price: 80.50, fee: 0, exchangeRate: 1.0, currency: 'EUR', notes: 'Aportación periódica indexada' },
        { id: 'TX002', assetId: 'IWDA.AS', assetName: 'iShares Core MSCI World ETF', brokerId: 'BR002', brokerName: 'MyInvestor', type: 'Compra', date: '2024-02-05', quantity: 20, price: 82.10, fee: 0, exchangeRate: 1.0, currency: 'EUR', notes: 'Aportación periódica indexada' },
        
        // Apple (USD)
        { id: 'TX003', assetId: 'AAPL', assetName: 'Apple Inc.', brokerId: 'BR001', brokerName: 'Interactive Brokers', type: 'Compra', date: '2024-01-15', quantity: 15, price: 172.00, fee: 1.50, exchangeRate: 1.09, currency: 'USD', notes: 'Compra inicial en USD' },
        { id: 'TX004', assetId: 'AAPL', assetName: 'Apple Inc.', brokerId: 'BR001', brokerName: 'Interactive Brokers', type: 'Compra', date: '2024-03-10', quantity: 10, price: 178.50, fee: 1.50, exchangeRate: 1.08, currency: 'USD', notes: 'Ampliación de posición' },
        { id: 'TX005', assetId: 'AAPL', assetName: 'Apple Inc.', brokerId: 'BR001', brokerName: 'Interactive Brokers', type: 'Venta', date: '2024-05-20', quantity: 5, price: 191.00, fee: 2.00, exchangeRate: 1.07, currency: 'USD', notes: 'Toma parcial de beneficios' },
        
        // Microsoft (USD)
        { id: 'TX006', assetId: 'MSFT', assetName: 'Microsoft Corp.', brokerId: 'BR001', brokerName: 'Interactive Brokers', type: 'Compra', date: '2024-02-18', quantity: 8, price: 395.00, fee: 1.50, exchangeRate: 1.08, currency: 'USD', notes: 'Posición Inteligencia Artificial' },
        
        // Telefónica (EUR)
        { id: 'TX007', assetId: 'TEF.MC', assetName: 'Telefónica S.A.', brokerId: 'BR003', brokerName: 'DeGiro', type: 'Compra', date: '2024-03-01', quantity: 1000, price: 3.95, fee: 3.50, exchangeRate: 1.0, currency: 'EUR', notes: 'Inversión por dividendo' },
        { id: 'TX008', assetId: 'TEF.MC', assetName: 'Telefónica S.A.', brokerId: 'BR003', brokerName: 'DeGiro', type: 'Dividendo', date: '2024-06-15', quantity: 1000, price: 0.15, fee: 0, exchangeRate: 1.0, currency: 'EUR', notes: 'Cobro dividendo neto' },
        
        // Bitcoin (USD)
        { id: 'TX009', assetId: 'BTC', assetName: 'Bitcoin', brokerId: 'BR001', brokerName: 'Interactive Brokers', type: 'Compra', date: '2024-04-12', quantity: 0.05, price: 62000.00, fee: 10.00, exchangeRate: 1.08, currency: 'USD', notes: 'Exposición a Criptoactivos' }
      ];

      mockTransactions.forEach((tx) => {
        const docRef = doc(db, 'rv_transactions', tx.id);
        batch.set(docRef, {
          ...tx,
          userId: user.uid,
          updatedAt: new Date().toISOString()
        });
      });

      // Save Config too
      const docRefConfig = doc(db, 'rv_config', user.uid);
      batch.set(docRefConfig, {
        sectors: sectors.split(',').map((s) => s.trim()),
        exchangeRates,
        userId: user.uid,
        updatedAt: new Date().toISOString()
      });

      await batch.commit();
      setMessage('✓ Datos de ejemplo cargados correctamente en Firestore.');
    } catch (error) {
      console.error('Error seeding mock data:', error);
      setMessage('✗ Error al cargar datos: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full h-full bg-[#d4d0c8] flex flex-col p-1 overflow-auto font-sans select-none">
      <div className="max-w-3xl mx-auto w-full bg-white border border-[#808080] shadow-md rounded-sm p-6 m-4 space-y-6">
        <div className="border-b border-gray-300 pb-3 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 flex flex-wrap gap-[1px] bg-[#4e80c8] p-1 rounded-sm justify-center items-center">
              <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
            </div>
            <h2 className="text-[16px] font-bold text-slate-800 uppercase tracking-wide">
              Configuración de Renta Variable
            </h2>
          </div>
          {isLoading && <div className="text-[11px] text-gray-500 flex items-center space-x-1"><RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" /> <span>Procesando...</span></div>}
        </div>

        {message && (
          <div
            className={`p-3 rounded text-[11px] font-semibold border ${
              message.startsWith('✓')
                ? 'bg-green-50 text-green-800 border-green-200'
                : message.startsWith('✗')
                ? 'bg-red-50 text-red-800 border-red-200'
                : 'bg-blue-50 text-blue-800 border-blue-200'
            }`}
          >
            {message}
          </div>
        )}

        <div className="space-y-4">
          {/* Sectores */}
          <div className="space-y-1.5">
            <h3 className="text-[12px] font-bold text-slate-700 uppercase tracking-tight">Sectores personalizados</h3>
            <p className="text-[10px] text-gray-500">
              Separa los sectores por comas. Se utilizarán para clasificar los activos en el Portfolio y los gráficos de distribución.
            </p>
            <textarea
              value={sectors}
              onChange={(e) => setSectors(e.target.value)}
              rows={3}
              className="win-input w-full font-mono text-[11px]"
              placeholder="Tecnología, Salud, Consumo..."
            />
          </div>

          {/* Divisas */}
          <div className="space-y-2 pt-4 border-t border-gray-200">
            <h3 className="text-[12px] font-bold text-slate-700 uppercase tracking-tight">
              Tipos de cambio respecto a EUR (€)
            </h3>
            <p className="text-[10px] text-gray-500">
              Tipos de cambio de divisas extranjeras. Se utilizan para calcular el valor total invertido y de mercado en euros (€).
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center space-x-2">
                <span className="text-[11px] font-bold text-slate-600 w-16">1 EUR =</span>
                <input
                  type="number"
                  step="0.0001"
                  value={exchangeRates.USD}
                  onChange={(e) => setExchangeRates({ ...exchangeRates, USD: parseFloat(e.target.value) || 1 })}
                  className="win-input w-24 font-mono text-[11px]"
                />
                <span className="text-[11px] text-gray-500">USD ($)</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-[11px] font-bold text-slate-600 w-16">1 EUR =</span>
                <input
                  type="number"
                  step="0.0001"
                  value={exchangeRates.GBP}
                  onChange={(e) => setExchangeRates({ ...exchangeRates, GBP: parseFloat(e.target.value) || 1 })}
                  className="win-input w-24 font-mono text-[11px]"
                />
                <span className="text-[11px] text-gray-500">GBP (£)</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-[11px] font-bold text-slate-600 w-16">1 EUR =</span>
                <input
                  type="number"
                  step="0.0001"
                  value={exchangeRates.CHF}
                  onChange={(e) => setExchangeRates({ ...exchangeRates, CHF: parseFloat(e.target.value) || 1 })}
                  className="win-input w-24 font-mono text-[11px]"
                />
                <span className="text-[11px] text-gray-500">CHF (Fr.)</span>
              </div>
            </div>
          </div>

          {/* Carga de Datos de Ejemplo */}
          <div className="bg-slate-50 border border-slate-200 rounded p-4 pt-3 mt-6 space-y-2">
            <h3 className="text-[12px] font-bold text-slate-700 uppercase tracking-tight flex items-center space-x-1.5">
              <Database className="w-4 h-4 text-blue-600" />
              <span>Base de datos y Datos de prueba</span>
            </h3>
            <p className="text-[11px] text-gray-600">
              Si es la primera vez que entras al módulo de Renta Variable, puedes rellenar la base de datos de Firestore
              con activos, brokers y transacciones ficticias realistas para probar todas las pantallas y gráficos.
            </p>
            <div className="pt-1">
              <button
                type="button"
                onClick={handleSeedMockData}
                disabled={isLoading}
                className="px-4 py-2 bg-[#4e80c8] hover:bg-[#3b6bb8] text-white border border-[#305aa0] font-bold text-[11px] rounded shadow-sm hover:shadow transition-all cursor-pointer flex items-center space-x-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>Cargar Datos de Ejemplo</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end space-x-2 pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={handleSave}
            disabled={isLoading}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] rounded shadow-sm hover:shadow transition-all cursor-pointer flex items-center space-x-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Guardar Configuración</span>
          </button>
        </div>
      </div>
    </div>
  );
}
