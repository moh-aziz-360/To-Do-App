import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../firebase";
import { updateProfile, getAuth } from "firebase/auth";

// Constants
const PROFILE_PIC_STORAGE_KEY = "todoapp_profile_picture";
const PROFILE_PIC_SESSION_KEY = "todoapp_profile_picture_session";
const PROFILE_PIC_COLLECTION = "userProfiles";

// Helper function to save profile picture to all persistence mechanisms
export const saveProfilePicture = async (user, downloadURL) => {
  if (!user || !downloadURL) {
    console.error("Missing user or downloadURL in saveProfilePicture");
    return false;
  }

  try {
    console.log("Saving profile picture to all persistence mechanisms");
    const uid = user.uid;
    let overallSuccess = true;

    // Create a data object for storage
    const storageData = JSON.stringify({
      photoURL: downloadURL,
      userId: uid,
      timestamp: Date.now(),
    });

    // 1. First save to browser storage (fastest and most reliable for immediate use)
    try {
      // Use both localStorage and sessionStorage for redundancy
      localStorage.setItem(PROFILE_PIC_STORAGE_KEY, storageData);
      sessionStorage.setItem(PROFILE_PIC_SESSION_KEY, storageData);
      console.log("Saved profile picture to browser storage");
    } catch (storageError) {
      console.error("Error saving to browser storage:", storageError);
      overallSuccess = false;
    }

    // 2. Save to Firestore (reliable for persistence across sessions)
    try {
      const userProfileRef = doc(db, PROFILE_PIC_COLLECTION, uid);
      await setDoc(
        userProfileRef,
        {
          userId: uid,
          photoURL: downloadURL,
          updatedAt: serverTimestamp(),
          lastUpdated: new Date().toISOString(), // Add a regular date for easier debugging
        },
        { merge: true }
      );
      console.log("Saved profile picture to Firestore");
    } catch (firestoreError) {
      console.error("Error saving to Firestore:", firestoreError);
      overallSuccess = false;
    }

    // 3. Update Firebase Auth profile (important for auth state)
    try {
      // Make sure we're using the most current user object
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("Current user is null when trying to update profile");
      }

      // First, save to localStorage and sessionStorage before updating auth
      // This ensures we have a backup in case the auth update fails
      try {
        const storageData = JSON.stringify({
          photoURL: downloadURL,
          userId: uid,
          timestamp: Date.now(),
        });
        localStorage.setItem("todoapp_profile_picture", storageData);
        sessionStorage.setItem("todoapp_profile_picture_session", storageData);
        console.log(
          "Saved profile picture to browser storage before auth update"
        );
      } catch (storageError) {
        console.error("Error saving to browser storage:", storageError);
      }

      // Now update the auth profile
      await updateProfile(currentUser, {
        photoURL: downloadURL,
      });
      console.log("Updated auth profile with new picture URL");

      // Force a reload of the current user to ensure the photoURL is updated
      try {
        await currentUser.reload();

        // Verify the update was successful
        if (currentUser.photoURL !== downloadURL) {
          console.warn(
            "Auth profile picture not updated correctly after reload, trying again"
          );

          // Try a different approach - get a fresh user object
          await updateProfile(currentUser, { photoURL: downloadURL });
          await currentUser.reload();

          // Check one more time
          if (currentUser.photoURL !== downloadURL) {
            console.error(
              "Failed to update auth profile picture after multiple attempts"
            );

            // Save to localStorage again as a fallback
            try {
              const storageData = JSON.stringify({
                photoURL: downloadURL,
                userId: uid,
                timestamp: Date.now(),
              });
              localStorage.setItem(
                "todoapp_profile_picture_fallback",
                storageData
              );
              console.log(
                "Saved profile picture to fallback storage after auth update failure"
              );
            } catch (storageError) {
              console.error("Error saving to fallback storage:", storageError);
            }

            overallSuccess = false;
          } else {
            console.log(
              "Auth profile picture updated successfully after second attempt"
            );
          }
        } else {
          console.log("Verified auth profile picture was updated correctly");
        }
      } catch (reloadError) {
        console.error("Error reloading user profile:", reloadError);
        overallSuccess = false;
      }
    } catch (authError) {
      console.error("Error updating auth profile:", authError);
      overallSuccess = false;
    }

    // 4. Save to an additional Firestore document for redundancy
    try {
      const backupRef = doc(db, "userBackups", uid);
      await setDoc(
        backupRef,
        {
          profilePicture: downloadURL,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      console.log("Saved profile picture to backup collection");
    } catch (backupError) {
      console.error("Error saving to backup collection:", backupError);
      // This is just extra redundancy, don't affect overall success
    }

    return overallSuccess;
  } catch (error) {
    console.error("Error in saveProfilePicture:", error);
    return false;
  }
};

// Helper function to load profile picture from all possible sources
export const loadProfilePicture = async (user) => {
  if (!user) {
    console.error("No user provided to loadProfilePicture");
    return null;
  }

  console.log("Loading profile picture for user:", user.uid);
  const uid = user.uid;
  let profilePicture = null;
  let source = null;
  let allSources = [];

  // Try to collect profile pictures from all sources
  // We'll check all sources first, then decide which one to use

  // 1. Check backup Firestore collection
  try {
    const backupRef = doc(db, "userBackups", uid);
    const backupDoc = await getDoc(backupRef);

    if (backupDoc.exists() && backupDoc.data().profilePicture) {
      allSources.push({
        url: backupDoc.data().profilePicture,
        source: "FirestoreBackup",
        timestamp: backupDoc.data().updatedAt
          ? backupDoc.data().updatedAt.toMillis()
          : 0,
      });
      console.log("Found profile picture in backup collection");
    }
  } catch (error) {
    console.error("Error checking backup collection:", error);
  }

  // 2. Check main Firestore collection
  try {
    const userProfileRef = doc(db, PROFILE_PIC_COLLECTION, uid);
    const userProfileDoc = await getDoc(userProfileRef);

    if (userProfileDoc.exists() && userProfileDoc.data().photoURL) {
      allSources.push({
        url: userProfileDoc.data().photoURL,
        source: "Firestore",
        timestamp: userProfileDoc.data().updatedAt
          ? userProfileDoc.data().updatedAt.toMillis()
          : 0,
      });
      console.log("Found profile picture in Firestore");
    }
  } catch (error) {
    console.error("Error checking Firestore for profile picture:", error);
  }

  // 3. Check Firebase Auth - give it higher priority by using a future timestamp
  if (user.photoURL) {
    allSources.push({
      url: user.photoURL,
      source: "FirebaseAuth",
      timestamp: Date.now() + 1000000, // Give it higher priority by using a future timestamp
    });
    console.log("Found profile picture in Firebase Auth");
  }

  // 4. Check localStorage
  try {
    const localData = localStorage.getItem(PROFILE_PIC_STORAGE_KEY);
    if (localData) {
      const parsedData = JSON.parse(localData);
      if (parsedData.userId === uid && parsedData.photoURL) {
        allSources.push({
          url: parsedData.photoURL,
          source: "localStorage",
          timestamp: parsedData.timestamp || 0,
        });
        console.log("Found profile picture in localStorage");
      }
    }
  } catch (error) {
    console.error("Error checking localStorage:", error);
  }

  // 5. Check sessionStorage
  try {
    const sessionData = sessionStorage.getItem(PROFILE_PIC_SESSION_KEY);
    if (sessionData) {
      const parsedData = JSON.parse(sessionData);
      if (parsedData.userId === uid && parsedData.photoURL) {
        allSources.push({
          url: parsedData.photoURL,
          source: "sessionStorage",
          timestamp: parsedData.timestamp || 0,
        });
        console.log("Found profile picture in sessionStorage");
      }
    }
  } catch (error) {
    console.error("Error checking sessionStorage:", error);
  }

  // 6. Also check the old sessionStorage key
  try {
    const oldSessionData = sessionStorage.getItem(PROFILE_PIC_STORAGE_KEY);
    if (oldSessionData) {
      const parsedData = JSON.parse(oldSessionData);
      if (parsedData.userId === uid && parsedData.photoURL) {
        allSources.push({
          url: parsedData.photoURL,
          source: "oldSessionStorage",
          timestamp: parsedData.timestamp || 0,
        });
        console.log("Found profile picture in old sessionStorage key");
      }
    }
  } catch (error) {
    console.error("Error checking old sessionStorage key:", error);
  }

  // If we found any sources, use the most recent one
  if (allSources.length > 0) {
    // Sort by timestamp descending (most recent first)
    allSources.sort((a, b) => b.timestamp - a.timestamp);

    // Use the most recent one
    profilePicture = allSources[0].url;
    source = allSources[0].source;

    console.log(
      `Using profile picture from ${source} (most recent of ${allSources.length} sources)`
    );
    console.log(
      "All available sources:",
      allSources.map((s) => s.source).join(", ")
    );

    // Sync this picture to all storage mechanisms for future use
    try {
      // 1. Always update auth
      try {
        await updateProfile(user, { photoURL: profilePicture });
        console.log("Synced profile picture to Firebase Auth");

        // Force a reload of the current user to ensure the photoURL is updated
        if (auth.currentUser) {
          await auth.currentUser.reload();
          console.log("Reloaded user profile to ensure changes are applied");

          // Verify the update was successful
          if (auth.currentUser.photoURL !== profilePicture) {
            console.warn(
              "Auth profile picture not updated correctly, trying again"
            );
            await updateProfile(auth.currentUser, { photoURL: profilePicture });
          }
        }
      } catch (authError) {
        console.error("Error updating auth profile:", authError);
      }

      // 2. Always update Firestore
      try {
        const userProfileRef = doc(db, PROFILE_PIC_COLLECTION, uid);
        await setDoc(
          userProfileRef,
          {
            userId: uid,
            photoURL: profilePicture,
            updatedAt: serverTimestamp(),
            lastUpdated: new Date().toISOString(),
          },
          { merge: true }
        );
        console.log("Synced profile picture to Firestore");
      } catch (firestoreError) {
        console.error("Error updating Firestore:", firestoreError);
      }

      // 3. Always update backup collection
      try {
        const backupRef = doc(db, "userBackups", uid);
        await setDoc(
          backupRef,
          {
            profilePicture: profilePicture,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        console.log("Synced profile picture to backup collection");
      } catch (backupError) {
        console.error("Error updating backup collection:", backupError);
      }

      // 4. Always update browser storage
      try {
        const storageData = JSON.stringify({
          photoURL: profilePicture,
          userId: uid,
          timestamp: Date.now(),
        });

        localStorage.setItem(PROFILE_PIC_STORAGE_KEY, storageData);
        sessionStorage.setItem(PROFILE_PIC_SESSION_KEY, storageData);
        sessionStorage.setItem(PROFILE_PIC_STORAGE_KEY, storageData); // Also update old key for compatibility
        console.log("Synced profile picture to browser storage");
      } catch (storageError) {
        console.error("Error updating browser storage:", storageError);
      }
    } catch (error) {
      console.error("Error syncing profile picture:", error);
      // Continue anyway since we have a valid URL
    }

    return profilePicture;
  }

  // If no picture found in any source, use default
  const defaultPicture =
    "https://ui-avatars.com/api/?name=" +
    encodeURIComponent(user.displayName || "User") +
    "&background=random";

  console.log(
    "No profile picture found in any source, using default:",
    defaultPicture
  );
  return defaultPicture;
};
