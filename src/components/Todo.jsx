import { useState, useEffect, useRef } from "react";
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { auth, db, storage } from "../firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useNavigate } from "react-router-dom";
import {
  saveProfilePicture,
  loadProfilePicture,
} from "../utils/profilePersistence";
import {
  initializeUserPreferences,
  savePreference,
  savePreferences,
  loadUserPreferences,
  checkPreferencesInitialized,
  startPeriodicPreferenceSaving,
  DEFAULT_PREFERENCES,
} from "../utils/preferencePersistence";
import "./Todo.css";

// Apply dark mode immediately if it was previously set
(function () {
  try {
    const darkModePreference = localStorage.getItem("todoapp_dark_mode");
    if (darkModePreference === "true") {
      document.documentElement.classList.add("dark-mode-body");
      document.body.classList.add("dark-mode-body");
    }
  } catch (error) {
    console.error("Error applying initial dark mode:", error);
  }
})();

const CATEGORY_COLORS = {
  Work: "#0a2463",
  Personal: "#d81159",
  Shopping: "#218380",
  Other: "#f4a261",
};

const Todo = () => {
  const [todos, setTodos] = useState([]);
  const [newTodo, setNewTodo] = useState("");
  const [newCategory, setNewCategory] = useState("Work");
  const [newDueDate, setNewDueDate] = useState("");
  const [username, setUsername] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [profilePicture, setProfilePicture] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [filterCategory, setFilterCategory] = useState("All");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTodo, setEditTodo] = useState(null);
  const [profilePanelOpen, setProfilePanelOpen] = useState(
    DEFAULT_PREFERENCES.profilePanelOpen
  );
  const [darkMode, setDarkMode] = useState(DEFAULT_PREFERENCES.darkMode);
  const [fontSize, setFontSize] = useState(DEFAULT_PREFERENCES.fontSize);
  const [sidebarExpanded, setSidebarExpanded] = useState(
    DEFAULT_PREFERENCES.sidebarExpanded
  );
  const [autoSortTasks, setAutoSortTasks] = useState(
    DEFAULT_PREFERENCES.autoSortTasks
  );
  const [dueDateReminders, setDueDateReminders] = useState(
    DEFAULT_PREFERENCES.dueDateReminders
  );
  const [reminderTime, setReminderTime] = useState(
    DEFAULT_PREFERENCES.reminderTime
  );
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  // Instead of using beforeunload which can cause alerts, we'll use a more frequent
  // auto-save approach to ensure preferences are saved regularly
  useEffect(() => {
    // Create a function to save preferences
    const savePreferencesToStorage = () => {
      console.log("Auto-saving preferences to storage");

      if (auth.currentUser) {
        try {
          // Create preferences object
          const currentPreferences = {
            darkMode,
            fontSize,
            sidebarExpanded,
            autoSortTasks,
            dueDateReminders,
            reminderTime,
            profilePanelOpen,
            lastSaved: new Date().toISOString(),
            autoSaved: true,
          };

          // Save to browser storage
          try {
            const storageData = JSON.stringify({
              ...currentPreferences,
              userId: auth.currentUser.uid,
              timestamp: Date.now(),
            });

            localStorage.setItem("todoapp_user_preferences", storageData);
            localStorage.setItem(
              "todoapp_user_preferences_backup",
              storageData
            );
            sessionStorage.setItem("todoapp_user_preferences", storageData);

            // Ensure dark mode preference is saved separately
            localStorage.setItem(
              "todoapp_dark_mode",
              darkMode ? "true" : "false"
            );

            console.log("Saved preferences to browser storage");
          } catch (storageError) {
            console.error("Error saving to browser storage:", storageError);
          }
        } catch (error) {
          console.error("Error in auto-save handler:", error);
        }
      }
    };

    // Save immediately when preferences change
    savePreferencesToStorage();

    // No beforeunload handler - we'll rely on frequent auto-saves instead
    // This completely avoids the "Changes you've made may not be saved" alert
  }, [
    darkMode,
    fontSize,
    sidebarExpanded,
    autoSortTasks,
    dueDateReminders,
    reminderTime,
    profilePanelOpen,
  ]);

  useEffect(() => {
    let unsubscribeSnapshot = null;
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        setUsername(user.displayName || "User");
        setUserEmail(user.email || "");

        // Load profile picture using our utility function
        const loadUserProfilePicture = async () => {
          try {
            console.log(
              "Starting profile picture loading process for user:",
              user.uid
            );

            // First check if the user already has a photoURL in Firebase Auth
            if (user.photoURL) {
              setProfilePicture(user.photoURL);
              console.log(
                "Using profile picture from Firebase Auth:",
                user.photoURL
              );

              // Save this to browser storage for redundancy
              try {
                const storageData = JSON.stringify({
                  photoURL: user.photoURL,
                  userId: user.uid,
                  timestamp: Date.now(),
                });
                localStorage.setItem("todoapp_profile_picture", storageData);
                sessionStorage.setItem(
                  "todoapp_profile_picture_session",
                  storageData
                );
                console.log("Saved Firebase Auth photoURL to browser storage");
              } catch (storageError) {
                console.error("Error saving to browser storage:", storageError);
              }
            }
            // If no photoURL in Firebase Auth, check browser storage
            else {
              try {
                // Check session storage first (fastest)
                const sessionData = sessionStorage.getItem(
                  "todoapp_profile_picture_session"
                );
                if (sessionData) {
                  const parsedData = JSON.parse(sessionData);
                  if (parsedData.userId === user.uid && parsedData.photoURL) {
                    // Show this immediately while we load from more reliable sources
                    setProfilePicture(parsedData.photoURL);
                    console.log(
                      "Using profile picture from session storage while loading from other sources"
                    );

                    // Update Firebase Auth with this URL
                    try {
                      await updateProfile(user, {
                        photoURL: parsedData.photoURL,
                      });
                      console.log(
                        "Updated Firebase Auth with profile picture from session storage"
                      );
                    } catch (authError) {
                      console.error("Error updating Firebase Auth:", authError);
                    }
                  }
                }
              } catch (storageError) {
                console.error("Error checking session storage:", storageError);
              }
            }

            // Try multiple times to load the profile picture from all sources
            let pictureUrl = null;
            let attempts = 0;
            const maxAttempts = 5; // Increased for better reliability

            while (!pictureUrl && attempts < maxAttempts) {
              attempts++;
              console.log(`Attempt ${attempts} to load profile picture`);

              // Force reload the user first to ensure we have the latest data
              if (attempts > 1) {
                try {
                  await user.reload();
                  console.log("Reloaded user profile before attempt", attempts);
                } catch (reloadError) {
                  console.error("Error reloading user profile:", reloadError);
                }
              }

              pictureUrl = await loadProfilePicture(user);

              if (!pictureUrl && attempts < maxAttempts) {
                // Wait longer between retries
                await new Promise((resolve) =>
                  setTimeout(resolve, 1000 * attempts)
                ); // Increase wait time with each attempt
              }
            }

            if (pictureUrl) {
              setProfilePicture(pictureUrl);
              console.log("Profile picture loaded successfully:", pictureUrl);

              // Save to all browser storage mechanisms as additional backup
              try {
                const storageData = JSON.stringify({
                  photoURL: pictureUrl,
                  userId: user.uid,
                  timestamp: Date.now(),
                });
                localStorage.setItem("todoapp_profile_picture", storageData);
                sessionStorage.setItem("todoapp_profile_picture", storageData);
                sessionStorage.setItem(
                  "todoapp_profile_picture_session",
                  storageData
                );
                console.log(
                  "Saved loaded profile picture to browser storage as backup"
                );
              } catch (storageError) {
                console.error("Error saving to browser storage:", storageError);
              }

              // Also update the backup collection in Firestore
              try {
                const backupRef = doc(db, "userBackups", user.uid);
                await setDoc(
                  backupRef,
                  {
                    profilePicture: pictureUrl,
                    updatedAt: serverTimestamp(),
                  },
                  { merge: true }
                );
                console.log("Updated backup collection with profile picture");
              } catch (backupError) {
                console.error("Error updating backup collection:", backupError);
              }
            } else {
              // Set default picture if loading fails
              const defaultPicture =
                "https://ui-avatars.com/api/?name=" +
                encodeURIComponent(user.displayName || "User") +
                "&background=random";
              setProfilePicture(defaultPicture);
              console.warn(
                "Using default profile picture after failed attempts"
              );
            }
          } catch (error) {
            console.error("Error loading profile picture:", error);
            // Set default picture if loading fails
            const defaultPicture =
              "https://ui-avatars.com/api/?name=" +
              encodeURIComponent(user.displayName || "User") +
              "&background=random";
            setProfilePicture(defaultPicture);
          }
        };

        loadUserProfilePicture();

        const q = query(
          collection(db, "todos"),
          where("userId", "==", user.uid),
          orderBy("category"),
          orderBy("dueDate", "asc")
        );

        unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
          setTodos(
            snapshot.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
              dueDate: doc.data().dueDate ? doc.data().dueDate.toDate() : null,
            }))
          );
        });

        // Load user preferences from both localStorage and Firestore
        const loadAndInitializeUserPreferences = async () => {
          try {
            console.log("Starting to load user preferences for:", user.uid);

            // Check for dark mode preference in localStorage first (for immediate visual feedback)
            try {
              const darkModePreference =
                localStorage.getItem("todoapp_dark_mode");
              if (darkModePreference === "true") {
                console.log(
                  "Found dark mode preference in localStorage, applying immediately"
                );
                setDarkMode(true);
                document.documentElement.classList.add("dark-mode-body");
                document.body.classList.add("dark-mode-body");
              } else if (darkModePreference === "false") {
                setDarkMode(false);
                document.documentElement.classList.remove("dark-mode-body");
                document.body.classList.remove("dark-mode-body");
              }
            } catch (darkModeError) {
              console.error(
                "Error checking dark mode preference:",
                darkModeError
              );
            }

            // Check if preferences are initialized, if not initialize them
            const initialized = await checkPreferencesInitialized(user.uid);
            if (!initialized) {
              console.log("Preferences not initialized, initializing now");
              await initializeUserPreferences(user.uid);
            }

            // First try to load from sessionStorage (fastest)
            try {
              const sessionPrefs = sessionStorage.getItem(
                "todoapp_user_preferences"
              );
              if (sessionPrefs) {
                try {
                  const parsedPrefs = JSON.parse(sessionPrefs);
                  if (parsedPrefs && parsedPrefs.userId === user.uid) {
                    console.log("Applying preferences from sessionStorage");
                    applyPreferencesToState(parsedPrefs);
                  }
                } catch (parseError) {
                  console.error(
                    "Error parsing sessionStorage preferences:",
                    parseError
                  );
                }
              }
            } catch (sessionError) {
              console.error("Error accessing sessionStorage:", sessionError);
            }

            // Then try localStorage (still fast, persists across sessions)
            try {
              const storedPrefs = localStorage.getItem(
                "todoapp_user_preferences"
              );
              if (storedPrefs) {
                try {
                  const parsedPrefs = JSON.parse(storedPrefs);
                  if (parsedPrefs && parsedPrefs.userId === user.uid) {
                    console.log("Applying preferences from localStorage");
                    applyPreferencesToState(parsedPrefs);

                    // Update sessionStorage with localStorage data for faster access next time
                    try {
                      sessionStorage.setItem(
                        "todoapp_user_preferences",
                        storedPrefs
                      );
                    } catch (sessionError) {
                      console.error(
                        "Error updating sessionStorage:",
                        sessionError
                      );
                    }
                  }
                } catch (parseError) {
                  console.error(
                    "Error parsing localStorage preferences:",
                    parseError
                  );
                }
              }
            } catch (storageError) {
              console.error(
                "Error loading preferences from localStorage:",
                storageError
              );
            }

            // Then load from Firestore (authoritative) using our utility function
            console.log("Loading preferences from Firestore");
            const firestorePrefs = await loadUserPreferences(user.uid);

            // Apply the Firestore preferences (which should be the most authoritative)
            console.log("Applying preferences from Firestore:", firestorePrefs);
            applyPreferencesToState(firestorePrefs);

            // Set up real-time listener for preference changes
            const userPrefsRef = doc(db, "userPreferences", user.uid);
            const unsubscribePrefs = onSnapshot(userPrefsRef, (docSnap) => {
              if (docSnap.exists()) {
                const prefs = docSnap.data();
                console.log(
                  "Received updated preferences from Firestore:",
                  prefs
                );

                // Apply preferences to state
                applyPreferencesToState(prefs);

                // Update localStorage and sessionStorage with the latest data
                try {
                  const storageData = JSON.stringify({
                    ...prefs,
                    userId: user.uid,
                    timestamp: Date.now(),
                  });

                  localStorage.setItem("todoapp_user_preferences", storageData);
                  sessionStorage.setItem(
                    "todoapp_user_preferences",
                    storageData
                  );
                  console.log(
                    "Updated browser storage with Firestore preferences"
                  );
                } catch (storageError) {
                  console.error(
                    "Error updating browser storage:",
                    storageError
                  );
                }
              }
            });

            return unsubscribePrefs;
          } catch (error) {
            console.error("Error loading user preferences:", error);
            return null;
          }
        };

        const unsubscribePrefs = loadAndInitializeUserPreferences();

        return () => {
          // Save all current preferences before unmounting
          if (auth.currentUser) {
            try {
              const currentPreferences = {
                darkMode,
                fontSize,
                sidebarExpanded,
                autoSortTasks,
                dueDateReminders,
                reminderTime,
                profilePanelOpen,
                lastSaved: new Date().toISOString(),
                componentUnmounted: true, // Flag to indicate this was saved during unmount
              };

              console.log("Saving preferences during component cleanup");

              // Use a non-awaited call since we're in a cleanup function
              savePreferences(auth.currentUser.uid, currentPreferences)
                .then(() =>
                  console.log(
                    "Successfully saved preferences to Firestore during cleanup"
                  )
                )
                .catch((error) =>
                  console.error(
                    "Error saving preferences to Firestore during cleanup:",
                    error
                  )
                );

              // Save to both localStorage and sessionStorage as a backup
              try {
                const storageData = JSON.stringify({
                  ...currentPreferences,
                  userId: auth.currentUser.uid,
                  timestamp: Date.now(),
                });

                localStorage.setItem("todoapp_user_preferences", storageData);
                sessionStorage.setItem("todoapp_user_preferences", storageData);

                // Also save to a backup key in case the main one gets corrupted
                localStorage.setItem(
                  "todoapp_user_preferences_backup",
                  storageData
                );

                console.log(
                  "Successfully saved preferences to browser storage during cleanup"
                );
              } catch (storageError) {
                console.error(
                  "Error saving to browser storage during cleanup:",
                  storageError
                );

                // Try an alternative approach with fewer properties
                try {
                  const minimalData = JSON.stringify({
                    darkMode,
                    fontSize,
                    profilePanelOpen,
                    userId: auth.currentUser.uid,
                    timestamp: Date.now(),
                  });

                  localStorage.setItem(
                    "todoapp_user_preferences_minimal",
                    minimalData
                  );
                  console.log("Saved minimal preferences as backup");
                } catch (backupError) {
                  console.error("Even minimal backup failed:", backupError);
                }
              }
            } catch (error) {
              console.error("Error in cleanup function:", error);
            }
          }

          // Clean up subscriptions
          if (unsubscribeSnapshot) unsubscribeSnapshot();
          if (unsubscribePrefs && typeof unsubscribePrefs.then === "function") {
            unsubscribePrefs.then((unsub) => {
              if (unsub) unsub();
            });
          }
        };
      } else {
        navigate("/login");
      }
    });

    return () => {
      if (unsubscribeSnapshot) unsubscribeSnapshot();
      unsubscribeAuth();
    };
  }, [navigate]);

  useEffect(() => {
    if (filterCategory !== "All") {
      setNewCategory(filterCategory);
    }
  }, [filterCategory]);

  // Apply dark mode to body when component mounts or darkMode changes
  useEffect(() => {
    console.log("Applying dark mode:", darkMode);

    if (darkMode) {
      // Apply dark mode to both html and body for complete coverage
      document.documentElement.classList.add("dark-mode-body");
      document.body.classList.add("dark-mode-body");

      // Store the dark mode preference in localStorage for persistence across page refreshes
      try {
        localStorage.setItem("todoapp_dark_mode", "true");
      } catch (error) {
        console.error(
          "Error saving dark mode preference to localStorage:",
          error
        );
      }
    } else {
      // Remove dark mode from both html and body
      document.documentElement.classList.remove("dark-mode-body");
      document.body.classList.remove("dark-mode-body");

      // Update localStorage
      try {
        localStorage.setItem("todoapp_dark_mode", "false");
      } catch (error) {
        console.error(
          "Error saving dark mode preference to localStorage:",
          error
        );
      }
    }

    // Cleanup when component unmounts
    return () => {
      // Don't remove the dark mode class on unmount if it should persist
      // We'll let the preference system handle this
    };
  }, [darkMode]);

  // Start periodic preference saving when component mounts
  useEffect(() => {
    let stopPeriodicSaving = () => {};
    let autoSaveInterval = null;

    if (auth.currentUser) {
      console.log("Starting periodic preference saving");

      // Function to get current preferences
      const getCurrentPreferences = () => {
        return {
          darkMode,
          fontSize,
          sidebarExpanded,
          autoSortTasks,
          dueDateReminders,
          reminderTime,
          profilePanelOpen,
          lastUpdated: new Date().toISOString(),
        };
      };

      // Start periodic saving to Firestore
      stopPeriodicSaving = startPeriodicPreferenceSaving(
        auth.currentUser.uid,
        getCurrentPreferences
      );

      // Also set up a more frequent localStorage save for better persistence
      autoSaveInterval = setInterval(() => {
        try {
          // Save current preferences to localStorage
          const currentPreferences = getCurrentPreferences();

          const storageData = JSON.stringify({
            ...currentPreferences,
            userId: auth.currentUser.uid,
            timestamp: Date.now(),
          });

          localStorage.setItem("todoapp_user_preferences", storageData);
          localStorage.setItem("todoapp_user_preferences_backup", storageData);

          // Always ensure dark mode preference is saved separately
          localStorage.setItem(
            "todoapp_dark_mode",
            darkMode ? "true" : "false"
          );

          console.log("Auto-saved preferences to localStorage");
        } catch (error) {
          console.error("Error in auto-save interval:", error);
        }
      }, 5000); // Save every 5 seconds
    }

    // Clean up when component unmounts
    return () => {
      stopPeriodicSaving();

      if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
      }

      // Save one last time when component unmounts
      if (auth.currentUser) {
        try {
          const finalPreferences = {
            darkMode,
            fontSize,
            sidebarExpanded,
            autoSortTasks,
            dueDateReminders,
            reminderTime,
            profilePanelOpen,
            lastSaved: new Date().toISOString(),
            savedOnUnmount: true,
          };

          const storageData = JSON.stringify({
            ...finalPreferences,
            userId: auth.currentUser.uid,
            timestamp: Date.now(),
          });

          localStorage.setItem("todoapp_user_preferences", storageData);
          localStorage.setItem("todoapp_user_preferences_backup", storageData);
          localStorage.setItem(
            "todoapp_dark_mode",
            darkMode ? "true" : "false"
          );

          console.log("Saved preferences on component unmount");
        } catch (error) {
          console.error("Error saving on unmount:", error);
        }
      }
    };
  }, [
    auth.currentUser?.uid,
    darkMode,
    fontSize,
    sidebarExpanded,
    autoSortTasks,
    dueDateReminders,
    reminderTime,
    profilePanelOpen,
  ]); // Re-run if user ID or preferences change

  // Save preferences to both localStorage and Firestore whenever they change
  useEffect(() => {
    const savePreferencesToBoth = async () => {
      if (auth.currentUser) {
        try {
          // Create preferences object
          const currentPreferences = {
            darkMode,
            fontSize,
            sidebarExpanded,
            autoSortTasks,
            dueDateReminders,
            reminderTime,
            profilePanelOpen,
            lastUpdated: new Date().toISOString(),
          };

          // Save to localStorage for immediate persistence
          try {
            const localStorageData = {
              ...currentPreferences,
              userId: auth.currentUser.uid,
              timestamp: Date.now(),
            };

            localStorage.setItem(
              "todoapp_user_preferences",
              JSON.stringify(localStorageData)
            );

            // Also save to sessionStorage for redundancy
            sessionStorage.setItem(
              "todoapp_user_preferences",
              JSON.stringify(localStorageData)
            );

            console.log("Saved updated preferences to browser storage");
          } catch (storageError) {
            console.error(
              "Error saving preferences to browser storage:",
              storageError
            );
          }

          // Save to Firestore using our utility function
          await savePreferences(auth.currentUser.uid, currentPreferences);
          console.log("Saved updated preferences to Firestore");
        } catch (error) {
          console.error("Error saving preferences:", error);
        }
      }
    };

    // Use a debounce to avoid too many Firestore writes
    const timeoutId = setTimeout(() => {
      savePreferencesToBoth();
    }, 500); // Wait 500ms after the last change before saving

    return () => clearTimeout(timeoutId); // Clean up the timeout
  }, [
    darkMode,
    fontSize,
    sidebarExpanded,
    autoSortTasks,
    dueDateReminders,
    reminderTime,
    profilePanelOpen,
  ]);

  // Optimistic Add Todo:
  const handleAddTodo = async (e) => {
    e.preventDefault();
    const textToAdd = newTodo.trim();
    if (auth.currentUser && textToAdd) {
      const tempId = `temp-${Date.now()}`;
      const tempTodo = {
        id: tempId,
        text: textToAdd,
        userId: auth.currentUser.uid,
        createdAt: new Date(),
        completed: false,
        category: newCategory,
        dueDate: newDueDate ? new Date(newDueDate) : null,
      };

      setTodos((prev) => [tempTodo, ...prev]);

      try {
        await addDoc(collection(db, "todos"), {
          text: textToAdd,
          userId: auth.currentUser.uid,
          createdAt: serverTimestamp(),
          completed: false,
          category: newCategory,
          dueDate: newDueDate ? new Date(newDueDate) : null,
        });
      } catch (error) {
        setTodos((prev) => prev.filter((todo) => todo.id !== tempId));
        console.error("Failed to add todo:", error);
      }

      setNewTodo("");
      setNewDueDate("");
      setNewCategory(filterCategory !== "All" ? filterCategory : "Work");
    }
  };

  const toggleCompleted = async (todo) => {
    if (!todo.id) return;

    setTodos((prevTodos) =>
      prevTodos.map((t) =>
        t.id === todo.id ? { ...t, completed: !t.completed } : t
      )
    );

    const todoRef = doc(db, "todos", todo.id);
    try {
      await updateDoc(todoRef, { completed: !todo.completed });
    } catch (error) {
      setTodos((prevTodos) =>
        prevTodos.map((t) =>
          t.id === todo.id ? { ...t, completed: todo.completed } : t
        )
      );
      console.error("Failed to toggle todo completion:", error);
    }
  };

  const handleDeleteTodo = async (id) => {
    setTodos((prevTodos) => prevTodos.filter((todo) => todo.id !== id));
    try {
      await deleteDoc(doc(db, "todos", id));
    } catch (error) {
      console.error("Failed to delete todo:", error);
    }
  };

  const openEditModal = (todo) => {
    setEditTodo(todo);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditTodo(null);
  };

  const handleUpdateTodo = async (e) => {
    e.preventDefault();
    if (!editTodo || !editTodo.id) return;

    const updatedTodo = {
      text: editTodo.text,
      category: editTodo.category,
      dueDate: editTodo.dueDate ? new Date(editTodo.dueDate) : null,
    };

    setTodos((prevTodos) =>
      prevTodos.map((todo) =>
        todo.id === editTodo.id ? { ...todo, ...updatedTodo } : todo
      )
    );

    try {
      await updateDoc(doc(db, "todos", editTodo.id), updatedTodo);
      closeModal();
    } catch (error) {
      console.error("Failed to update todo:", error);
    }
  };

  const handleLogout = async () => {
    try {
      // Before logging out, ensure all user data is saved
      if (auth.currentUser) {
        try {
          console.log("Saving user data before logout");

          // 1. Save all current preferences
          try {
            const currentPreferences = {
              darkMode,
              fontSize,
              sidebarExpanded,
              autoSortTasks,
              dueDateReminders,
              reminderTime,
              lastLogout: new Date().toISOString(),
            };

            await savePreferences(auth.currentUser.uid, currentPreferences);
            console.log(
              "Successfully saved all user preferences before logout"
            );
          } catch (prefsError) {
            console.error(
              "Error saving preferences before logout:",
              prefsError
            );
          }

          // 2. Save profile picture
          const photoURL = auth.currentUser.photoURL || profilePicture;

          if (photoURL) {
            // Save to browser storage for quick retrieval on next login
            const storageData = JSON.stringify({
              photoURL: photoURL,
              userId: auth.currentUser.uid,
              timestamp: Date.now(),
            });

            // Save to multiple storage locations for redundancy
            localStorage.setItem("todoapp_profile_picture", storageData);
            localStorage.setItem("todoapp_profile_picture_backup", storageData);
            sessionStorage.setItem(
              "todoapp_profile_picture_session",
              storageData
            );
            sessionStorage.setItem("todoapp_profile_picture", storageData);

            console.log(
              "Saved profile picture to browser storage before logout"
            );

            // Also ensure it's in Firestore
            const userProfileRef = doc(
              db,
              "userProfiles",
              auth.currentUser.uid
            );
            await setDoc(
              userProfileRef,
              {
                userId: auth.currentUser.uid,
                photoURL: photoURL,
                updatedAt: serverTimestamp(),
                lastLogout: new Date().toISOString(),
              },
              { merge: true }
            );
            console.log("Saved profile picture to Firestore before logout");

            // And in the backup collection
            const backupRef = doc(db, "userBackups", auth.currentUser.uid);
            await setDoc(
              backupRef,
              {
                profilePicture: photoURL,
                updatedAt: serverTimestamp(),
                lastLogout: new Date().toISOString(),
              },
              { merge: true }
            );
            console.log(
              "Saved profile picture to backup collection before logout"
            );

            // Update Firebase Auth one last time if needed
            if (auth.currentUser.photoURL !== photoURL) {
              await updateProfile(auth.currentUser, { photoURL: photoURL });
              console.log("Updated Firebase Auth profile before logout");
            }
          }

          // Save all preferences one last time before logout
          try {
            const currentPreferences = {
              darkMode,
              fontSize,
              sidebarExpanded,
              autoSortTasks,
              dueDateReminders,
              reminderTime,
              profilePanelOpen,
              lastLogout: new Date().toISOString(),
            };

            // Save to Firestore
            await savePreferences(auth.currentUser.uid, currentPreferences);
            console.log("Saved all preferences to Firestore before logout");

            // Also save to browser storage
            try {
              const storageData = JSON.stringify({
                ...currentPreferences,
                userId: auth.currentUser.uid,
                timestamp: Date.now(),
              });

              localStorage.setItem("todoapp_user_preferences", storageData);
              localStorage.setItem(
                "todoapp_user_preferences_backup",
                storageData
              );
              sessionStorage.setItem("todoapp_user_preferences", storageData);

              console.log(
                "Saved all preferences to browser storage before logout"
              );
            } catch (storageError) {
              console.error(
                "Error saving preferences to browser storage before logout:",
                storageError
              );
            }
          } catch (prefsError) {
            console.error(
              "Error saving preferences before logout:",
              prefsError
            );
          }

          console.log("Successfully saved all user data before logout");
        } catch (saveError) {
          console.error("Error saving user data before logout:", saveError);
          // Continue with logout anyway
        }
      }

      // Now proceed with logout
      await auth.signOut();
      navigate("/login");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  // Helper function to apply preferences to state
  const applyPreferencesToState = (prefs) => {
    if (!prefs) return;

    if (prefs.darkMode !== undefined) setDarkMode(prefs.darkMode);
    if (prefs.fontSize) setFontSize(prefs.fontSize);
    if (prefs.autoSortTasks !== undefined)
      setAutoSortTasks(prefs.autoSortTasks);
    if (prefs.dueDateReminders !== undefined)
      setDueDateReminders(prefs.dueDateReminders);
    if (prefs.reminderTime) setReminderTime(prefs.reminderTime);
    if (prefs.sidebarExpanded !== undefined)
      setSidebarExpanded(prefs.sidebarExpanded);
    if (prefs.profilePanelOpen !== undefined)
      setProfilePanelOpen(prefs.profilePanelOpen);
  };

  // Helper function to save a preference both locally and to Firestore
  const savePreferenceWithFallback = async (key, value) => {
    console.log(`Saving preference ${key}:`, value);

    try {
      if (auth.currentUser) {
        // Special handling for dark mode to ensure it persists across sessions
        if (key === "darkMode") {
          try {
            // Save dark mode preference separately for immediate access on page load
            localStorage.setItem("todoapp_dark_mode", value ? "true" : "false");
            console.log(`Saved dark mode preference separately: ${value}`);
          } catch (darkModeError) {
            console.error(
              "Error saving dark mode preference separately:",
              darkModeError
            );
          }
        }

        // First update localStorage for immediate persistence
        try {
          const storedPrefs = localStorage.getItem("todoapp_user_preferences");
          let prefsObj = { [key]: value, userId: auth.currentUser.uid };

          if (storedPrefs) {
            try {
              const parsed = JSON.parse(storedPrefs);
              if (parsed && typeof parsed === "object") {
                prefsObj = { ...parsed, [key]: value, timestamp: Date.now() };
              }
            } catch (parseError) {
              console.error("Error parsing stored preferences:", parseError);
            }
          }

          // Save to both localStorage and sessionStorage
          const storageData = JSON.stringify(prefsObj);
          localStorage.setItem("todoapp_user_preferences", storageData);
          sessionStorage.setItem("todoapp_user_preferences", storageData);

          // Also save to backup
          localStorage.setItem("todoapp_user_preferences_backup", storageData);

          console.log(`Saved ${key} preference to browser storage:`, value);
        } catch (storageError) {
          console.error("Error saving to browser storage:", storageError);
        }

        // Then save to Firestore
        await savePreference(auth.currentUser.uid, key, value);
        console.log(`Saved ${key} preference to Firestore:`, value);
        return true;
      } else {
        console.warn(
          `User not authenticated, ${key} preference only saved locally`
        );
        return false;
      }
    } catch (error) {
      console.error(`Error updating ${key} preference:`, error);

      // If the main save fails, try a direct approach to Firestore
      if (auth.currentUser) {
        try {
          const userPrefsRef = doc(db, "userPreferences", auth.currentUser.uid);
          await updateDoc(userPrefsRef, {
            [key]: value,
            updatedAt: serverTimestamp(),
          });
          console.log(`Saved ${key} using alternative approach`);
          return true;
        } catch (altError) {
          console.error("Alternative save approach also failed:", altError);
          return false;
        }
      }
      return false;
    }
  };

  const toggleProfilePanel = async () => {
    const newValue = !profilePanelOpen;
    setProfilePanelOpen(newValue); // Update UI immediately for better UX

    await savePreferenceWithFallback("profilePanelOpen", newValue);
  };

  const toggleSidebar = async () => {
    const newValue = !sidebarExpanded;
    setSidebarExpanded(newValue); // Update UI immediately for better UX

    await savePreferenceWithFallback("sidebarExpanded", newValue);
  };

  const handleProfilePictureClick = (e) => {
    e.preventDefault();
    console.log("Profile picture clicked, attempting to open file dialog");
    if (fileInputRef.current) {
      console.log("File input ref found, clicking it");
      fileInputRef.current.click();
    } else {
      console.error("File input ref is null");
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file || !auth.currentUser) {
      console.error("No file selected or user not logged in");
      return;
    }

    // Reset previous states
    setUploadError("");
    setUploadSuccess(false);

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setUploadError("Please select a valid image file.");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setUploadError("File size must be less than 5MB.");
      return;
    }

    // Start upload immediately
    setIsUploading(true);

    try {
      // Create a unique filename with timestamp and user ID to ensure it's persistent
      const timestamp = Date.now();
      const fileExtension = file.name.split(".").pop();
      const fileName = `profile_${auth.currentUser.uid}_${timestamp}.${fileExtension}`;

      const storageRef = ref(
        storage,
        `profilePictures/${auth.currentUser.uid}/${fileName}`
      );

      console.log("Uploading profile picture...");

      // Show a preview of the image immediately
      const reader = new FileReader();
      reader.onload = (event) => {
        // Update UI with preview while uploading
        setProfilePicture(event.target.result);
      };
      reader.readAsDataURL(file);

      // Upload to Firebase Storage
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);

      console.log("Profile picture uploaded successfully:", downloadURL);

      // Save to browser storage immediately for instant persistence
      try {
        const storageData = JSON.stringify({
          photoURL: downloadURL,
          userId: auth.currentUser.uid,
          timestamp: Date.now(),
        });
        // Save to multiple storage locations for redundancy
        localStorage.setItem("todoapp_profile_picture", storageData);
        localStorage.setItem("todoapp_profile_picture_backup", storageData);
        sessionStorage.setItem("todoapp_profile_picture", storageData);
        sessionStorage.setItem("todoapp_profile_picture_session", storageData);
        console.log("Saved profile picture to browser storage immediately");
      } catch (storageError) {
        console.error("Error saving to browser storage:", storageError);
      }

      // Update Firebase Auth immediately for better persistence
      try {
        await updateProfile(auth.currentUser, { photoURL: downloadURL });
        console.log("Updated Firebase Auth profile immediately");
      } catch (authError) {
        console.error("Error updating Firebase Auth immediately:", authError);
      }

      // Use our utility function to save the profile picture to all persistence mechanisms
      // Try multiple times if needed to ensure it's saved
      let success = false;
      let attempts = 0;
      const maxAttempts = 5; // Increased max attempts for better reliability

      while (!success && attempts < maxAttempts) {
        attempts++;
        console.log(`Attempt ${attempts} to save profile picture`);
        success = await saveProfilePicture(auth.currentUser, downloadURL);

        if (!success && attempts < maxAttempts) {
          // Wait a bit longer between retries
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      if (!success) {
        console.error("Failed to save profile picture after multiple attempts");
        // Try one more direct approach to ensure persistence
        try {
          // 1. Update Firestore directly
          const userProfileRef = doc(db, "userProfiles", auth.currentUser.uid);
          await setDoc(
            userProfileRef,
            {
              userId: auth.currentUser.uid,
              photoURL: downloadURL,
              updatedAt: serverTimestamp(),
              lastUpdated: new Date().toISOString(), // Add a regular date for easier debugging
            },
            { merge: true }
          );

          // 2. Also save to backup collection
          const backupRef = doc(db, "userBackups", auth.currentUser.uid);
          await setDoc(
            backupRef,
            {
              profilePicture: downloadURL,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );

          // 3. Update Auth profile directly
          await updateProfile(auth.currentUser, { photoURL: downloadURL });

          // 4. Force reload the user
          await auth.currentUser.reload();

          // 5. Verify the update was successful
          if (auth.currentUser.photoURL !== downloadURL) {
            console.warn(
              "Auth profile picture not updated correctly, trying again"
            );
            await updateProfile(auth.currentUser, { photoURL: downloadURL });
            await auth.currentUser.reload();
          }

          success = true;
          console.log("Used direct approach to save profile picture");
        } catch (directError) {
          console.error("Direct approach also failed:", directError);
        }
      } else {
        console.log(
          "Successfully saved profile picture after",
          attempts,
          "attempts"
        );
      }

      // Update local state with the final URL
      setProfilePicture(downloadURL);
      setUploadSuccess(true);

      // Clear the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      // Final verification step - check if the profile picture was saved correctly
      try {
        // Reload the user to get the latest data
        await auth.currentUser.reload();

        // Check if the photoURL was updated correctly
        if (auth.currentUser.photoURL !== downloadURL) {
          console.warn(
            "Final verification: photoURL not updated correctly in Firebase Auth"
          );

          // Try one more time
          await updateProfile(auth.currentUser, { photoURL: downloadURL });
          await auth.currentUser.reload();

          if (auth.currentUser.photoURL === downloadURL) {
            console.log(
              "Final verification: photoURL updated successfully after retry"
            );
          } else {
            console.error(
              "Final verification: photoURL still not updated correctly"
            );

            // Save to localStorage as a fallback
            const storageData = JSON.stringify({
              photoURL: downloadURL,
              userId: auth.currentUser.uid,
              timestamp: Date.now(),
            });
            localStorage.setItem("todoapp_profile_picture_final", storageData);
          }
        } else {
          console.log(
            "Final verification: photoURL updated correctly in Firebase Auth"
          );
        }
      } catch (verificationError) {
        console.error("Error during final verification:", verificationError);
      }

      // Clear success message after 3 seconds
      setTimeout(() => {
        setUploadSuccess(false);
      }, 3000);

      console.log("Profile picture updated successfully");
    } catch (error) {
      console.error("Error uploading profile picture:", error);
      setUploadError("Failed to upload profile picture. Please try again.");

      // Revert to previous profile picture if there's an error
      if (auth.currentUser.photoURL) {
        setProfilePicture(auth.currentUser.photoURL);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const toggleDarkMode = () => {
    const newDarkMode = !darkMode;
    setDarkMode(newDarkMode); // Update UI immediately for better UX

    console.log("Toggling dark mode to:", newDarkMode);

    // Save to localStorage immediately for better persistence
    try {
      localStorage.setItem("todoapp_dark_mode", newDarkMode ? "true" : "false");
      console.log("Saved dark mode preference to localStorage:", newDarkMode);
    } catch (error) {
      console.error(
        "Error saving dark mode preference to localStorage:",
        error
      );
    }

    // Then save to Firestore (don't use await to avoid potential issues)
    savePreferenceWithFallback("darkMode", newDarkMode)
      .then(() => console.log("Saved dark mode preference to Firestore"))
      .catch((error) =>
        console.error("Error saving dark mode preference to Firestore:", error)
      );
  };

  const changeFontSize = async (size) => {
    setFontSize(size); // Update UI immediately for better UX

    console.log("Changing font size to:", size);

    await savePreferenceWithFallback("fontSize", size);
  };

  const toggleAutoSort = async () => {
    const newValue = !autoSortTasks;
    setAutoSortTasks(newValue); // Update UI immediately for better UX

    console.log("Toggling auto-sort to:", newValue);

    await savePreferenceWithFallback("autoSortTasks", newValue);

    // If auto-sort is enabled, re-sort the todos
    if (newValue) {
      // The onSnapshot will handle the re-sorting automatically
      console.log("Auto-sort enabled, todos will be sorted automatically");
    }
  };

  const toggleDueDateReminders = async () => {
    const newValue = !dueDateReminders;
    setDueDateReminders(newValue); // Update UI immediately for better UX

    console.log("Toggling due date reminders to:", newValue);

    await savePreferenceWithFallback("dueDateReminders", newValue);

    if (newValue) {
      console.log("Due date reminders enabled");
      // In a real app, we would set up notification listeners here
    } else {
      console.log("Due date reminders disabled");
      // In a real app, we would remove notification listeners here
    }
  };

  const changeReminderTime = async (time) => {
    setReminderTime(time); // Update UI immediately for better UX

    console.log("Changing reminder time to:", time);

    await savePreferenceWithFallback("reminderTime", time);
  };

  const exportTasksToCSV = () => {
    try {
      // Create CSV content
      let csvContent = "ID,Text,Category,Due Date,Completed\n";

      todos.forEach((todo) => {
        const dueDate = todo.dueDate
          ? todo.dueDate.toISOString().split("T")[0]
          : "";
        csvContent += `${todo.id},"${todo.text.replace(/"/g, '""')}",${
          todo.category
        },${dueDate},${todo.completed}\n`;
      });

      // Create a blob and download link
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute(
        "download",
        `todo-tasks-${new Date().toISOString().split("T")[0]}.csv`
      );
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      console.log("Tasks exported to CSV successfully");
    } catch (error) {
      console.error("Error exporting tasks to CSV:", error);
    }
  };

  const clearCompletedTasks = async () => {
    try {
      const completedTodos = todos.filter((todo) => todo.completed);

      if (completedTodos.length === 0) {
        console.log("No completed tasks to clear");
        return;
      }

      // Optimistic UI update
      setTodos((prevTodos) => prevTodos.filter((todo) => !todo.completed));

      // Delete from Firestore
      const batch = writeBatch(db);
      completedTodos.forEach((todo) => {
        const todoRef = doc(db, "todos", todo.id);
        batch.delete(todoRef);
      });

      await batch.commit();
      console.log(
        `${completedTodos.length} completed tasks cleared successfully`
      );
    } catch (error) {
      console.error("Error clearing completed tasks:", error);
      // Reload todos in case of error
      const q = query(
        collection(db, "todos"),
        where("userId", "==", auth.currentUser.uid),
        orderBy("category"),
        orderBy("dueDate", "asc")
      );

      const snapshot = await getDocs(q);
      setTodos(
        snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          dueDate: doc.data().dueDate ? doc.data().dueDate.toDate() : null,
        }))
      );
    }
  };

  const filteredTodos = todos.filter((todo) =>
    filterCategory === "All" ? true : todo.category === filterCategory
  );

  const groupedTodos = filteredTodos.reduce((acc, todo) => {
    const category = todo.category;
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(todo);
    return acc;
  }, {});

  const currentDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div
      className={`todo-page ${
        darkMode ? "dark-mode" : ""
      } font-size-${fontSize}`}
    >
      {/* Global file input for profile picture uploads */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        style={{ display: "none" }}
      />
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarExpanded ? "expanded" : ""}`}>
        <div className="sidebar-header">
          <div className="app-logo">
            <div className="logo-icon">📝</div>
            {sidebarExpanded && <span className="logo-text">TaskMaster</span>}
          </div>
          <button className="sidebar-close" onClick={toggleSidebar}>
            ✕
          </button>
        </div>

        <div className="sidebar-scrollable-area">
          <div className="sidebar-user">
            <div className="profile-picture-container">
              <div
                className="profile-picture-wrapper"
                onClick={handleProfilePictureClick}
                style={{ cursor: "pointer" }}
              >
                <img
                  src={profilePicture}
                  alt="Profile"
                  className="profile-picture"
                  onError={(e) => {
                    e.target.src =
                      "https://ui-avatars.com/api/?name=" +
                      encodeURIComponent(username) +
                      "&background=random";
                  }}
                />

                {sidebarExpanded && (
                  <div className="profile-picture-edit-hint">
                    <span>Click to change (instant upload)</span>
                  </div>
                )}
              </div>
            </div>
            {sidebarExpanded && (
              <div className="user-info">
                <h3 className="user-name">{username}</h3>
                <p className="user-email">{userEmail}</p>
              </div>
            )}
          </div>

          <nav className="sidebar-menu">
            <div className="menu-section">
              {sidebarExpanded && <h4 className="menu-title">Categories</h4>}
              <div className="menu-items">
                <button
                  className={`menu-item ${
                    filterCategory === "All" ? "active" : ""
                  }`}
                  onClick={() => setFilterCategory("All")}
                >
                  <span className="menu-icon">📋</span>
                  {sidebarExpanded && (
                    <span className="menu-label">All Tasks</span>
                  )}
                </button>
                {Object.keys(CATEGORY_COLORS).map((category) => (
                  <button
                    key={category}
                    className={`menu-item ${
                      filterCategory === category ? "active" : ""
                    }`}
                    onClick={() => setFilterCategory(category)}
                  >
                    <span
                      className="category-dot"
                      style={{ backgroundColor: CATEGORY_COLORS[category] }}
                    ></span>
                    {sidebarExpanded && (
                      <span className="menu-label">{category}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </nav>
        </div>

        <div className="sidebar-footer">
          <button className="menu-item" onClick={toggleProfilePanel}>
            <span className="menu-icon">⚙️</span>
            {sidebarExpanded && <span className="menu-label">Settings</span>}
          </button>
          <button className="menu-item" onClick={handleLogout}>
            <span className="menu-icon">🚪</span>
            {sidebarExpanded && <span className="menu-label">Logout</span>}
          </button>
        </div>
      </aside>

      {/* Settings Panel */}
      {profilePanelOpen && (
        <div className="panel-overlay" onClick={toggleProfilePanel}>
          <div
            className={`profile-side-panel ${profilePanelOpen ? "open" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-header">
              <h2>App Settings</h2>
              <button className="close-panel-btn" onClick={toggleProfilePanel}>
                ✕
              </button>
            </div>
            <div className="profile-content">
              <h3 className="settings-section-title">Display Settings</h3>

              <div className="preference-item">
                <span className="preference-label">Dark Mode</span>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={darkMode}
                    onChange={toggleDarkMode}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="preference-item">
                <span className="preference-label">Font Size</span>
                <div className="font-size-options">
                  <button
                    className={fontSize === "small" ? "active" : ""}
                    onClick={() => changeFontSize("small")}
                  >
                    S
                  </button>
                  <button
                    className={fontSize === "medium" ? "active" : ""}
                    onClick={() => changeFontSize("medium")}
                  >
                    M
                  </button>
                  <button
                    className={fontSize === "large" ? "active" : ""}
                    onClick={() => changeFontSize("large")}
                  >
                    L
                  </button>
                </div>
              </div>

              <h3 className="settings-section-title">Task Management</h3>

              <div className="preference-item">
                <span className="preference-label">Default Category</span>
                <select
                  className="settings-select"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                >
                  <option value="Work">Work</option>
                  <option value="Personal">Personal</option>
                  <option value="Shopping">Shopping</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="preference-item">
                <span className="preference-label">Auto-sort Tasks</span>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={autoSortTasks}
                    onChange={toggleAutoSort}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <h3 className="settings-section-title">Notifications</h3>

              <div className="preference-item">
                <span className="preference-label">Due Date Reminders</span>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={dueDateReminders}
                    onChange={toggleDueDateReminders}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="preference-item">
                <span className="preference-label">Reminder Time</span>
                <select
                  className="settings-select"
                  value={reminderTime}
                  onChange={(e) => changeReminderTime(e.target.value)}
                >
                  <option value="1 day before">1 day before</option>
                  <option value="12 hours before">12 hours before</option>
                  <option value="1 hour before">1 hour before</option>
                  <option value="30 minutes before">30 minutes before</option>
                </select>
              </div>

              <h3 className="settings-section-title">Data Management</h3>

              <div className="preference-item">
                <span className="preference-label">Export Tasks</span>
                <button
                  className="settings-action-button"
                  onClick={exportTasksToCSV}
                >
                  Export CSV
                </button>
              </div>

              <div className="preference-item">
                <span className="preference-label">Clear Completed Tasks</span>
                <button
                  className="settings-action-button settings-danger-button"
                  onClick={clearCompletedTasks}
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="main-content">
        <div className="content-header">
          <div className="header-left">
            {!sidebarExpanded && (
              <button className="sidebar-toggle" onClick={toggleSidebar}>
                ☰
              </button>
            )}
            <div className="header-welcome">
              <img
                src={profilePicture}
                alt="Profile"
                className="header-profile-pic"
                onError={(e) => {
                  e.target.src =
                    "https://ui-avatars.com/api/?name=" +
                    encodeURIComponent(username) +
                    "&background=random";
                }}
              />
              <div>
                <h1 className="page-title">{username}</h1>
                <p className="date-display">{currentDate}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="add-task-container">
          <form className="add-task-form" onSubmit={handleAddTodo}>
            <div className="form-row">
              <input
                type="text"
                className="task-input"
                placeholder="Add a new task..."
                value={newTodo}
                onChange={(e) => setNewTodo(e.target.value)}
                required
              />
              <button type="submit" className="add-task-btn">
                +
              </button>
            </div>
            <div className="task-details">
              <div className="select-wrapper">
                <select
                  className="category-select"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                >
                  {Object.keys(CATEGORY_COLORS).map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
              <input
                type="date"
                className="task-input"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
              />
            </div>
          </form>
        </div>

        <div className="tasks-container">
          {Object.keys(groupedTodos).length > 0 ? (
            Object.entries(groupedTodos).map(([category, categoryTodos]) => (
              <div key={category} className="category-section">
                <div className="category-header">
                  <h3 className="category-title">{category}</h3>
                  <div className="category-indicator">
                    <span
                      className="category-dot"
                      style={{ backgroundColor: CATEGORY_COLORS[category] }}
                    ></span>
                  </div>
                  <span className="task-count">
                    {categoryTodos.length} tasks
                  </span>
                </div>
                <div className="tasks-list">
                  {categoryTodos.map((todo) => (
                    <div
                      key={todo.id}
                      className={`task-item ${
                        todo.completed ? "completed" : ""
                      }`}
                    >
                      <div className="task-content">
                        <div className="task-checkbox-container">
                          <input
                            type="checkbox"
                            className="task-checkbox"
                            checked={todo.completed}
                            onChange={() => toggleCompleted(todo)}
                          />
                          <span className="custom-checkbox">
                            <span className="checkmark">✓</span>
                          </span>
                        </div>
                        <div className="task-details">
                          <span className="task-text">{todo.text}</span>
                          {todo.dueDate && (
                            <span className="task-due-date">
                              <span className="due-icon">📅</span>
                              {todo.dueDate.toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="task-actions">
                        <button
                          className="task-action edit-btn"
                          onClick={() => openEditModal(todo)}
                        >
                          ✏️
                        </button>
                        <button
                          className="task-action delete-btn"
                          onClick={() => handleDeleteTodo(todo.id)}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <div className="empty-icon">📝</div>
              <h3>No tasks yet!</h3>
              <p>Start by adding your first task above.</p>
            </div>
          )}
        </div>
      </main>

      {/* Edit Modal */}
      {modalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Task</h2>
              <button className="modal-close-btn" onClick={closeModal}>
                ✕
              </button>
            </div>
            <form className="modal-form" onSubmit={handleUpdateTodo}>
              <div className="form-group">
                <label>Task:</label>
                <input
                  type="text"
                  className="modal-input"
                  value={editTodo?.text || ""}
                  onChange={(e) =>
                    setEditTodo({ ...editTodo, text: e.target.value })
                  }
                  required
                />
              </div>
              <div className="form-group">
                <label>Category:</label>
                <select
                  className="modal-input"
                  value={editTodo?.category || "Work"}
                  onChange={(e) =>
                    setEditTodo({ ...editTodo, category: e.target.value })
                  }
                >
                  {Object.keys(CATEGORY_COLORS).map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Due Date:</label>
                <input
                  type="date"
                  className="modal-input"
                  value={
                    editTodo?.dueDate
                      ? editTodo.dueDate.toISOString().split("T")[0]
                      : ""
                  }
                  onChange={(e) =>
                    setEditTodo({ ...editTodo, dueDate: e.target.value })
                  }
                />
              </div>
              <div className="modal-buttons">
                <button type="submit" className="save-btn">
                  Save Changes
                </button>
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={closeModal}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Todo;
