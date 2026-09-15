// firebase-config.js - NÃO É MAIS USADO.
// O sistema todo (vitrine, checkout, painel do lojista, entregador e admin) roda em cima
// do Supabase (veja 05_merchant_order_management.js / 09_multistore_cart.js). Este arquivo
// ficou órfão depois que entregador.html foi migrado de Firebase para Supabase.
// Pode ser removido do repositório com segurança.
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