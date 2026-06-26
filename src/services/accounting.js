import { db } from '../firebase/config';
import { 
  runTransaction, 
  doc, 
  collection, 
  query, 
  where, 
  getDocs, 
  writeBatch, 
  orderBy 
} from 'firebase/firestore';

/**
 * Utility to infer account type from code if not provided in the document.
 * Follows PGC logic: 1-Active (usually 1, 2, 3, 5), 6-Expense (6), 7-Income (7), 1-Pasivo/Neto (1, 4) etc.
 */
const inferAccountType = (code, providedType) => {
  if (providedType) return providedType;
  if (!code) return 'Pasivo';
  const first = code.toString().charAt(0);
  if (['2', '3', '4', '5'].includes(first)) return 'Activo'; 
  if (first === '6' || first === '8') return 'Gasto';
  if (first === '7' || first === '9') return 'Ingreso';
  if (first === '1') return 'Pasivo';
  return 'Pasivo';
};

/**
 * Registra un Asiento Contable y sus Transacciones validando por Partida Doble.
 */
export const registerJournalEntry = async (userId, description, entries, customDate = null, analytics = null, entryId = null, documentUrl = null, documentName = null, forcedNumber = null) => {
  try {
    let totalDebit = 0;
    let totalCredit = 0;
    
    entries.forEach(e => {
      totalDebit += parseFloat(e.debit) || 0;
      totalCredit += parseFloat(e.credit) || 0;
    });

    const diff = Math.abs(totalDebit - totalCredit);
    if (diff > 0.01 || totalDebit <= 0) {
      throw new Error(`El asiento no cuadra por partida doble. Diferencia: ${diff.toFixed(2)}`);
    }

    let journalId = '';

    await runTransaction(db, async (transaction) => {
      const accountDocs = {};
      for (const entry of entries) {
        if (!entry.accountId) continue;
        const accRef = doc(db, 'accounts', entry.accountId);
        const accSnap = await transaction.get(accRef);
        if (!accSnap.exists()) throw new Error(`La cuenta ${entry.accountId} no existe.`);
        accountDocs[entry.accountId] = { ref: accRef, data: accSnap.data() };
      }

      let nextSeq = forcedNumber;
      if (!forcedNumber) {
        const counterRef = doc(db, 'counters', `journal_${userId}`);
        const counterSnap = await transaction.get(counterRef);
        nextSeq = 1;
        if (counterSnap.exists()) {
          nextSeq = (counterSnap.data().lastValue || 0) + 1;
        }
        transaction.set(counterRef, { lastValue: nextSeq }, { merge: true });
      }

      const journalRef = entryId ? doc(db, 'journal_entries', entryId) : doc(collection(db, 'journal_entries'));
      journalId = journalRef.id;
      const date = customDate || new Date().toISOString();
      
      const journalData = {
        userId,
        number: nextSeq,
        description,
        total: totalDebit,
        date,
        lines: entries,
        createdAt: new Date().toISOString()
      };
      
      if (analytics) {
        if (analytics.cebe) journalData.cebe = analytics.cebe;
        if (analytics.ceco) journalData.ceco = analytics.ceco;
      }
      
      if (documentUrl) {
        journalData.documentUrl = documentUrl;
      }
      if (documentName) {
        journalData.documentName = documentName;
      }
      
      transaction.set(journalRef, journalData);

      for (const entry of entries) {
        if (!entry.accountId) continue;
        
        const debit = parseFloat(entry.debit) || 0;
        const credit = parseFloat(entry.credit) || 0;

        const txRef = doc(collection(db, 'transactions'));
        const txData = {
          journalId: journalRef.id,
          journalDescription: description,
          userId,
          accountId: entry.accountId,
          debit,
          credit,
          date
        };
        
        if (analytics) {
          if (analytics.cebe) txData.cebe = analytics.cebe;
          if (analytics.ceco) txData.ceco = analytics.ceco;
        }
        
        transaction.set(txRef, txData);

        const accData = accountDocs[entry.accountId].data;
        const type = inferAccountType(accData.code, accData.type);
        const isAssetOrExpense = ['Activo', 'Gasto'].includes(type);
        
        let balanceChange = isAssetOrExpense ? (debit - credit) : (credit - debit);
        let currentBalance = accData.balance_actual || 0;

        transaction.update(accountDocs[entry.accountId].ref, {
          balance_actual: Number((currentBalance + balanceChange).toFixed(2)),
          updatedAt: new Date().toISOString()
        });
      }
    });

    return { success: true, id: journalId };
  } catch (error) {
    console.error("Error al registrar asiento:", error);
    throw error;
  }
};

/**
 * Elimina un Asiento Contable y sus transacciones asociadas, revirtiendo saldos.
 */
