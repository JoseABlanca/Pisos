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
import { doc, onSnapshot } from 'firebase/firestore';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [queryUserIds, setQueryUserIds] = useState([]);

  useEffect(() => {
    let unsubscribeDoc = null;
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setQueryUserIds([currentUser.uid]); // Default immediately
        unsubscribeDoc = onSnapshot(doc(db, 'users', currentUser.uid), (docSnap) => {
          if (docSnap.exists() && docSnap.data().linkedAccounts?.length > 0) {
            setQueryUserIds([currentUser.uid, ...docSnap.data().linkedAccounts]);
          } else {
            setQueryUserIds([currentUser.uid]);
          }
        });
      } else {
        setQueryUserIds([]);
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

  return (
    <AuthContext.Provider value={{ user, queryUserIds, login, signup, logout, googleLogin, resetPassword, confirmReset, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
