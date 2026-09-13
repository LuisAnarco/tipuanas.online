// firebase-config.js - Conexão em Tempo Real
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Banco de dados compartilhado em tempo real para o ecossistema
const firebaseConfig = {
  apiKey: "AIzaSyDemoKeyTipuanas2026",
  authDomain: "tipuanas-delivery.firebaseapp.com",
  projectId: "tipuanas-delivery",
  storageBucket: "tipuanas-delivery.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:demo"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export { collection, addDoc, onSnapshot, doc, updateDoc, query, orderBy };