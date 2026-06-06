import { db } from '../firebase/config';
import { collection, addDoc } from 'firebase/firestore';

export const seedBaseAccounts = async (userId) => {
  const accounts = [
    { code: '101', name: 'Banco BBVA', type: 'Activo', saldo_actual: 0 },
    { code: '201', name: 'Cuenta por Pagar', type: 'Pasivo', saldo_actual: 0 },
    { code: '401', name: 'Ventas de Productos', type: 'Ingreso', saldo_actual: 0 },
    { code: '601', name: 'Capacitación Personal', type: 'Gasto', saldo_actual: 0 },
  ];

  try {
    for (const acc of accounts) {
      await addDoc(collection(db, 'accounts'), {
        ...acc,
        userId
      });
    }
    return { success: true };
  } catch (error) {
    console.error("Error seeding accounts:", error);
    throw error;
  }
};
