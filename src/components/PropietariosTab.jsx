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
    <div className="flex flex-col h-full bg-[#d4d0c8]">
      <div className="flex-1 overflow-auto p-4 flex flex-col gap-4">
        
        {/* Top Section: Asignación de Propietarios */}
        <div className="w-full flex flex-col gap-4">
          <div className="flex flex-col space-y-3">
            <h3 className="text-[11px] font-bold text-[#000080] border-b border-[#000080] pb-1 uppercase flex items-center">
              <Users className="w-4 h-4 mr-1" />
              Asignación de Propietarios
            </h3>
            
            {/* Formulario para añadir */}
            <div className="bg-[#f0f0f0] p-2 border border-[#808080] flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <label className="text-[10px] font-bold text-slate-700 uppercase">Seleccionar Socio / Propietario</label>
                <select 
                  className="win-input w-full"
                  value={selectedPartnerId}
                  onChange={(e) => setSelectedPartnerId(e.target.value)}
                >
                  <option value="">-- Seleccionar --</option>
                  {availablePartners.map(p => {
                    const name = p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.companyName || 'Sin Nombre';
                    return <option key={p.id} value={p.id}>{name} {p.dni || p.nif || p.cif ? `(${p.dni || p.nif || p.cif})` : ''}</option>;
                  })}
                </select>
              </div>
              <div className="w-24 space-y-1">
                <label className="text-[10px] font-bold text-slate-700 uppercase">% Participación</label>
                <input 
                  type="number" 
                  className="win-input w-full text-right" 
                  value={percentage}
                  onChange={(e) => setPercentage(e.target.value)}
                  placeholder="0"
                />
              </div>
              <button 
                onClick={handleAddOwner}
                className="btn-classic px-4 py-1 h-[22px] flex items-center shrink-0 text-[11px] font-bold"
              >
                <Plus className="w-3 h-3 mr-1" /> Añadir
              </button>
            </div>

            {/* Tabla de propietarios asignados */}
            <div className="bg-white border border-[#808080] shadow-[1px_1px_0px_#000] p-1">
              <table className="clean-table w-full">
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
                        <td className="p-0 w-24">
                          <input 
                            type="number"
                            value={owner.percentage || ''}
                            onChange={(e) => updateOwnerPercentage(idx, e.target.value)}
                            className="win-input w-full bg-transparent border-transparent hover:border-gray-300 focus:bg-white text-[11px] text-right px-1 m-0 h-[22px] font-bold text-[#000080]"
                          />
                        </td>
                        <td className="text-center">
                          <button 
                            onClick={() => removeOwner(idx)}
                            className="text-red-500 hover:text-red-700"
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
              <div className={`p-2 flex justify-end items-center text-[11px] font-bold ${totalPercentage !== 100 && owners.length > 0 ? 'text-red-600 bg-red-50' : 'text-slate-700 bg-slate-50'}`}>
                {totalPercentage !== 100 && owners.length > 0 && (
                  <AlertCircle className="w-3.5 h-3.5 mr-1" />
                )}
                TOTAL PARTICIPACIÓN: {totalPercentage.toFixed(2)} %
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Section: Tabla de Métricas */}
        <div className="w-full flex flex-col h-full min-h-[250px] mt-2">
          <div className="flex flex-col space-y-3 h-full">
            <h3 className="text-[11px] font-bold text-[#000080] border-b border-[#000080] pb-1 uppercase flex items-center">
              <BarChart2 className="w-4 h-4 mr-1" />
              Métricas por Propietario
            </h3>
            <div className="bg-white border border-[#808080] shadow-[1px_1px_0px_#000] p-1 flex-1 overflow-auto">
              <table className="clean-table w-full">
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
                        <td className="text-right text-[11px] text-[#000080] font-bold">{owner.percentage}%</td>
                        <td className="text-right text-[11px] italic text-slate-400">{(totalCapitalAndExpenses * (owner.percentage / 100)).toFixed(2)} €</td>
                        <td className="text-right text-[11px] italic text-slate-400">{(theoreticalSalePrice * (owner.percentage / 100)).toFixed(2)} €</td>
                        <td className={`text-right text-[11px] font-bold ${neto >= 0 ? 'text-green-600' : 'text-red-600'}`}>{(neto * (owner.percentage / 100)).toFixed(2)} €</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  {owners.length > 0 && (
                    <tr className="bg-slate-50 font-bold border-t-2 border-[#808080]">
                      <td className="text-[11px] text-[#000080] uppercase">TOTALES</td>
                      <td className="text-right text-[11px] text-[#000080]">{totalPercentage.toFixed(2)}%</td>
                      <td className="text-right text-[11px] text-[#000080]">{(totalCapitalAndExpenses * (totalPercentage / 100)).toFixed(2)} €</td>
                      <td className="text-right text-[11px] text-[#000080]">{(theoreticalSalePrice * (totalPercentage / 100)).toFixed(2)} €</td>
                      <td className={`text-right text-[11px] ${neto >= 0 ? 'text-green-600' : 'text-red-600'}`}>{(neto * (totalPercentage / 100)).toFixed(2)} €</td>
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
