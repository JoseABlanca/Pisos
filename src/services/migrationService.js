import { db } from '../firebase/config';
import { collection, doc, setDoc, getDocs, query, where, writeBatch } from 'firebase/firestore';

export const migrateLocalData = async (userId) => {
  const result = {
    properties: 0,
    partners: 0,
    customers: 0,
    rentals: 0,
    errors: []
  };

  const collections = [
    { key: 'app_properties', coll: 'properties' },
    { key: 'app_partners', coll: 'partners' },
    { key: 'app_customers', coll: 'customers' },
    { key: 'app_rentals', coll: 'rentals' }
  ];

  for (const item of collections) {
    try {
      const localData = localStorage.getItem(item.key);
      if (!localData) continue;

      const data = JSON.parse(localData);
      if (!Array.isArray(data) || data.length === 0) continue;

      // Check if data already exists in Firestore to avoid duplicates
      const q = query(collection(db, item.coll), where('userId', '==', userId));
      const snapshot = await getDocs(q);
      
      // If there's already data in cloud, we might want to ask or merge.
      // For now, we'll only migrate if cloud is empty or we'll add missing ones.
      const cloudIds = new Set(snapshot.docs.map(doc => doc.data().id));

      const batch = writeBatch(db);
      let count = 0;

      for (const entry of data) {
        if (!cloudIds.has(entry.id)) {
          const newDocRef = doc(collection(db, item.coll));
          batch.set(newDocRef, {
            ...entry,
            userId,
            updatedAt: new Date().toISOString()
          });
          count++;
        }
      }

      if (count > 0) {
        await batch.commit();
        result[item.coll] = count;
      }
    } catch (error) {
      console.error(`Error migrating ${item.key}:`, error);
      result.errors.push(`${item.key}: ${error.message}`);
    }
  }

  return result;
};
