import { initializeApp } from "firebase/app";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
} from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your environment-configured Firebase setup
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Set auth persistence to LOCAL (survives browser restarts)
setPersistence(auth, browserLocalPersistence)
  .then(() => {
    console.log("Firebase Auth persistence set to LOCAL");
  })
  .catch((error) => {
    console.error("Error setting auth persistence:", error);
  });

// ✅ Initialize Firestore with modern persistent settings
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

// Initialize Storage
const storage = getStorage(app);

// Set up auth state listener to track auth state changes and save profile picture
onAuthStateChanged(auth, (user) => {
  if (user) {
    console.log("Auth state changed: User is signed in:", user.uid);

    // If user has a photoURL, save it to localStorage for persistence
    if (user.photoURL) {
      try {
        const storageData = JSON.stringify({
          photoURL: user.photoURL,
          userId: user.uid,
          timestamp: Date.now(),
        });
        localStorage.setItem("todoapp_profile_picture", storageData);
        sessionStorage.setItem("todoapp_profile_picture_session", storageData);
        console.log(
          "Auth state change: Saved profile picture to browser storage"
        );
      } catch (error) {
        console.error(
          "Error saving profile picture on auth state change:",
          error
        );
      }
    } else {
      console.log("Auth state change: User has no photoURL");

      // Try to restore from localStorage if available
      try {
        const storageData = localStorage.getItem("todoapp_profile_picture");
        if (storageData) {
          const parsedData = JSON.parse(storageData);
          if (parsedData.userId === user.uid && parsedData.photoURL) {
            console.log(
              "Auth state change: Found profile picture in localStorage, will restore it"
            );
          }
        }
      } catch (error) {
        console.error(
          "Error checking localStorage on auth state change:",
          error
        );
      }
    }
  } else {
    console.log("Auth state changed: User is signed out");
  }
});

export { auth, db, storage };
