import {
    auth,
    db,
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    deleteUser,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    collection,
    query,
    where,
    getDocs,
    deleteDoc
} from './firebase.js';
import { state } from './config.js';
import { updateAuthModalUI, updateLoggedInStatusUI } from './ui.js';

/**
 * Sets up the listener that responds to changes in the user's login state.
 * This is a core function that updates the UI and application state when a user
 * logs in or out.
 */
export function initializeAuthListener() {
    onAuthStateChanged(auth, async (user) => {
        //console.log('--- onAuthStateChanged listener fired ---');
        if (user) {
            console.log('Listener detected user:', user.uid);
            state.currentUser = user;
            try {
                // Check for and create user profile documents if they don't exist
                const userDocRef = doc(db, "users", user.uid);
                const userDocSnap = await getDoc(userDocRef);
                if (userDocSnap.exists() && userDocSnap.data().totalPins === undefined) {
                    await updateDoc(userDocRef, { totalPins: 0, totalDistance: 0, totalRoutes: 0 });
                }

                const publicProfileRef = doc(db, "publicProfiles", user.uid);
                const publicProfileSnap = await getDoc(publicProfileRef);
                let username;

                if (publicProfileSnap.exists()) {
                    username = publicProfileSnap.data().username;
                } else {
                    //console.log("User profile missing! Creating a default one.");
                    const defaultUsername = user.email.split('@')[0];
                    await setDoc(publicProfileRef, {
                        username: defaultUsername,
                        bio: "This user is new to Litter Bugs!",
                        location: "",
                        buyMeACoffeeLink: "",
                        badges: {},
                        totalPins: 0,
                        totalDistance: 0,
                        totalRoutes: 0
                    });
                    username = defaultUsername;
                }
                // Update the UI to reflect the logged-in state
                updateLoggedInStatusUI(true, username);

            } catch (error) {
                //console.error("Error fetching or updating user profile:", error);
                updateLoggedInStatusUI(false); // Fallback to logged-out state on error
            }
        } else {
            console.log('Listener detected NO user (logged out).');
            state.currentUser = null;
            // Update the UI to reflect the logged-out state
            updateLoggedInStatusUI(false);
        }
    });
}

/**
 * Handles the user sign-up process.
 */
export async function handleSignUp() {
    const email = document.getElementById('emailInput').value;
    const password = document.getElementById('passwordInput').value;
    const username = document.getElementById('usernameInput').value;
    const ageCheckbox = document.getElementById('ageCheckbox');
    const authError = document.getElementById('authError');
    authError.textContent = '';

    if (!ageCheckbox.checked) {
        authError.textContent = 'You must certify that you are 18 or older to sign up.';
        return;
    }
    if (!username || username.trim().length < 3) {
        authError.textContent = 'Username must be at least 3 characters.';
        return;
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const userId = userCredential.user.uid;
        // Create a private user document for sensitive info
        await setDoc(doc(db, "users", userId), {
            email: userCredential.user.email,
            totalPins: 0,
            totalDistance: 0,
            totalRoutes: 0
        });
        // Create a public profile document
        await setDoc(doc(db, "publicProfiles", userId), {
            username,
            bio: "This user is new to Litter Bugs!",
            location: "",
            buyMeACoffeeLink: "",
            badges: {},
            totalPins: 0,
            totalDistance: 0,
            totalRoutes: 0
        });
    } catch (error) {
        authError.textContent = error.message;
    }
}

/**
 * Handles the user login process.
 */
export async function handleLogIn() {
    //console.log('--- handleLogIn function started ---');
    const email = document.getElementById('emailInput').value;
    const password = document.getElementById('passwordInput').value;
    const authError = document.getElementById('authError');
    authError.textContent = '';

try {
    //console.log('Attempting Firebase sign in for:', email); // <-- ADD THIS
    await signInWithEmailAndPassword(auth, email, password);
    //console.log('Firebase sign in successful (or no error thrown)'); // <-- ADD THIS
  } catch (error) {
    //console.error('Firebase sign in failed:', error); // <-- ADD THIS (or confirm it exists)
    authError.textContent = error.message;
  }
}

/**
 * Handles the user logout process.
 */
export async function handleLogOut() {
    try {
        await signOut(auth);
    } catch (error) {
        //console.error("Error signing out:", error);
        alert("Failed to sign out.");
    }
}

/**
 * Handles the permanent deletion of a user's account and all associated data.
 */
export async function handleAccountDeletion() {
    if (!state.currentUser) return;
    if (!confirm("DANGER: Are you absolutely sure you want to permanently delete your account? This action cannot be undone.")) return;
    if (!confirm("All of your private saved sessions and public routes will be deleted forever. Are you still sure?")) return;

    try {
        const userId = state.currentUser.uid;
        //console.log("Starting account deletion for user:", userId);

        // 1. Delete all private sessions
        const privateSessionsQuery = query(collection(db, "users", userId, "privateSessions"));
        const privateSessionsSnapshot = await getDocs(privateSessionsQuery);
        await Promise.all(privateSessionsSnapshot.docs.map(d => deleteDoc(d.ref)));
        //console.log("Private sessions deleted.");

        // 2. Delete all published routes
        const publishedRoutesQuery = query(collection(db, "publishedRoutes"), where("userId", "==", userId));
        const publishedRoutesSnapshot = await getDocs(publishedRoutesQuery);
        await Promise.all(publishedRoutesSnapshot.docs.map(d => deleteDoc(d.ref)));
        //console.log("Published routes deleted.");

        // 3. Delete user documents
        await deleteDoc(doc(db, "users", userId));
        await deleteDoc(doc(db, "publicProfiles", userId));
        //console.log("User documents deleted.");

        // 4. Delete the user from Firebase Authentication
        await deleteUser(state.currentUser);

        alert("Your account and all associated data have been permanently deleted.");
        document.getElementById('profileModal').style.display = 'none';

    } catch (error) {
        //console.error("Error deleting account:", error);
        if (error.code === 'auth/requires-recent-login') {
            alert("This is a sensitive operation. Please log out and log back in to delete your account.");
        } else {
            alert("An error occurred while deleting your account.");
        }
    }
}
