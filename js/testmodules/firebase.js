// Import the functions you need from the SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getFirestore, doc, getDoc, setDoc, updateDoc, collection, increment, arrayRemove,
    addDoc, getDocs, query, orderBy, where, deleteDoc, limit, onSnapshot, serverTimestamp, Timestamp, arrayUnion, arrayRemove, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { 
    getStorage, ref, uploadBytes, getDownloadURL 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { 
    getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, 
    signOut, onAuthStateChanged, deleteUser, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCE1b6VtJjUs0O5YvyLjeslxuHC8UlgJUM",
    authDomain: "garbagepathv2.firebaseapp.com",
    projectId: "garbagepathv2",
    storageBucket: "garbagepathv2.firebasestorage.app",
    messagingSenderId: "505856089619",
    appId: "1:505856089619:web:682f58d02be4295be4a9e6",
    measurementId: "G-SM46WXV0CN"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

console.log("Firebase Initialized!");

// Export the initialized services and SDK functions for use in other modules
export {
    // Services
    db,
    auth,
    storage,
    // Firestore Functions
    doc,
    getDoc,
    setDoc,
    updateDoc,
    collection,
    addDoc,
    getDocs,
    query,
    orderBy,
    where,
    deleteDoc,
    limit,
    onSnapshot,
    // Storage Functions
    ref,
    uploadBytes,
    getDownloadURL,
    // Auth Functions
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    deleteUser,
    serverTimestamp,
    Timestamp,
    arrayUnion,
    arrayRemove,
    runTransaction,
    sendPasswordResetEmail,
    increment,
    arrayRemove,
    arrayUnion
};
