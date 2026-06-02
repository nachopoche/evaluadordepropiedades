// Configuración de Firebase para el Evaluador de Propiedades
// Las apiKey de Firebase para web son públicas por diseño — la seguridad real
// se controla con las Security Rules de Firestore (las configuramos después).

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: "AIzaSyATCBXlbvm1jwGJgNL9i5ocrVAFTXjgKEM",
  authDomain: "evaluador-de-propiedades.firebaseapp.com",
  projectId: "evaluador-de-propiedades",
  storageBucket: "evaluador-de-propiedades.firebasestorage.app",
  messagingSenderId: "936183624479",
  appId: "1:936183624479:web:42c737ace06bc3e778b62a"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);
