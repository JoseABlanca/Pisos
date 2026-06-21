import { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut, 
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  confirmPasswordReset
} from 'firebase/auth';
import { auth, db } from '../firebase/config';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [queryUserIds, setQueryUserIds] = useState([]);

  const [userPreferences, setUserPreferences] = useState({});

  useEffect(() => {
    let unsubscribeDoc = null;
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setQueryUserIds([currentUser.uid]); // Default immediately
        unsubscribeDoc = onSnapshot(doc(db, 'users', currentUser.uid), (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.linkedAccounts?.length > 0) {
              setQueryUserIds([currentUser.uid, ...data.linkedAccounts]);
            } else {
              setQueryUserIds([currentUser.uid]);
            }
            setUserPreferences(data.preferences || {});
          } else {
            setQueryUserIds([currentUser.uid]);
            setUserPreferences({});
          }
        });
      } else {
        setQueryUserIds([]);
        setUserPreferences({});
        if (unsubscribeDoc) {
          unsubscribeDoc();
          unsubscribeDoc = null;
        }
      }
      setLoading(false);
    });
    return () => {
      unsubscribe();
      if (unsubscribeDoc) unsubscribeDoc();
    };
  }, []);

  const login = (email, password) => signInWithEmailAndPassword(auth, email, password);
  const signup = (email, password) => createUserWithEmailAndPassword(auth, email, password);
  const logout = () => signOut(auth);
  
  const googleLogin = () => {
    const provider = new GoogleAuthProvider();
    return signInWithPopup(auth, provider);
  };

  const resetPassword = (email, settings) => sendPasswordResetEmail(auth, email, settings);
  const confirmReset = (oobCode, newPassword) => confirmPasswordReset(auth, oobCode, newPassword);

  const updatePreferences = async (newPrefs) => {
    if (!user) return;
    try {
      const userRef = doc(db, 'users', user.uid);
      // Actualizamos sólo los preferences sin borrar el resto
      // Usamos setDoc con merge por si el doc no existe
      await setDoc(userRef, { preferences: newPrefs }, { merge: true });
    } catch (e) {
      console.error("Error updating preferences:", e);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      queryUserIds, 
      userPreferences, 
      updatePreferences, 
      login, 
      signup, 
      logout, 
      googleLogin, 
      resetPassword, 
      confirmReset, 
      loading 
    }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