export const deleteJournalEntry = async (userId, entryId, lines) => {
  try {
    // 1. Fetch transaction snapshots BEFORE the transaction (Queries not supported inside runTransaction directly)
    const qTx = query(collection(db, 'transactions'), where('journalId', '==', entryId));
    const txSnaps = await getDocs(qTx);
    
    await runTransaction(db, async (transaction) => {
      const journalRef = doc(db, 'journal_entries', entryId);
      
      // 2. Get Accounts to revert (Read inside transaction)
      const accountIds = [...new Set(lines.map(l => l.accountId))];
      const accountDocs = {};
      for (const id of accountIds) {
        if (!id) continue;
        const accRef = doc(db, 'accounts', id);
        const accSnap = await transaction.get(accRef);
        if (accSnap.exists()) {
          accountDocs[id] = { ref: accRef, data: accSnap.data() };
        }
      }

      // 3. Revert Balances (Write)
      for (const line of lines) {
        const id = line.accountId;
        if (!id || !accountDocs[id]) continue;
        
        const accData = accountDocs[id].data;
        // Re-use inferAccountType or similar logic
        const type = accData.type;
        const isAssetOrExpense = ['Activo', 'Gasto'].includes(type) || 
                                (accData.code && (accData.code.startsWith('2') || accData.code.startsWith('3') || accData.code.startsWith('4') || accData.code.startsWith('5') || accData.code.startsWith('6')));
        
        const movement = (parseFloat(line.debit) || 0) - (parseFloat(line.credit) || 0);
        const undoBalance = isAssetOrExpense ? -movement : movement;
        
        const currentBalance = Number(accountDocs[id].data.balance_actual) || 0;
        const newBalance = Number((currentBalance + undoBalance).toFixed(2));
        
        accountDocs[id].data.balance_actual = newBalance;
        
        transaction.update(accountDocs[id].ref, {
          balance_actual: newBalance,
          updatedAt: new Date().toISOString()
        });
      }

      // 4. Delete Head and Transactions (Write)
      txSnaps.forEach(t => transaction.delete(t.ref));
      transaction.delete(journalRef);
    });

    return { success: true };
  } catch (error) {
    console.error("Error al eliminar asiento:", error);
    throw error;
  }
};

/**
 * Actualiza un asiento existente (Revisión Completa).
 */
export const updateJournalEntry = async (userId, entryId, description, newLines, oldLines, customDate, analytics = null, documentUrl = null, documentName = null) => {
  try {
    let finalAnalytics = analytics;
    let originalNumber = null;
    
    const oldSnap = await getDocs(query(collection(db, 'journal_entries'), where('__name__', '==', entryId)));
    if (!oldSnap.empty) {
      const oldData = oldSnap.docs[0].data();
      originalNumber = oldData.number;
      if (!finalAnalytics && (oldData.cebe || oldData.ceco)) {
        finalAnalytics = { cebe: oldData.cebe, ceco: oldData.ceco };
      }
    }

    // For safety and consistency, we revert the old one and register a new one (keeping same ID preferably or header)
    // To maintain the sequential number, we pass originalNumber
    await deleteJournalEntry(userId, entryId, oldLines);
    await registerJournalEntry(userId, description, newLines, customDate, finalAnalytics, entryId, documentUrl, documentName, originalNumber);
    return { success: true };
  } catch (error) {
    console.error("Error updating entry:", error);
    throw error;
  }
};

/**
 * Utility to rebuild all account balances from actual Journal Entries.
 * Fixes any desync or rounding residue.
 */
export const recalculateAllBalances = async (userId) => {
  try {
    // 1. Reset all balances to zero
    const qAcc = query(collection(db, 'accounts'), where('userId', '==', userId));
    const accSnap = await getDocs(qAcc);
    const resetBatch = writeBatch(db);
    accSnap.forEach(d => resetBatch.update(d.ref, { balance_actual: 0 }));
    await resetBatch.commit();

    // 2. Re-apply all journal entries
    const qJournal = query(collection(db, 'journal_entries'), where('userId', '==', userId));
    const journalSnap = await getDocs(qJournal);
    
    // We update account entities
    const accounts = accSnap.docs.reduce((acc, d) => ({ ...acc, [d.id]: { ref: d.ref, data: d.data(), balance: 0 } }), {});

    journalSnap.docs.forEach(docEntry => {
      const entry = docEntry.data();
      entry.lines.forEach(line => {
        const acc = accounts[line.accountId];
        if (acc) {
          const type = inferAccountType(acc.data.code, acc.data.type);
          const isAssetOrExpense = ['Activo', 'Gasto'].includes(type);
          const movement = (parseFloat(line.debit) || 0) - (parseFloat(line.credit) || 0);
          acc.balance += isAssetOrExpense ? movement : -movement;
        }
      });
    });

    // 3. Update Firestore with new balances
    const updateBatch = writeBatch(db);
    Object.keys(accounts).forEach(id => {
      updateBatch.update(accounts[id].ref, { balance_actual: Number(accounts[id].balance.toFixed(2)) });
    });
    await updateBatch.commit();

    // 4. Rebuild Transactions collection for the Ledger
    const qOldTx = query(collection(db, 'transactions'), where('userId', '==', userId));
    const oldTxSnap = await getDocs(qOldTx);
    const deleteBatch = writeBatch(db);
    oldTxSnap.forEach(d => deleteBatch.delete(d.ref));
    await deleteBatch.commit();

    const txBatch = writeBatch(db);
    journalSnap.docs.forEach(docEntry => {
      const entry = docEntry.data();
      entry.lines.forEach(line => {
        const txRef = doc(collection(db, 'transactions'));
        txBatch.set(txRef, {
          userId,
          journalId: docEntry.id,
          journalDescription: entry.description,
          accountId: line.accountId,
          date: entry.date,
          debit: parseFloat(line.debit) || 0,
          credit: parseFloat(line.credit) || 0
        });
      });
    });
    await txBatch.commit();

    return { success: true };
  } catch (error) {
    console.error("Recalculate error:", error);
    throw error;
  }
};
