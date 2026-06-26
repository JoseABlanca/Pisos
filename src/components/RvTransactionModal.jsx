import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase/config';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import Window from './Window';
import { Save } from 'lucide-react';

export default function RvTransactionModal({ 
  isOpen, 
  onClose, 
  userId, 
  assets = [], 
  brokers = [], 
  transactions = [], 
  editTx = null,
  defaultAssetId = '',
  defaultBrokerId = ''
}) {
  const [isEditing, setIsEditing] = useState(false);
  
  // Form State
  const [formData, setFormData] = useState({
    id: '',
    assetId: '',
    brokerId: '',
    type: 'Compra',
    date: new Date().toISOString().split('T')[0],
    quantity: '',
    price: '',
    fee: '0',
    exchangeRate: '1.0',
    currency: 'EUR',
    notes: ''
  });

  const [selectedDivisaAssetId, setSelectedDivisaAssetId] = useState('');
  const [rateStatus, setRateStatus] = useState('idle');

  // Load selected broker's currency on broker change
  useEffect(() => {
    if (formData.brokerId) {
      const selectedBroker = brokers.find(b => b.id === formData.brokerId);
      if (selectedBroker) {
        setFormData(prev => ({
          ...prev,
          currency: selectedBroker.currency || 'EUR'
        }));
      }
    }
  }, [formData.brokerId, brokers]);

  // Load/initialize form data
  useEffect(() => {
    if (!isOpen) return;
    if (editTx) {
      setIsEditing(true);
      setSelectedDivisaAssetId(editTx.selectedDivisaAssetId || '');
      setRateStatus('idle');
      setFormData({ ...editTx });
    } else {
      setIsEditing(false);
      setSelectedDivisaAssetId('');
      setRateStatus('idle');
      const maxId = transactions.reduce((max, t) => {
        const num = parseInt(t.id.replace('TX', '')) || 0;
        return num > max ? num : max;
      }, 0);

      const initAssetId = defaultAssetId || assets[0]?.id || '';
      const initBrokerId = defaultBrokerId || brokers[0]?.id || '';
      const selectedBroker = brokers.find(b => b.id === initBrokerId);

      setFormData({
        id: `TX${String(maxId + 1).padStart(3, '0')}`,
        assetId: initAssetId,
        brokerId: initBrokerId,
        type: 'Compra',
        date: new Date().toISOString().split('T')[0],
        quantity: '',
        price: '',
        fee: '0',
        exchangeRate: '1.0',
        currency: selectedBroker?.currency || 'EUR',
        notes: ''
      });
    }
  }, [isOpen, editTx, assets, brokers, transactions, defaultAssetId, defaultBrokerId]);

  // Fetch exchange rate from history when date or selected divisa asset changes
  useEffect(() => {
    if (!selectedDivisaAssetId || !formData.date) {
      setRateStatus('idle');
      return;
    }

    const fetchRate = async () => {
      setRateStatus('loading');
      try {
        const docRef = doc(db, 'rv_asset_history', `${selectedDivisaAssetId}_${formData.date}`);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.close) {
            setFormData(prev => ({
              ...prev,
              exchangeRate: String(data.close)
            }));
            setRateStatus('found');
          } else {
            setRateStatus('not_found');
          }
        } else {
          setRateStatus('not_found');
        }
      } catch (error) {
        console.error('Error fetching exchange rate from history:', error);
        setRateStatus('not_found');
      }
    };

    fetchRate();
  }, [selectedDivisaAssetId, formData.date]);

  // Live calculation for form preview
  const selectedAsset = useMemo(() => assets.find(a => a.id === formData.assetId), [assets, formData.assetId]);
  const selectedBroker = useMemo(() => brokers.find(b => b.id === formData.brokerId), [brokers, formData.brokerId]);
  
  const cleanAssetCurrency = useMemo(() => (selectedAsset?.currency || 'EUR').substring(0, 3).toUpperCase(), [selectedAsset]);
  const cleanTxCurrency = useMemo(() => (formData.currency || 'EUR').substring(0, 3).toUpperCase(), [formData.currency]);

  const liveQty = parseFloat(formData.quantity) || 0;
  const livePrice = parseFloat(formData.price) || 0;
  const liveFee = parseFloat(formData.fee) || 0;
  const liveRate = parseFloat(formData.exchangeRate) || 1.0;
  const liveRateDivisor = (liveRate && liveRate > 0) ? liveRate : 1.0;

  // Price in EUR
  const livePriceEUR = useMemo(() => cleanAssetCurrency !== 'EUR' ? (livePrice / liveRateDivisor) : livePrice, [cleanAssetCurrency, livePrice, liveRateDivisor]);

  // Total in asset currency
  const liveTotalAssetVal = useMemo(() => {
    return formData.type === 'Compra'
      ? (liveQty * livePrice) + (cleanTxCurrency === cleanAssetCurrency ? liveFee : liveFee * liveRateDivisor)
      : formData.type === 'Venta'
      ? (liveQty * livePrice) - (cleanTxCurrency === cleanAssetCurrency ? liveFee : liveFee * liveRateDivisor)
      : (liveQty * livePrice);
  }, [formData.type, liveQty, livePrice, liveFee, cleanTxCurrency, cleanAssetCurrency, liveRateDivisor]);

  // Total in transaction currency (broker currency)
  const liveTotalAmt = useMemo(() => {
    if (cleanTxCurrency === 'EUR') {
      const priceInTxCurrency = cleanAssetCurrency !== 'EUR' ? (livePrice / liveRateDivisor) : livePrice;
      return formData.type === 'Compra'
        ? (liveQty * priceInTxCurrency) + liveFee
        : formData.type === 'Venta'
        ? (liveQty * priceInTxCurrency) - liveFee
        : (liveQty * priceInTxCurrency);
    } else {
      return formData.type === 'Compra'
        ? (liveQty * livePrice) + liveFee
        : formData.type === 'Venta'
        ? (liveQty * livePrice) - liveFee
        : (liveQty * livePrice);
    }
  }, [cleanTxCurrency, cleanAssetCurrency, livePrice, liveRateDivisor, formData.type, liveQty, liveFee]);

  // Total in EUR
  const liveTotalEUR = useMemo(() => cleanTxCurrency === 'EUR' ? liveTotalAmt : (liveTotalAmt / liveRateDivisor), [cleanTxCurrency, liveTotalAmt, liveRateDivisor]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.assetId || !formData.brokerId) {
      alert('Debe seleccionar un activo y un broker.');
      return;
    }

    try {
      const assetCurrency = (selectedAsset?.currency || 'EUR').substring(0, 3).toUpperCase();
      const txCurrency = (formData.currency || 'EUR').substring(0, 3).toUpperCase();

      const qty = parseFloat(formData.quantity) || 0;
      const prc = parseFloat(formData.price) || 0;
      const feeVal = parseFloat(formData.fee) || 0;
      const rate = parseFloat(formData.exchangeRate) || 1.0;
      const rateDivisor = (rate && rate > 0) ? rate : 1.0;

      // Price in EUR
      const priceEUR = assetCurrency !== 'EUR' ? (prc / rateDivisor) : prc;

      // Total in transaction currency (broker currency)
      let totalAmt = 0;
      if (txCurrency === 'EUR') {
        const priceInTxCurrency = assetCurrency !== 'EUR' ? (prc / rateDivisor) : prc;
        totalAmt = formData.type === 'Compra'
          ? (qty * priceInTxCurrency) + feeVal
          : formData.type === 'Venta'
          ? (qty * priceInTxCurrency) - feeVal
          : (qty * priceInTxCurrency);
      } else {
        totalAmt = formData.type === 'Compra'
          ? (qty * prc) + feeVal
          : formData.type === 'Venta'
          ? (qty * prc) - feeVal
          : (qty * prc);
      }

      // Total in EUR
      const totalAmountEUR = txCurrency === 'EUR' ? totalAmt : (totalAmt / rateDivisor);

      const cleanData = {
        ...formData,
        selectedDivisaAssetId: selectedDivisaAssetId || '',
        assetName: selectedAsset?.name || formData.assetId,
        brokerName: selectedBroker?.name || formData.brokerId,
        quantity: qty,
        price: prc,
        fee: feeVal,
        exchangeRate: rate,
        totalAmount: totalAmt,
        priceEUR: priceEUR,
        totalAmountEUR: totalAmountEUR,
        userId: userId,
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'rv_transactions', formData.id), cleanData);
      onClose();
    } catch (error) {
      console.error('Error saving transaction:', error);
      alert('Error al guardar la transacción: ' + error.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/35 backdrop-blur-xs flex items-center justify-center z-[200]">
      <Window
        title={isEditing ? `Modificar Transacción: ${formData.id}` : 'Nueva Transacción de Renta Variable'}
        onClose={onClose}
        width="550px"
        height="auto"
        initialPos={{ x: (window.innerWidth - 550) / 2, y: 100 }}
      >
        <form onSubmit={handleSave} className="p-4 space-y-3 bg-white">
          <div className="win-form-row">
            <label className="win-form-label">ID Transacción:</label>
            <input
              type="text"
              value={formData.id}
              onChange={(e) => setFormData({ ...formData, id: e.target.value })}
              placeholder="ej. TX001"
              disabled={isEditing}
              required
              className="win-input flex-1 uppercase font-mono"
            />
          </div>

          <div className="win-form-row">
            <label className="win-form-label">Activo (Ticker):</label>
            <select
              value={formData.assetId}
              onChange={(e) => {
                const selected = assets.find(a => a.id === e.target.value);
                setFormData({ 
                  ...formData, 
                  assetId: e.target.value,
                  currency: selected?.currency || 'EUR'
                });
              }}
              required
              className="win-input flex-1"
            >
              <option value="" disabled>-- Seleccione un Activo --</option>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.id} - {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="win-form-row">
            <label className="win-form-label">Broker:</label>
            <select
              value={formData.brokerId}
              onChange={(e) => setFormData({ ...formData, brokerId: e.target.value })}
              required
              className="win-input flex-1"
            >
              <option value="" disabled>-- Seleccione un Broker --</option>
              {brokers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.id})
                </option>
              ))}
            </select>
          </div>

          <div className="win-form-row">
            <label className="win-form-label">Tipo Operación:</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              required
              className="win-input flex-1"
            >
              <option value="Compra">Compra</option>
              <option value="Venta">Venta</option>
              <option value="Dividendo">Dividendo</option>
            </select>
          </div>

          <div className="win-form-row">
            <label className="win-form-label">Fecha:</label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              required
              className="win-input flex-1"
            />
          </div>

          <div className="win-form-row">
            <label className="win-form-label">Cantidad (Títulos):</label>
            <input
              type="number"
              step="0.000001"
              value={formData.quantity}
              onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
              placeholder="ej. 10"
              required
              className="win-input flex-1"
            />
          </div>

          <div className="win-form-row">
            <label className="win-form-label">
              {formData.type === 'Dividendo' ? 'Importe bruto por Título:' : 'Precio Unitario:'}
            </label>
            <input
              type="number"
              step="0.0001"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: e.target.value })}
              placeholder="ej. 150.25"
              required
              className="win-input flex-1"
            />
          </div>

          <div className="win-form-row">
            <label className="win-form-label">Comisiones:</label>
            <input
              type="number"
              step="0.01"
              value={formData.fee}
              onChange={(e) => setFormData({ ...formData, fee: e.target.value })}
              placeholder="0"
              required
              className="win-input flex-1"
            />
          </div>

          <div className="win-form-row">
            <label className="win-form-label">Activo Divisa (Cambio):</label>
            <select
              value={selectedDivisaAssetId}
              onChange={(e) => setSelectedDivisaAssetId(e.target.value)}
              className="win-input flex-1 min-w-0"
            >
              <option value="">-- No usar activo divisa --</option>
              {assets.filter(a => a.type === 'Divisa').map((a) => (
                <option key={a.id} value={a.id}>
                  {a.id} - {a.name} ({a.currency})
                </option>
              ))}
            </select>
          </div>

          {selectedDivisaAssetId && (
            <div className="text-[10px] pl-[120px] -mt-1 font-sans mb-2">
              {rateStatus === 'loading' && <span className="text-amber-600">Buscando cotización en el histórico...</span>}
              {rateStatus === 'found' && <span className="text-green-600 font-bold">✓ Cotización encontrada y aplicada.</span>}
              {rateStatus === 'not_found' && <span className="text-rose-600 font-bold">✗ Sin cotización en el histórico para esta fecha.</span>}
            </div>
          )}

          <div className="win-form-row">
            <label className="win-form-label">Tipo Cambio (USD/EUR...):</label>
            <input
              type="number"
              step="0.0001"
              value={formData.exchangeRate}
              onChange={(e) => setFormData({ ...formData, exchangeRate: e.target.value })}
              placeholder="1,0"
              required
              className="win-input flex-1"
            />
          </div>

          <div className="win-form-row">
            <label className="win-form-label">Divisa:</label>
            <input
              type="text"
              value={formData.currency}
              readOnly
              disabled
              className="win-input flex-1 bg-slate-100 font-bold text-slate-800"
            />
          </div>

          {/* Resumen e Importes Calculados */}
          <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-md space-y-2">
            <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200 pb-1 flex justify-between items-center">
              <span>Resumen de Importes Calculados</span>
              {(cleanAssetCurrency !== 'EUR' || cleanTxCurrency !== 'EUR') && (
                <span className="px-1.5 py-0.5 text-[9px] bg-blue-100 text-blue-800 border border-blue-200 rounded font-semibold">
                  Cambio Aplicado
                </span>
              )}
            </h4>
            
            <div className="grid grid-cols-2 gap-4 text-[11px]">
              <div>
                <span className="text-slate-500 block">Total Transacción ({cleanAssetCurrency}):</span>
                <span className="font-mono font-bold text-slate-800 text-sm">
                  {liveTotalAssetVal.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {cleanAssetCurrency}
                </span>
              </div>
              <div>
                <span className="text-blue-600 font-bold block">Total (EUR Equivalente):</span>
                <span className="font-mono font-bold text-blue-900 text-sm">
                  {liveTotalEUR.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-[11px] pt-1.5 border-t border-slate-200/60">
              <div>
                <span className="text-slate-500 block">Precio Activo ({cleanAssetCurrency}):</span>
                <span className="font-mono text-slate-800 font-semibold">
                  {livePrice.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} {cleanAssetCurrency}
                </span>
              </div>
              <div>
                <span className="text-blue-600 font-bold block">Precio Equivalente (EUR):</span>
                <span className="font-mono text-blue-950 font-bold">
                  {livePriceEUR.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €
                </span>
              </div>
            </div>

            {(cleanAssetCurrency !== 'EUR' || cleanTxCurrency !== 'EUR') && (
              <div className="text-[10px] text-slate-500 italic pt-1 flex justify-between items-center border-t border-slate-100/60">
                <span>Divisa Activo: <b>{cleanAssetCurrency}</b> | Divisa Broker: <b>{cleanTxCurrency}</b></span>
                <span>1 EUR = {liveRate.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} {cleanAssetCurrency}</span>
              </div>
            )}
          </div>

          <div className="win-form-row items-start">
            <label className="win-form-label pt-1.5">Notas:</label>
            <textarea
              value={formData.notes || ''}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Notas descriptivas..."
              rows={2}
              className="win-input flex-1 font-sans resize-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-2 pt-3 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold border border-slate-300 rounded cursor-pointer transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-[#4F46E5] hover:bg-[#4338CA] text-white text-[11px] font-bold rounded cursor-pointer transition-colors flex items-center space-x-1"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Guardar</span>
            </button>
          </div>
        </form>
      </Window>
    </div>
  );
}
