import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

export default function ClienteTab({ formData, user, queryUserIds }) {
  const [associatedClients, setAssociatedClients] = useState([]);
  const [rentals, setRentals] = useState([]);
  const navigate = useNavigate();

  // Subscribe to rentals
  useEffect(() => {
    if (!user || !user.uid) return;
    const userIds = queryUserIds?.length > 0 ? queryUserIds : [user.uid];
    const qRentals = query(collection(db, 'rentals'), where('userId', 'in', userIds));
    const unsubscribe = onSnapshot(qRentals, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ 
        docId: doc.id, 
        id: doc.data().id || doc.id, 
        _originalId: doc.data().id,
        ...doc.data() 
      }));
      setRentals(data);
    }, (error) => {
      console.error("Error fetching rentals in ClienteTab:", error);
    });
    return () => unsubscribe();
  }, [user, queryUserIds]);

  // Subscribe to customers
  useEffect(() => {
    if (!user || !user.uid) return;
    const userIds = queryUserIds?.length > 0 ? queryUserIds : [user.uid];
    const q = query(collection(db, 'customers'), where('userId', 'in', userIds));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const clientsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      const propKeyName = formData?.name;
      const propKeyAddress = formData?.address;
      const propId = formData?.id;

      const filtered = clientsData.filter(c => {
        const floors = Array.isArray(c.floors) ? c.floors : (c.floor ? c.floor.split(', ') : []);
        const matchesFloor = (propKeyName && floors.includes(propKeyName)) || (propKeyAddress && floors.includes(propKeyAddress));
        if (matchesFloor) return true;

        // Also check if customer is linked through rentals of this property
        return rentals.some(r => {
          const isThisProp = 
            (propId && r.propertyId === propId) ||
            (propKeyName && (r.propertyId === propKeyName || r.propertyName === propKeyName)) ||
            (propKeyAddress && r.propertyId === propKeyAddress);
          if (!isThisProp) return false;
          return r.tenantId === c.id ||
            (Array.isArray(r.tenantIds) && r.tenantIds.includes(c.id)) ||
            (Array.isArray(r.tenants) && r.tenants.some(t => t.id === c.id || (t.name && t.name.toLowerCase() === c.name?.toLowerCase()))) ||
            (Array.isArray(r.rooms) && r.rooms.some(rm => rm.tenantId === c.id));
        });
      });

      setAssociatedClients(filtered);
    }, (error) => {
      console.error("Error fetching customers for property:", error);
    });
    return () => unsubscribe();
  }, [user, formData?.name, formData?.address, formData?.id, queryUserIds, rentals]);

  const getRentalForClient = (client) => {
    if (!rentals || rentals.length === 0) return null;

    const propId = formData?.id;
    const propName = formData?.name;
    const propAddress = formData?.address;

    // Filter rentals for this property
    const propRentals = rentals.filter(r => 
      (propId && r.propertyId === propId) || 
      (propName && (r.propertyId === propName || r.propertyName === propName)) || 
      (propAddress && r.propertyId === propAddress)
    );

    // 1. Direct match with client in property rentals
    let match = propRentals.find(r => {
      if (r.tenantId === client.id) return true;
      if (Array.isArray(r.tenantIds) && r.tenantIds.includes(client.id)) return true;
      if (Array.isArray(r.tenants) && r.tenants.some(t => t.id === client.id || (t.name && t.name.toLowerCase() === client.name?.toLowerCase()))) return true;
      if (Array.isArray(r.rooms) && r.rooms.some(rm => rm.tenantId === client.id)) return true;
      return false;
    });

    if (match) return match;

    // 2. If only 1 rental belongs to this property
    if (propRentals.length === 1) return propRentals[0];

    // 3. Fallback: search anywhere in rentals by client
    const anyRental = rentals.find(r => {
      if (r.tenantId === client.id) return true;
      if (Array.isArray(r.tenantIds) && r.tenantIds.includes(client.id)) return true;
      if (Array.isArray(r.tenants) && r.tenants.some(t => t.id === client.id || (t.name && t.name.toLowerCase() === client.name?.toLowerCase()))) return true;
      if (Array.isArray(r.rooms) && r.rooms.some(rm => rm.tenantId === client.id)) return true;
      return false;
    });

    return anyRental || null;
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex-1 overflow-auto p-4 flex flex-col gap-4">
        <div className="w-full flex flex-col h-full mt-2">
          <div className="flex flex-col space-y-3 h-full">
            <h3 className="text-[12px] font-bold text-slate-800 uppercase italic">
              Clientes Asociados
            </h3>
            <div className="bg-white flex-1 overflow-auto">
              <table className="modern-table w-full">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Alquiler</th>
                    <th>DNI / NIF</th>
                    <th>Teléfono</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {associatedClients.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="text-center text-slate-500 py-4 italic text-[11px]">
                        No hay clientes asociados a este activo
                      </td>
                    </tr>
                  ) : (
                    associatedClients.map((client) => {
                      const rental = getRentalForClient(client);
                      return (
                        <tr 
                          key={client.id}
                          className="cursor-pointer hover:bg-slate-100"
                          onClick={() => navigate(`/customers?editName=${encodeURIComponent(client.name)}`)}
                          title="Clic para abrir la ficha del cliente"
                        >
                          <td className="text-[11px]">
                            <span 
                              className="font-bold underline text-[#4560a9] hover:text-blue-800 cursor-pointer" 
                              style={{ color: '#4560a9' }}
                            >
                              {client.name}
                            </span>
                          </td>
                          <td className="text-[11px]">
                            {rental ? (
                              <a
                                href={`/rentals?editId=${encodeURIComponent(rental.docId || rental.id || rental.reference)}`}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  navigate(`/rentals?editId=${encodeURIComponent(rental.docId || rental.id || rental.reference)}`);
                                }}
                                className="font-bold underline text-[#4560a9] hover:text-blue-800 cursor-pointer"
                                style={{ color: '#4560a9' }}
                                title="Abrir ventana de editar alquiler"
                              >
                                {rental.reference || rental.id || 'Ver alquiler'}
                              </a>
                            ) : (
                              <span className="text-slate-400 italic">---</span>
                            )}
                          </td>
                          <td className="text-[11px] text-black">{client.dni || '---'}</td>
                          <td className="text-[11px] text-black">{client.phone || '---'}</td>
                          <td className="text-[11px] text-black">
                            {(!client.status || client.status === 'activo') ? 'ACTIVO' : 'INACTIVO'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
