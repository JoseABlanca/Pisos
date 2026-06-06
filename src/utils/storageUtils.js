import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase/config';

/**
 * Subir un archivo a Firebase Storage y obtener la URL de descarga permanente.
 * @param {File} file El archivo a subir
 * @param {string} userId El ID del usuario
 * @param {string} module El módulo (rentals o properties)
 * @param {string} itemId El ID del elemento (alquiler o propiedad)
 * @param {string} folder La subcarpeta (opcional, ej. 'mortgage', 'receipts')
 * @returns {Promise<string>} La URL de descarga permanente
 */
export const uploadFileToStorage = async (file, userId, module, itemId, folder = 'docs') => {
  if (!file) throw new Error('No file provided');
  if (!userId || !module || !itemId) throw new Error('Missing required upload parameters');

  const timestamp = Date.now();
  // Limpiar nombre de archivo para evitar problemas en URLs
  const cleanFileName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const path = `users/${userId}/${module}/${itemId}/${folder}/${timestamp}-${cleanFileName}`;
  
  const storageRef = ref(storage, path);
  
  try {
    const snapshot = await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);
    return downloadURL;
  } catch (error) {
    console.error('Error uploading file to storage:', error);
    throw error;
  }
};
