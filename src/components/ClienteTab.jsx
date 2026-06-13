import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { User } from 'lucide-react';

export default function ClienteTab({ formData, user, queryUserIds }) {
  const [associatedClients, setAssociatedClients] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user || !user.uid) return;
    const q = query(collection(db, 'customers'), where('userId', 'in', queryUserIds?.length > 0 ? queryUserIds : [user.uid]));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const clientsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      const propKeyName = formData.name;
      const propKeyAddress = formData.address;

      const filtered = clientsData.filter(c => {
        const floors = Array.isArray(c.floors) ? c.floors : (c.floor ? c.floor.split(', ') : []);
        return floors.includes(propKeyName) || floors.includes(propKeyAddress);
      });

      setAssociatedClients(filtered);
    }, (error) => {
      console.error("Error fetching customers for property:", error);
    });
    return () => unsubscribe();
  }, [user, formData.name, formData.address, queryUserIds]);

  return (
    <div className="flex flex-col h-full bg-[#d4d0c8]">
      <div className="flex-1 overflow-auto p-4 flex flex-col gap-4">
        <div className="w-full flex flex-col h-full mt-2">
          <div className="flex flex-col space-y-3 h-full">
            <h3 className="text-[11px] font-bold text-[#000080] border-b border-[#000080] pb-1 uppercase flex items-center">
              <User className="w-4 h-4 mr-1" />
              Clientes Asociados
            </h3>
            <div className="bg-white border border-[#808080] shadow-[1px_1px_0px_#000] p-1 flex-1 overflow-auto">
              <table className="clean-table w-full">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Nombre</th>
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
                    associatedClients.map((client) => (
                      <tr 
                        key={client.id}
                        className="cursor-pointer hover:bg-slate-100"
                        onClick={() => navigate(`/customers?editName=${encodeURIComponent(client.name)}`)}
                        title="Clic para abrir la ficha del cliente"
                      >
                        <td className="text-[11px]">{client.id}</td>
                        <td className="text-[11px] font-bold text-blue-600 hover:underline">{client.name}</td>
                        <td className="text-[11px]">{client.dni}</td>
                        <td className="text-[11px]">{client.phone}</td>
                        <td className={`text-[11px] font-bold ${(!client.status || client.status === 'activo') ? 'text-green-600' : 'text-red-600'}`}>
                          {(!client.status || client.status === 'activo') ? 'ACTIVO' : 'INACTIVO'}
                        </td>
                      </tr>
                    ))
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
