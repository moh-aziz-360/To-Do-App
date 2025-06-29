import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

// Constants
const USER_PREFS_STORAGE_KEY = "todoapp_user_preferences";
const USER_PREFS_COLLECTION = "userPreferences";

// Default preferences
export const DEFAULT_PREFERENCES = {
  darkMode: false,
  fontSize: "medium",
  autoSortTasks: true,
  dueDateReminders: true,
  reminderTime: "1 day before",
  sidebarExpanded: false,
  profilePanelOpen: false,
};

/**
 * Initialize user preferences in Firestore and localStorage
 * @param {string} userId - The user's ID
 * @returns {Promise<Object>} - The initialized preferences
 */
export const initializeUserPreferences = async (userId) => {
  if (!userId) {
    console.error("No userId provided to initializeUserPreferences");
    return DEFAULT_PREFERENCES;
  }

  try {
    console.log("Initializing user preferences for user:", userId);

    // Check if preferences already exist in Firestore
    const userPrefsRef = doc(db, USER_PREFS_COLLECTION, userId);
    const docSnap = await getDoc(userPrefsRef);

    // If preferences exist, return them
    if (docSnap.exists()) {
      const prefs = docSnap.data();
      console.log("Found existing preferences in Firestore:", prefs);

      // Ensure all default preferences exist
      const updatedPrefs = { ...DEFAULT_PREFERENCES, ...prefs };

      // Update the document if any default preferences were missing
      if (Object.keys(updatedPrefs).length > Object.keys(prefs).length) {
        console.log("Updating Firestore with missing default preferences");
        await updateDoc(userPrefsRef, {
          ...updatedPrefs,
          updatedAt: serverTimestamp(),
        });
      }

      // Save to localStorage for offline access
      try {
        localStorage.setItem(
          USER_PREFS_STORAGE_KEY,
          JSON.stringify({
            ...updatedPrefs,
            userId,
            timestamp: Date.now(),
          })
        );
        console.log("Saved preferences to localStorage");
      } catch (storageError) {
        console.error(
          "Error saving preferences to localStorage:",
          storageError
        );
      }

      return updatedPrefs;
    }

    // If preferences don't exist, create them with defaults
    console.log("No preferences found, creating with defaults");
    const defaultPrefsWithUser = {
      ...DEFAULT_PREFERENCES,
      userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(userPrefsRef, defaultPrefsWithUser);
      console.log("Successfully created preferences document in Firestore");
    } catch (firestoreError) {
      console.error("Error creating preferences in Firestore:", firestoreError);

      // Try again with a different approach
      try {
        console.log("Trying alternative approach to create preferences");
        await setDoc(userPrefsRef, {
          darkMode: DEFAULT_PREFERENCES.darkMode,
          fontSize: DEFAULT_PREFERENCES.fontSize,
          autoSortTasks: DEFAULT_PREFERENCES.autoSortTasks,
          dueDateReminders: DEFAULT_PREFERENCES.dueDateReminders,
          reminderTime: DEFAULT_PREFERENCES.reminderTime,
          sidebarExpanded: DEFAULT_PREFERENCES.sidebarExpanded,
          profilePanelOpen: DEFAULT_PREFERENCES.profilePanelOpen,
          userId: userId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        console.log("Alternative approach succeeded");
      } catch (retryError) {
        console.error("Alternative approach also failed:", retryError);
      }
    }

    // Save to browser storage
    try {
      const storageData = JSON.stringify({
        ...DEFAULT_PREFERENCES,
        userId,
        timestamp: Date.now(),
        lastUpdated: new Date().toISOString(),
        initialized: true,
      });

      // Save to localStorage
      localStorage.setItem(USER_PREFS_STORAGE_KEY, storageData);

      // Also save to backup key in localStorage
      localStorage.setItem(USER_PREFS_STORAGE_KEY + "_backup", storageData);

      // Also save to sessionStorage for extra redundancy
      try {
        sessionStorage.setItem(USER_PREFS_STORAGE_KEY, storageData);
      } catch (sessionError) {
        console.error("Error saving to sessionStorage:", sessionError);
      }

      console.log("Saved default preferences to browser storage");
    } catch (storageError) {
      console.error(
        "Error saving preferences to browser storage:",
        storageError
      );

      // Try a more minimal approach if the full one fails
      try {
        const minimalData = JSON.stringify({
          darkMode: DEFAULT_PREFERENCES.darkMode,
          fontSize: DEFAULT_PREFERENCES.fontSize,
          profilePanelOpen: DEFAULT_PREFERENCES.profilePanelOpen,
          userId,
          timestamp: Date.now(),
        });

        localStorage.setItem(USER_PREFS_STORAGE_KEY + "_minimal", minimalData);
        console.log("Saved minimal default preferences as backup");
      } catch (minimalError) {
        console.error("Even minimal backup failed:", minimalError);
      }
    }

    return DEFAULT_PREFERENCES;
  } catch (error) {
    console.error("Error initializing user preferences:", error);
    return DEFAULT_PREFERENCES;
  }
};

/**
 * Save a single preference to both Firestore and localStorage
 * @param {string} userId - The user's ID
 * @param {string} key - The preference key
 * @param {any} value - The preference value
 * @returns {Promise<boolean>} - Whether the save was successful
 */
export const savePreference = async (userId, key, value) => {
  if (!userId || !key) {
    console.error("Missing userId or key in savePreference");
    return false;
  }

  console.log(`Saving preference ${key}:`, value, "for user:", userId);

  try {
    // Update in Firestore
    const userPrefsRef = doc(db, USER_PREFS_COLLECTION, userId);

    // First check if the document exists
    const docSnap = await getDoc(userPrefsRef);

    if (docSnap.exists()) {
      // Update existing document
      console.log(`Updating existing preference document for ${key}`);
      try {
        await updateDoc(userPrefsRef, {
          [key]: value,
          updatedAt: serverTimestamp(),
        });
        console.log(`Successfully updated preference ${key} in Firestore`);
      } catch (updateError) {
        console.error(`Error updating preference ${key}:`, updateError);

        // Try alternative approach
        try {
          console.log("Trying alternative approach to update preference");
          const currentData = docSnap.data();
          await setDoc(
            userPrefsRef,
            {
              ...currentData,
              [key]: value,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
          console.log("Alternative update approach succeeded");
        } catch (retryError) {
          console.error("Alternative update approach also failed:", retryError);
          return false;
        }
      }
    } else {
      // Create new document with defaults + the new value
      console.log(`Creating new preference document with ${key}`);
      try {
        await setDoc(userPrefsRef, {
          ...DEFAULT_PREFERENCES,
          [key]: value,
          userId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        console.log(`Successfully created preference document with ${key}`);
      } catch (createError) {
        console.error(
          `Error creating preference document with ${key}:`,
          createError
        );

        // Try alternative approach
        try {
          console.log(
            "Trying alternative approach to create preference document"
          );
          // Create a plain object with just the essential fields
          const newDoc = {
            [key]: value,
            userId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };

          // Add all default preferences individually
          Object.keys(DEFAULT_PREFERENCES).forEach((prefKey) => {
            if (prefKey !== key) {
              // Skip the one we're explicitly setting
              newDoc[prefKey] = DEFAULT_PREFERENCES[prefKey];
            }
          });

          await setDoc(userPrefsRef, newDoc);
          console.log("Alternative creation approach succeeded");
        } catch (retryError) {
          console.error(
            "Alternative creation approach also failed:",
            retryError
          );
          return false;
        }
      }
    }

    // Update in localStorage
    try {
      const storedPrefs = localStorage.getItem(USER_PREFS_STORAGE_KEY);
      let prefsObj = { ...DEFAULT_PREFERENCES };

      if (storedPrefs) {
        try {
          const parsed = JSON.parse(storedPrefs);
          if (parsed && typeof parsed === "object") {
            prefsObj = { ...prefsObj, ...parsed };
          }
        } catch (parseError) {
          console.error("Error parsing stored preferences:", parseError);
        }
      }

      // Update the preference
      prefsObj[key] = value;
      prefsObj.userId = userId;
      prefsObj.timestamp = Date.now();
      prefsObj.lastUpdated = new Date().toISOString();

      // Create a storage data string once to reuse
      const storageData = JSON.stringify(prefsObj);

      // Save to localStorage
      localStorage.setItem(USER_PREFS_STORAGE_KEY, storageData);

      // Also save to backup key in localStorage
      localStorage.setItem(USER_PREFS_STORAGE_KEY + "_backup", storageData);

      // Also save to sessionStorage for extra redundancy
      try {
        sessionStorage.setItem(USER_PREFS_STORAGE_KEY, storageData);
      } catch (sessionError) {
        console.error("Error saving to sessionStorage:", sessionError);
      }

      console.log(`Saved preference ${key} to browser storage:`, value);
    } catch (storageError) {
      console.error("Error saving preference to localStorage:", storageError);
    }

    return true;
  } catch (error) {
    console.error(`Error saving preference ${key}:`, error);
    return false;
  }
};

/**
 * Save multiple preferences at once to both Firestore and localStorage
 * @param {string} userId - The user's ID
 * @param {Object} preferences - Object containing preference key-value pairs
 * @returns {Promise<boolean>} - Whether the save was successful
 */
export const savePreferences = async (userId, preferences) => {
  if (!userId || !preferences) {
    console.error("Missing userId or preferences in savePreferences");
    return false;
  }

  console.log("Saving multiple preferences for user:", userId, preferences);

  try {
    // Update in localStorage first (fastest)
    try {
      const storedPrefs = localStorage.getItem(USER_PREFS_STORAGE_KEY);
      let prefsObj = { ...DEFAULT_PREFERENCES };

      if (storedPrefs) {
        try {
          const parsed = JSON.parse(storedPrefs);
          if (parsed && typeof parsed === "object") {
            prefsObj = { ...prefsObj, ...parsed };
          }
        } catch (parseError) {
          console.error("Error parsing stored preferences:", parseError);
        }
      }

      // Update with new preferences
      prefsObj = {
        ...prefsObj,
        ...preferences,
        userId,
        timestamp: Date.now(),
        lastUpdated: new Date().toISOString(),
      };

      // Create a storage data string once to reuse
      const storageData = JSON.stringify(prefsObj);

      // Save to localStorage
      localStorage.setItem(USER_PREFS_STORAGE_KEY, storageData);

      // Also save to backup key in localStorage
      localStorage.setItem(USER_PREFS_STORAGE_KEY + "_backup", storageData);

      console.log("Saved preferences to localStorage");

      // Also save to sessionStorage for extra redundancy
      try {
        sessionStorage.setItem(USER_PREFS_STORAGE_KEY, storageData);
      } catch (sessionError) {
        console.error("Error saving to sessionStorage:", sessionError);
      }

      // Save minimal version as an additional backup
      try {
        const minimalData = JSON.stringify({
          darkMode: prefsObj.darkMode,
          fontSize: prefsObj.fontSize,
          profilePanelOpen: prefsObj.profilePanelOpen,
          userId,
          timestamp: Date.now(),
        });

        localStorage.setItem(USER_PREFS_STORAGE_KEY + "_minimal", minimalData);
      } catch (minimalError) {
        console.error("Error saving minimal backup:", minimalError);
      }
    } catch (storageError) {
      console.error("Error saving preferences to localStorage:", storageError);
    }

    // Update in Firestore
    const userPrefsRef = doc(db, USER_PREFS_COLLECTION, userId);

    // Also save to backup collection
    try {
      const backupRef = doc(db, "userBackups", userId);
      await setDoc(
        backupRef,
        {
          preferences: {
            ...preferences,
            backupTimestamp: new Date().toISOString(),
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      console.log("Saved preferences to backup collection");
    } catch (backupError) {
      console.error("Error saving to backup collection:", backupError);
    }

    // First check if the document exists
    const docSnap = await getDoc(userPrefsRef);

    if (docSnap.exists()) {
      // Update existing document
      console.log("Updating existing preferences document");
      try {
        await updateDoc(userPrefsRef, {
          ...preferences,
          updatedAt: serverTimestamp(),
        });
        console.log("Successfully updated preferences in Firestore");
      } catch (updateError) {
        console.error("Error updating preferences:", updateError);

        // Try alternative approach
        try {
          console.log("Trying alternative approach to update preferences");
          const currentData = docSnap.data();
          await setDoc(
            userPrefsRef,
            {
              ...currentData,
              ...preferences,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
          console.log("Alternative update approach succeeded");
        } catch (retryError) {
          console.error("Alternative update approach also failed:", retryError);
          return false;
        }
      }
    } else {
      // Create new document with defaults + the new values
      console.log("Creating new preferences document");
      try {
        await setDoc(userPrefsRef, {
          ...DEFAULT_PREFERENCES,
          ...preferences,
          userId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        console.log("Successfully created preferences document");
      } catch (createError) {
        console.error("Error creating preferences document:", createError);

        // Try alternative approach
        try {
          console.log(
            "Trying alternative approach to create preferences document"
          );
          // Create a plain object with just the essential fields
          const newDoc = {
            userId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };

          // Add all default preferences
          Object.keys(DEFAULT_PREFERENCES).forEach((key) => {
            newDoc[key] = DEFAULT_PREFERENCES[key];
          });

          // Add the new preferences
          Object.keys(preferences).forEach((key) => {
            newDoc[key] = preferences[key];
          });

          await setDoc(userPrefsRef, newDoc);
          console.log("Alternative creation approach succeeded");
        } catch (retryError) {
          console.error(
            "Alternative creation approach also failed:",
            retryError
          );
          return false;
        }
      }
    }

    // We already updated localStorage at the beginning of this function

    return true;
  } catch (error) {
    console.error("Error saving preferences:", error);
    return false;
  }
};

/**
 * Load user preferences from localStorage (fast) and then Firestore (authoritative)
 * @param {string} userId - The user's ID
 * @returns {Promise<Object>} - The loaded preferences
 */
/**
 * Check if user preferences are properly initialized
 * @param {string} userId - The user's ID
 * @returns {Promise<boolean>} - Whether preferences are initialized
 */
export const checkPreferencesInitialized = async (userId) => {
  if (!userId) return false;

  try {
    // Check Firestore first
    const userPrefsRef = doc(db, USER_PREFS_COLLECTION, userId);
    const docSnap = await getDoc(userPrefsRef);

    if (docSnap.exists()) {
      return true;
    }

    // Check localStorage
    try {
      const storedPrefs = localStorage.getItem(USER_PREFS_STORAGE_KEY);
      if (storedPrefs) {
        const parsedPrefs = JSON.parse(storedPrefs);
        if (parsedPrefs && parsedPrefs.userId === userId) {
          return true;
        }
      }
    } catch (storageError) {
      console.error("Error checking localStorage:", storageError);
    }

    return false;
  } catch (error) {
    console.error("Error checking if preferences are initialized:", error);
    return false;
  }
};

/**
 * Periodically save preferences to ensure they're not lost
 * @param {string} userId - The user's ID
 * @param {Function} getPreferences - Function that returns current preferences
 * @returns {Function} - A function to stop the periodic saving
 */
/**
 * Recover preferences from backup sources if main storage fails
 * @param {string} userId - The user's ID
 * @returns {Promise<Object|null>} - The recovered preferences or null if none found
 */
export const recoverPreferencesFromBackup = async (userId) => {
  if (!userId) return null;

  console.log(
    "Attempting to recover preferences from backup sources for user:",
    userId
  );

  try {
    // Try backup in localStorage first
    try {
      const backupPrefs = localStorage.getItem(
        USER_PREFS_STORAGE_KEY + "_backup"
      );
      if (backupPrefs) {
        const parsedBackup = JSON.parse(backupPrefs);
        if (parsedBackup && parsedBackup.userId === userId) {
          console.log("Recovered preferences from localStorage backup");
          return parsedBackup;
        }
      }
    } catch (localBackupError) {
      console.error(
        "Error recovering from localStorage backup:",
        localBackupError
      );
    }

    // Try minimal backup in localStorage
    try {
      const minimalPrefs = localStorage.getItem(
        USER_PREFS_STORAGE_KEY + "_minimal"
      );
      if (minimalPrefs) {
        const parsedMinimal = JSON.parse(minimalPrefs);
        if (parsedMinimal && parsedMinimal.userId === userId) {
          console.log("Recovered minimal preferences from localStorage");
          return parsedMinimal;
        }
      }
    } catch (minimalError) {
      console.error("Error recovering from minimal backup:", minimalError);
    }

    // Try sessionStorage
    try {
      const sessionPrefs = sessionStorage.getItem(USER_PREFS_STORAGE_KEY);
      if (sessionPrefs) {
        const parsedSession = JSON.parse(sessionPrefs);
        if (parsedSession && parsedSession.userId === userId) {
          console.log("Recovered preferences from sessionStorage");
          return parsedSession;
        }
      }
    } catch (sessionError) {
      console.error("Error recovering from sessionStorage:", sessionError);
    }

    // Try Firestore backup collection
    try {
      const backupRef = doc(db, "userBackups", userId);
      const backupSnap = await getDoc(backupRef);

      if (backupSnap.exists() && backupSnap.data().preferences) {
        console.log("Recovered preferences from Firestore backup collection");
        return backupSnap.data().preferences;
      }
    } catch (firestoreError) {
      console.error("Error recovering from Firestore backup:", firestoreError);
    }

    console.log("No backup preferences found");
    return null;
  } catch (error) {
    console.error("Error recovering preferences from backup:", error);
    return null;
  }
};

export const startPeriodicPreferenceSaving = (userId, getPreferences) => {
  if (!userId || !getPreferences) {
    console.error("Missing userId or getPreferences function");
    return () => {};
  }

  console.log("Starting periodic preference saving for user:", userId);

  // Save immediately first
  const saveNow = async () => {
    try {
      const currentPrefs = getPreferences();
      if (!currentPrefs) return;

      // Add metadata
      const prefsToSave = {
        ...currentPrefs,
        lastAutoSave: new Date().toISOString(),
        autoSaved: true,
      };

      // Save to Firestore
      try {
        await savePreferences(userId, prefsToSave);
        console.log(
          "Auto-saved preferences to Firestore:",
          new Date().toISOString()
        );
      } catch (firestoreError) {
        console.error("Error auto-saving to Firestore:", firestoreError);
      }

      // Save to browser storage
      try {
        const storageData = JSON.stringify({
          ...prefsToSave,
          userId,
          timestamp: Date.now(),
        });

        localStorage.setItem(USER_PREFS_STORAGE_KEY, storageData);
        localStorage.setItem(USER_PREFS_STORAGE_KEY + "_backup", storageData);
        sessionStorage.setItem(USER_PREFS_STORAGE_KEY, storageData);

        console.log(
          "Auto-saved preferences to browser storage:",
          new Date().toISOString()
        );
      } catch (storageError) {
        console.error("Error auto-saving to browser storage:", storageError);
      }
    } catch (error) {
      console.error("Error in periodic preference saving:", error);
    }
  };

  // Save immediately
  saveNow();

  // Then set up interval (every 30 seconds)
  const intervalId = setInterval(saveNow, 30000);

  // Return function to stop the periodic saving
  return () => {
    console.log("Stopping periodic preference saving");
    clearInterval(intervalId);

    // Save one last time when stopping
    saveNow();
  };
};

export const loadUserPreferences = async (userId) => {
  if (!userId) {
    console.error("No userId provided to loadUserPreferences");
    return DEFAULT_PREFERENCES;
  }

  console.log("Loading preferences for user:", userId);
  let preferences = { ...DEFAULT_PREFERENCES };

  // Check if preferences are initialized, if not initialize them
  const initialized = await checkPreferencesInitialized(userId);
  if (!initialized) {
    console.log("Preferences not initialized, initializing now");
    await initializeUserPreferences(userId);
  }

  // Try to recover preferences from backup if needed
  try {
    const recoveredPrefs = await recoverPreferencesFromBackup(userId);
    if (recoveredPrefs) {
      console.log("Recovered preferences from backup");
      preferences = { ...preferences, ...recoveredPrefs };
    }
  } catch (recoveryError) {
    console.error("Error recovering preferences from backup:", recoveryError);
  }

  // First try to load from sessionStorage (fastest)
  try {
    const sessionPrefs = sessionStorage.getItem(USER_PREFS_STORAGE_KEY);
    if (sessionPrefs) {
      try {
        const parsedPrefs = JSON.parse(sessionPrefs);
        if (
          parsedPrefs &&
          typeof parsedPrefs === "object" &&
          parsedPrefs.userId === userId
        ) {
          // Merge with defaults to ensure all properties exist
          preferences = { ...DEFAULT_PREFERENCES, ...parsedPrefs };
          console.log("Loaded preferences from sessionStorage");
        }
      } catch (parseError) {
        console.error("Error parsing sessionStorage preferences:", parseError);
      }
    }
  } catch (sessionError) {
    console.error("Error accessing sessionStorage:", sessionError);
  }

  // Then try localStorage (still fast, persists across sessions)
  try {
    // Try the main localStorage key first
    const storedPrefs = localStorage.getItem(USER_PREFS_STORAGE_KEY);
    if (storedPrefs) {
      try {
        const parsedPrefs = JSON.parse(storedPrefs);
        if (
          parsedPrefs &&
          typeof parsedPrefs === "object" &&
          parsedPrefs.userId === userId
        ) {
          // Merge with defaults to ensure all properties exist
          preferences = { ...DEFAULT_PREFERENCES, ...parsedPrefs };
          console.log("Loaded preferences from localStorage");

          // Update sessionStorage with localStorage data
          try {
            sessionStorage.setItem(USER_PREFS_STORAGE_KEY, storedPrefs);
          } catch (sessionError) {
            console.error("Error updating sessionStorage:", sessionError);
          }
        }
      } catch (parseError) {
        console.error("Error parsing localStorage preferences:", parseError);

        // Try the backup key if the main one is corrupted
        try {
          const backupPrefs = localStorage.getItem(
            USER_PREFS_STORAGE_KEY + "_backup"
          );
          if (backupPrefs) {
            const parsedBackup = JSON.parse(backupPrefs);
            if (
              parsedBackup &&
              typeof parsedBackup === "object" &&
              parsedBackup.userId === userId
            ) {
              preferences = { ...DEFAULT_PREFERENCES, ...parsedBackup };
              console.log("Loaded preferences from localStorage backup");

              // Restore the main key from the backup
              localStorage.setItem(USER_PREFS_STORAGE_KEY, backupPrefs);
            }
          }
        } catch (backupError) {
          console.error("Error loading from backup:", backupError);
        }
      }
    }
  } catch (storageError) {
    console.error("Error loading preferences from localStorage:", storageError);
  }

  // Finally, try to load from Firestore (authoritative but slowest)
  try {
    const userPrefsRef = doc(db, USER_PREFS_COLLECTION, userId);
    const docSnap = await getDoc(userPrefsRef);

    if (docSnap.exists()) {
      // Merge with defaults to ensure all properties exist
      const firestorePrefs = docSnap.data();
      console.log("Loaded preferences from Firestore:", firestorePrefs);

      // Check if we need to update any missing default preferences
      const updatedPrefs = { ...DEFAULT_PREFERENCES, ...firestorePrefs };

      // If Firestore is missing any default preferences, update it
      if (
        Object.keys(updatedPrefs).length > Object.keys(firestorePrefs).length
      ) {
        console.log("Updating Firestore with missing default preferences");
        try {
          await updateDoc(userPrefsRef, {
            ...updatedPrefs,
            updatedAt: serverTimestamp(),
          });
        } catch (updateError) {
          console.error("Error updating Firestore with defaults:", updateError);

          // Try alternative approach with setDoc and merge
          try {
            await setDoc(
              userPrefsRef,
              {
                ...updatedPrefs,
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );
            console.log(
              "Updated Firestore with defaults using alternative approach"
            );
          } catch (altError) {
            console.error("Alternative update approach also failed:", altError);
          }
        }
      }

      preferences = updatedPrefs;

      // Update localStorage and sessionStorage with the latest data
      try {
        const storageData = JSON.stringify({
          ...preferences,
          userId,
          timestamp: Date.now(),
        });

        localStorage.setItem(USER_PREFS_STORAGE_KEY, storageData);
        localStorage.setItem(USER_PREFS_STORAGE_KEY + "_backup", storageData);
        sessionStorage.setItem(USER_PREFS_STORAGE_KEY, storageData);
        console.log("Updated browser storage with Firestore preferences");
      } catch (storageError) {
        console.error("Error updating browser storage:", storageError);

        // Try a more minimal approach if the full one fails
        try {
          const minimalData = JSON.stringify({
            darkMode: preferences.darkMode,
            fontSize: preferences.fontSize,
            profilePanelOpen: preferences.profilePanelOpen,
            userId,
            timestamp: Date.now(),
          });

          localStorage.setItem(
            USER_PREFS_STORAGE_KEY + "_minimal",
            minimalData
          );
          console.log("Saved minimal preferences as backup");
        } catch (minimalError) {
          console.error("Even minimal backup failed:", minimalError);
        }
      }
    } else {
      // If no preferences exist in Firestore, initialize them
      console.log("No preferences found in Firestore, initializing defaults");
      const initializedPrefs = await initializeUserPreferences(userId);
      preferences = initializedPrefs || preferences; // Use initialized prefs if available
    }
  } catch (error) {
    console.error("Error loading preferences from Firestore:", error);

    // If Firestore fails, try to initialize preferences locally
    try {
      console.log(
        "Attempting to initialize preferences locally after Firestore error"
      );
      const localPrefs = {
        ...DEFAULT_PREFERENCES,
        userId,
        timestamp: Date.now(),
        locallyInitialized: true,
      };

      localStorage.setItem(USER_PREFS_STORAGE_KEY, JSON.stringify(localPrefs));
      sessionStorage.setItem(
        USER_PREFS_STORAGE_KEY,
        JSON.stringify(localPrefs)
      );

      console.log("Initialized preferences locally after Firestore error");
    } catch (localError) {
      console.error("Failed to initialize preferences locally:", localError);
    }
  }

  return preferences;
};
