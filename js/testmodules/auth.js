import { 
    auth, db, 
    createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
    onAuthStateChanged, deleteUser, sendPasswordResetEmail,
    doc, setDoc, getDoc, serverTimestamp 
} from './firebase.js';
import { state } from './config.js';
import { updateLoggedInStatusUI, checkAdminPermissions, elements } from './ui.js';
import { clearCurrentSession } from './data.js';

/**
 * Listens for Auth state changes and initializes the user dossier.
 */
export function initializeAuthListener() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            state.currentUser = user;
            // PHASE 5 FIX: Standardizing on 'publicProfiles'
            const profileRef = doc(db, "publicProfiles", user.uid);
            const profileSnap = await getDoc(profileRef);

            if (profileSnap.exists()) {
                const profileData = profileSnap.data();
                updateLoggedInStatusUI(true, profileData.username || user.email);
                checkAdminPermissions(profileData);
            } else {
                // Fallback for legacy users missing a profile
                updateLoggedInStatusUI(true, user.email);
            }
        } else {
            state.currentUser = null;
            updateLoggedInStatusUI(false);
        }
    });
}

/**
 * Handles account creation and initializes the Master Dossier.
 */
export async function handleSignUp() {
    const email = elements.emailInput.value.trim();
    const password = elements.passwordInput.value;
    const username = elements.usernameInput.value.trim();

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // PHASE 5 FIX: Initialize the publicProfiles entry immediately
        await setDoc(doc(db, "publicProfiles", user.uid), {
            uid: user.uid,
            email: email,
            username: username,
            bio: "",
            location: "",
            photoURL: "",
            buyMeACoffeeLink: "",
            // Standardized Starting Stats (Miles)
            totalDistance: 0.00,
            totalPins: 0,
            totalRoutes: 0,
            earlyBirdCount: 0,
            nightOwlCount: 0,
            rpRoutesCount: 0,
            // Progression Arrays
            unlockedTitles: ['recruit'], 
            selectedTitle: 'recruit',
            badges: {},
            active_quests: {},
            role: "user",
            joinedAt: serverTimestamp()
        });

        alert("Trooper Registered! Your dossier has been initialized.");
        elements.authModal.style.display = 'none';
    } catch (error) {
        console.error("Signup Error:", error);
        document.getElementById('authError').textContent = error.message;
    }
}

/**
 * Handles secure login and pulls the Master Dossier into state.
 */
export async function handleLogIn() {
    const email = elements.emailInput.value.trim();
    const password = elements.passwordInput.value;

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // Pull profile to ensure it exists
        const profileSnap = await getDoc(doc(db, "publicProfiles", user.uid));
        if (!profileSnap.exists()) {
            console.warn("Dossier missing for user. Initializing legacy recovery...");
            // (Optional: trigger a profile creation here if needed)
        }

        elements.authModal.style.display = 'none';
    } catch (error) {
        console.error("Login Error:", error);
        document.getElementById('authError').textContent = "Access Denied: Check credentials.";
    }
}

export async function handleLogOut() {
    if (confirm("Sign out of the sector? Unsaved mission data will be lost.")) {
        try {
            await signOut(auth);
            clearCurrentSession();
            location.reload(); // Hard reset to clear map state
        } catch (error) {
            console.error("Logout Error:", error);
        }
    }
}

export async function handlePasswordReset() {
    const email = elements.emailInput.value.trim();
    if (!email) return alert("Enter email to reset password.");
    try {
        await sendPasswordResetEmail(auth, email);
        alert("Reset link transmitted to your inbox.");
    } catch (e) { alert("Uplink failed."); }
}

export async function handleAccountDeletion() {
    if (!state.currentUser) return;
    const confirmed = confirm("🚨 DANGER: This will permanently delete your Trooper account and all mission records. Proceed?");
    if (confirmed) {
        try {
            // Delete Dossier first
            await setDoc(doc(db, "publicProfiles", state.currentUser.uid), { status: "DELETED", deletedAt: serverTimestamp() }, { merge: true });
            await deleteUser(state.currentUser);
            alert("Account Terminated.");
            location.reload();
        } catch (error) {
            alert("Security Error: Please re-log in before deleting your account.");
        }
    }
}
