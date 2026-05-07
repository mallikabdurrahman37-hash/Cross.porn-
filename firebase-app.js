/**
 * firebase-app.js
 * Firebase initialization + exported references.
 * Replace [PASTE_YOUR_FIREBASE_CONFIG_HERE] with your real config object.
 */

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAiEg_1Mc-055L7gf4bKxAquZDc5TsuU7s",
  authDomain: "crossporn.firebaseapp.com",
  projectId: "crossporn",
  storageBucket: "crossporn.firebasestorage.app",
  messagingSenderId: "216735942885",
  appId: "1:216735942885:web:38387741c65f26e065ac0c",
  measurementId: "G-6RVT2VT2XR"
};
firebase.initializeApp(firebaseConfig);

/** @type {firebase.auth.Auth} */
const auth = firebase.auth();

/** @type {firebase.firestore.Firestore} */
const db = firebase.firestore();

/** Firestore field value helper */
const FieldValue = firebase.firestore.FieldValue;
