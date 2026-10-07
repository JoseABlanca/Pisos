import React, { useState, useEffect, useMemo } from 'react';
import { Users, Plus, Trash2, BarChart2, AlertCircle } from 'lucide-react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

export default function PropietariosTab({ formData, setFormData, user, queryUserIds }) {
  const [availablePartners, setAvailablePartners] = useState([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  const [percentage, setPercentage] = useState('');

  // Ensure owners array exists safely
  const owners = Array.isArray(formData.owners) ? formData.owners : [];

  useEffect(() => {
    if (!user || !user.uid) return;
    const q = query(collection(db, 'partners'), where('userId', 'in', queryUserIds?.length > 0 ? queryUserIds : [user.uid]));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const p = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAvailablePartners(p);
    }, (error) => {
      console.error("Error fetching partners:", error);
    });
    return () => unsubscribe();
  }, [user]);

  const handleAddOwner = () => {
    if (!selectedPartnerId || !percentage) {
      alert("Por favor, selecciona un propietario y un porcentaje.");
      return;
    }
    
    // Check if already added
    if (owners.find(o => o.partnerId === selectedPartnerId)) {
      alert("Este propietario ya está añadido a la lista.");
      return;
    }

    const partner = availablePartners.find(p => p.id === selectedPartnerId);
    if (!partner) return;
    
    const newOwner = {
      partnerId: partner.id,
      name: partner.name || `${partner.firstName || ''} ${partner.lastName || ''}`.trim() || partner.companyName || 'Sin Nombre',
      nif: partner.dni || partner.nif || partner.cif || '',
      percentage: parseFloat(percentage),
    };

    setFormData(prev => ({
      ...prev,
      owners: [...(prev.owners || []), newOwner]
    }));

    setSelectedPartnerId('');
    setPercentage('');
  };

  const removeOwner = (idx) => {
    setFormData(prev => {
      const newOwners = [...(prev.owners || [])];
      newOwners.splice(idx, 1);
      return { ...prev, owners: newOwners };
    });
  };

  const updateOwnerPercentage = (idx, newPercentage) => {
    setFormData(prev => {
      const newOwners = [...(prev.owners || [])];
      newOwners[idx] = { ...newOwners[idx], percentage: parseFloat(newPercentage) || 0 };
      return { ...prev, owners: newOwners };
    });
  };

  const totalPercentage = useMemo(() => {
    return owners.reduce((acc, curr) => acc + (parseFloat(curr.percentage) || 0), 0);
  }, [owners]);

  // Financial calculations
  const { totalCapitalAndExpenses, theoreticalSalePrice, neto } = useMemo(() => {
    const adquisitionExpenses = Array.isArray(formData.adquisitionExpenses) ? formData.adquisitionExpenses : [];
    const totalExpenses = adquisitionExpenses.reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0);
    const investedCapital = parseFloat(formData.investedCapital) || 0;
    const salePrice = parseFloat(formData.theoreticalSalePrice) || 0;
    
    return {
      totalCapitalAndExpenses: investedCapital + totalExpenses,
      theoreticalSalePrice: salePrice,
      neto: salePrice - (investedCapital + totalExpenses)
    };
  }, [formData.adquisitionExpenses, formData.investedCapital, formData.theoreticalSalePrice]);

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex-1 overflow-auto p-4 flex flex-col gap-4">
        
        {/* Top Section: Asignación de Propietarios */}
        <div className="w-full flex flex-col gap-4">
          <div className="flex flex-col space-y-3">
            <div className="flex justify-between items-end mb-2">
              <h3 className="text-[14px] font-bold text-slate-800 italic uppercase">
                Asignación de Propietarios
              </h3>
            </div>
            
            {/* Formulario para añadir */}
            <div className="flex items-end gap-2 mb-2">
              <div className="flex-1">
                <select 
                  className="w-full border border-gray-400 px-2 py-1 text-[11px] focus:outline-none focus:border-blue-500 bg-white"
                  value={selectedPartnerId}
                  onChange={(e) => setSelectedPartnerId(e.target.value)}
                >
                  <option value="">-- Seleccionar Propietario --</option>
                  {availablePartners.map(p => {
                    const name = p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.companyName || 'Sin Nombre';
                    return <option key={p.id} value={p.id}>{name} {p.dni || p.nif || p.cif ? `(${p.dni || p.nif || p.cif})` : ''}</option>;
                  })}
                </select>
              </div>
              <div className="w-24">
                <input 
                  type="number" 
                  className="w-full border border-gray-400 px-2 py-1 text-[11px] text-right focus:outline-none focus:border-blue-500 bg-white"
                  value={percentage}
                  onChange={(e) => setPercentage(e.target.value)}
                  placeholder="% Participación"
                />
              </div>
              <button 
                onClick={handleAddOwner}
                className="border border-gray-400 bg-gray-200 hover:bg-gray-300 px-4 py-1 h-[26px] text-[11px] font-bold flex items-center text-slate-800 shrink-0 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Añadir
              </button>
            </div>

            {/* Tabla de propietarios asignados */}
            <div className="bg-white">
              <table className="modern-table w-full">
                <thead>
                  <tr>
                    <th>Nombre del Propietario / Sociedad</th>
                    <th className="w-32 text-center">NIF/CIF</th>
                    <th className="w-24 text-right">% Propiedad</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {owners.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="text-center text-slate-500 py-4 italic text-[11px]">
                        No hay propietarios asignados a este activo
                      </td>
                    </tr>
                  ) : (
                    owners.map((owner, idx) => (
                      <tr key={owner.partnerId}>
                        <td className="font-bold text-[11px]">{owner.name}</td>
                        <td className="text-center text-[11px]">{owner.nif || '-'}</td>
                        <td className="p-2 w-24">
                          <input 
                            type="number"
                            value={owner.percentage || ''}
                            onChange={(e) => updateOwnerPercentage(idx, e.target.value)}
                            className="w-full border border-gray-400 px-2 py-1 text-[11px] text-right focus:outline-none focus:border-blue-500 font-bold text-black"
                          />
                        </td>
                        <td className="text-center">
                          <button 
                            onClick={() => removeOwner(idx)}
                            className="text-gray-500 hover:text-black transition-colors"
                            title="Eliminar propietario"
                          >
                            <Trash2 className="w-3.5 h-3.5 mx-auto" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              {/* Footer de suma */}
              <div className={`p-2 flex justify-end items-center text-[11px] font-bold bg-white text-black`}>
                TOTAL PARTICIPACIÓN: {totalPercentage.toFixed(2)} %
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Section: Tabla de Métricas */}
        <div className="w-full flex flex-col h-full min-h-[250px] mt-2">
          <div className="flex flex-col space-y-3 h-full">
            <h3 className="text-[14px] font-bold text-slate-800 italic uppercase mb-2">
              Métricas por Propietario
            </h3>
            <div className="bg-white flex-1 overflow-auto">
              <table className="modern-table w-full">
                <thead>
                  <tr>
                    <th>Propietario</th>
                    <th className="w-24 text-right">%</th>
                    <th className="w-32 text-right">Cap. + Gastos</th>
                    <th className="w-32 text-right">Precio Teór. Venta</th>
                    <th className="w-32 text-right">Neto</th>
                  </tr>
                </thead>
                <tbody>
                  {owners.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="text-center text-slate-500 py-4 italic text-[11px]">
                        Asigna propietarios arriba para visualizar métricas
                      </td>
                    </tr>
                  ) : (
                    owners.map((owner) => (
                      <tr key={`metrics-${owner.partnerId}`}>
                        <td className="font-bold text-[11px]">{owner.name}</td>
                        <td className="text-right text-[11px] text-black font-bold">{owner.percentage}%</td>
                        <td className="text-right text-[11px] text-black">{(totalCapitalAndExpenses * (owner.percentage / 100)).toFixed(2)} €</td>
                        <td className="text-right text-[11px] text-black">{(theoreticalSalePrice * (owner.percentage / 100)).toFixed(2)} €</td>
                        <td className="text-right text-[11px] text-black">{(neto * (owner.percentage / 100)).toFixed(2)} €</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  {owners.length > 0 && (
                    <tr className="bg-[#f8f8f8] font-bold border-t-2 border-gray-300">
                      <td className="text-[11px] text-black uppercase">TOTALES</td>
                      <td className="text-right text-[11px] text-black">{totalPercentage.toFixed(2)}%</td>
                      <td className="text-right text-[11px] text-black">{(totalCapitalAndExpenses * (totalPercentage / 100)).toFixed(2)} €</td>
                      <td className="text-right text-[11px] text-black">{(theoreticalSalePrice * (totalPercentage / 100)).toFixed(2)} €</td>
                      <td className="text-right text-[11px] text-black">{(neto * (totalPercentage / 100)).toFixed(2)} €</td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
