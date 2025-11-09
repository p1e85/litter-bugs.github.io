import { state } from './config.js';
import { initializeMap, changeMapStyle, centerOnRoute } from './map.js';
import { initializeAuthListener, handleSignUp, handleLogIn, handleLogOut, handleAccountDeletion } from './auth.js';
import { findMe, toggleTracking, startTracking, handlePhoto, shareCleanupResults, resetFindMeState } from './tracking.js';
import { saveSession, loadSession, exportGeoJSON } from './data.js';
import {
    toggleCommunityView,
    publishRoute,
    populatePublishedRoutesList,
    loadProfileForEditing,
    saveProfile,
    fetchAndDisplayLeaderboard,
    fetchAndDisplayMyStats,
    showPublicProfile,
    handleMeetupSubmit,
    validateMeetupForm
} from './community.js';

// --- DOM Element Selection ---
const elements = {
    // Modals
    termsModal: document.getElementById('termsModal'),
    authModal: document.getElementById('authModal'),
    dataModal: document.getElementById('dataModal'),
    sessionsModal: document.getElementById('sessionsModal'),
    localSessionsModal: document.getElementById('localSessionsModal'),
    infoModal: document.getElementById('infoModal'),
    publishedRoutesModal: document.getElementById('publishedRoutesModal'),
    profileModal: document.getElementById('profileModal'),
    publicProfileModal: document.getElementById('publicProfileModal'),
    safetyModal: document.getElementById('safetyModal'),
    summaryModal: document.getElementById('summaryModal'),
    leaderboardModal: document.getElementById('leaderboardModal'),
    achievementModal: document.getElementById('achievementModal'),
    meetupModal: document.getElementById('meetupModal'),
    viewMeetupsModal: document.getElementById('viewMeetupsModal'),
    menuModal: document.getElementById('menuModal'),
communityChallengeBtn: document.getElementById('communityChallengeBtn'),
challengeModal: document.getElementById('challengeModal'),
addChallengeBtn: document.getElementById('addChallengeBtn'),
currentChallengesTab: document.getElementById('currentChallengesTab'),
pastChallengesTab: document.getElementById('pastChallengesTab'),       

    // Buttons
    agreeBtn: document.getElementById('agreeBtn'),
    skipBtn: document.getElementById('skipBtn'),
    findMeBtn: document.getElementById('findMeBtn'),
    trackBtn: document.getElementById('trackBtn'),
    pictureBtn: document.getElementById('pictureBtn'),
    dataBtn: document.getElementById('dataBtn'),
    saveBtn: document.getElementById('saveBtn'),
    loadBtn: document.getElementById('loadBtn'),
    exportBtn: document.getElementById('exportBtn'),
    communityBtn: document.getElementById('communityBtn'),
    publishBtn: document.getElementById('publishBtn'),
    loginSignupBtn: document.getElementById('loginSignupBtn'),
    infoBtn: document.getElementById('infoBtn'),
    authActionBtn: document.getElementById('authActionBtn'),
    managePublicationsBtn: document.getElementById('managePublicationsBtn'),
    editProfileBtn: document.getElementById('editProfileBtn'),
    saveProfileBtn: document.getElementById('saveProfileBtn'),
    deleteAccountBtn: document.getElementById('deleteAccountBtn'),
    safetyModalOkBtn: document.getElementById('safetyModalOkBtn'),
    changeStyleBtn: document.getElementById('changeStyleBtn'),
    centerOnRouteBtn: document.getElementById('centerOnRouteBtn'),
    summaryOkBtn: document.getElementById('summaryOkBtn'),
    leaderboardBtn: document.getElementById('leaderboardBtn'),
    achievementOkBtn: document.getElementById('achievementOkBtn'),
    createMeetupBtn: document.getElementById('createMeetupBtn'),
    shareBtn: document.getElementById('shareBtn'),
    menuBtn: document.getElementById('menuBtn'),
    logoutBtn: document.getElementById('logoutBtn'),

    // Inputs & Forms
    cameraInput: document.getElementById('cameraInput'),
    termsCheckbox: document.getElementById('termsCheckbox'),
    ageCheckbox: document.getElementById('ageCheckbox'),
    emailInput: document.getElementById('emailInput'),
    passwordInput: document.getElementById('passwordInput'),
    usernameInput: document.getElementById('usernameInput'),
    safetyCheckbox: document.getElementById('safetyCheckbox'),
    meetupTitleInput: document.getElementById('meetupTitleInput'),
    meetupDescriptionInput: document.getElementById('meetupDescriptionInput'),

    // Links & Other
    viewTermsLink: document.getElementById('viewTermsLink'),
    leaderboardTabs: document.querySelectorAll('.leaderboard-tab'),
    leaderboardList: document.getElementById('leaderboardList'),

    summaryModal: document.getElementById('summaryModal'),
    summaryOkBtn: document.getElementById('summaryOkBtn'),
};

// --- Initializer ---

/**
 * Main initializer for the entire UI.
 */
export function initializeUI() {
    initializeMap();
    
    // Listen for user map interaction to reset the "Find Me" state
    state.map.on('dragstart', (e) => { if (e.originalEvent) resetFindMeState(); });
    state.map.on('zoomstart', (e) => { if (e.originalEvent) resetFindMeState(); });

    initializeAuthListener();
    attachEventListeners();

    if (sessionStorage.getItem('termsAccepted')) {
        elements.termsModal.style.display = 'none';
        document.getElementById('userStatus').style.display = 'flex';
    } else {
        elements.termsModal.style.display = 'flex';
    }
}

// --- Event Listeners *******************

/**
 * Attaches all event listeners to the DOM elements.
 */
function attachEventListeners() {
    // --- Auth Flow & Terms ---
    elements.termsCheckbox.addEventListener('change', () => elements.agreeBtn.disabled = !elements.termsCheckbox.checked);
    elements.agreeBtn.addEventListener('click', () => {
        elements.termsModal.style.display = 'none';
        sessionStorage.setItem('termsAccepted', 'true');
        document.getElementById('userStatus').style.display = 'flex';
        if (!state.currentUser) elements.authModal.style.display = 'flex';
    });
    elements.loginSignupBtn.addEventListener('click', () => elements.authModal.style.display = 'flex');
    elements.skipBtn.addEventListener('click', () => elements.authModal.style.display = 'none');
    elements.authModal.addEventListener('click', (e) => {
        if (e.target.id === 'switchAuthModeLink') {
            e.preventDefault();
            state.isSignUpMode = !state.isSignUpMode;
            updateAuthModalUI();
        }
    });
elements.authActionBtn.addEventListener('click', async (event) => { 
    event.preventDefault();
   if (state.isSignUpMode) await handleSignUp();
    else await handleLogIn();
});
    elements.logoutBtn.addEventListener('click', handleLogOut);
    elements.emailInput.addEventListener('input', validateSignUpForm);
    elements.passwordInput.addEventListener('input', validateSignUpForm);
    elements.usernameInput.addEventListener('input', validateSignUpForm);
    elements.ageCheckbox.addEventListener('change', validateSignUpForm);
    elements.deleteAccountBtn.addEventListener('click', handleAccountDeletion);

    // --- Main Map & Menu Controls ---


// --- Community Challenge Modal Listeners ---
if (elements.communityChallengeBtn) {
    elements.communityChallengeBtn.addEventListener('click', () => {
        elements.challengeModal.style.display = 'flex';
        elements.menuModal.style.display = 'none';
        // We will call a function here to load the challenges
        // fetchAndDisplayChallenges(); // <-- We'll create this next
    });
}

if (elements.currentChallengesTab) {
    elements.currentChallengesTab.addEventListener('click', () => {
        document.getElementById('currentChallengesContent').style.display = 'block';
        document.getElementById('pastChallengesContent').style.display = 'none';
        elements.currentChallengesTab.classList.add('active');
        elements.pastChallengesTab.classList.remove('active');
    });
}

if (elements.pastChallengesTab) {
    elements.pastChallengesTab.addEventListener('click', () => {
        document.getElementById('currentChallengesContent').style.display = 'none';
        document.getElementById('pastChallengesContent').style.display = 'block';
        elements.currentChallengesTab.classList.remove('active');
        elements.pastChallengesTab.classList.add('active');
    });
}
// --- End of Challenge Modal Listeners ---
    elements.findMeBtn.addEventListener('click', findMe);
    elements.trackBtn.addEventListener('click', toggleTracking);
    elements.pictureBtn.addEventListener('click', () => elements.cameraInput.click());
    elements.cameraInput.addEventListener('change', handlePhoto);
    elements.changeStyleBtn.addEventListener('click', changeMapStyle);
    elements.communityBtn.addEventListener('click', toggleCommunityView);
    elements.menuBtn.addEventListener('click', () => elements.menuModal.style.display = 'flex');
    elements.infoBtn.addEventListener('click', () => elements.infoModal.style.display = 'flex');
    elements.viewTermsLink.addEventListener('click', (e) => {
        e.preventDefault();
        elements.infoModal.style.display = 'none';
        elements.termsModal.style.display = 'flex';
    });
    elements.safetyModalOkBtn.addEventListener('click', () => {
        elements.safetyModal.style.display = 'none';
        startTracking();
    });

    // --- [FIXED] This is the corrected block ---
    elements.summaryOkBtn.addEventListener('click', () => { 
        elements.summaryModal.style.display = 'none';
        document.getElementById('cleanupPhotoPreviewContainer').style.display = 'none';
        document.getElementById('cleanupPhotoPreview').src = '#';
    });
    // --- End of fix ---

    // --- Data Management (Save, Load, Export) ---
    elements.dataBtn.addEventListener('click', () => {
        const hasRoute = state.routeCoordinates.length > 0 || state.photoPins.length > 0;
        elements.menuModal.style.display = 'none';
        elements.centerOnRouteBtn.classList.toggle('disabled', !hasRoute);
        elements.dataModal.style.display = 'flex';
    });
    elements.saveBtn.addEventListener('click', saveSession);
    elements.loadBtn.addEventListener('click', () => {
        elements.dataModal.style.display = 'none';
        loadSession();
    });
    elements.exportBtn.addEventListener('click', exportGeoJSON);
    elements.centerOnRouteBtn.addEventListener('click', () => {
        if (elements.centerOnRouteBtn.classList.contains('disabled')) {
            alert("Please load a route first to use this feature.");
        } else {
            centerOnRoute();
            elements.dataModal.style.display = 'none';
        }
    });
    elements.publishBtn.addEventListener('click', publishRoute);

    // --- Profile & Publications ---
    elements.managePublicationsBtn.addEventListener('click', () => {
        if (!state.currentUser) { alert("You must be logged in to manage your publications."); return; }
        elements.dataModal.style.display = 'none';
        populatePublishedRoutesList();
        elements.publishedRoutesModal.style.display = 'flex';
    });
    elements.editProfileBtn.addEventListener('click', () => {
        if (!state.currentUser) { alert("You must be logged in to edit your profile."); return; }
        elements.menuModal.style.display = 'none'; // Close menu
        loadProfileForEditing();
        elements.profileModal.style.display = 'flex';
    });
    elements.saveProfileBtn.addEventListener('click', saveProfile);

    // --- Leaderboard & Stats ---
    elements.leaderboardBtn.addEventListener('click', () => {
        elements.leaderboardModal.style.display = 'flex';
        document.getElementById('leaderboardList').style.display = 'block';
        document.getElementById('myStatsContainer').style.display = 'none';
        elements.leaderboardTabs.forEach(t => t.classList.remove('active'));
        document.querySelector('.leaderboard-tab[data-metric="totalPins"]').classList.add('active');
        fetchAndDisplayLeaderboard('totalPins');
    });
    elements.leaderboardTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            elements.leaderboardTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const isMyStats = tab.id === 'myStatsBtn';
            document.getElementById('leaderboardList').style.display = isMyStats ? 'none' : 'block';
            document.getElementById('myStatsContainer').style.display = isMyStats ? 'block' : 'none';
            if (isMyStats) { fetchAndDisplayMyStats(); }
            else { fetchAndDisplayLeaderboard(tab.dataset.metric); }
        });
    });
    elements.leaderboardList.addEventListener('click', (e) => {
        if (e.target && e.target.classList.contains('leaderboard-profile-link')) {
            e.preventDefault();
            const userId = e.target.closest('li').dataset.userid;
            if (userId) {
                elements.leaderboardModal.style.display = 'none';
                showPublicProfile(userId);
            }
        }
    });

    // --- LOGIC FOR CLEANUP PHOTO ---
    // (This includes the modifications from our previous conversation)
    const addCleanupPhotoBtn = document.getElementById('addCleanupPhotoBtn');
    const cleanupCameraInput = document.getElementById('cleanupCameraInput');
    const photoPreviewContainer = document.getElementById('cleanupPhotoPreviewContainer');
    const photoPreview = document.getElementById('cleanupPhotoPreview');

    if (addCleanupPhotoBtn) { // Safety check
        addCleanupPhotoBtn.addEventListener('click', () => {
            cleanupCameraInput.click(); // Trigger the hidden camera input
        });
    }

if (cleanupCameraInput) { // Safety check
    // --- ADD 'async' HERE ---
    cleanupCameraInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        
        if (file) {
            // --- Add the compression logic ---
            const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1280 };
            let compressedFile;
            try {
                // 'await' now works because the function is 'async'
                compressedFile = await imageCompression(file, options);
            } catch (error) {
                console.error("Compression error:", error);
                compressedFile = file; // Fallback to original
            }
            
            // --- Store the COMPRESSED file in our global state ---
            state.cleanupPhoto = compressedFile; 
            
            // --- Show a thumbnail preview of the COMPRESSED file ---
            const objectURL = URL.createObjectURL(compressedFile); // <-- FIX 2
            photoPreview.src = objectURL;
            
            // Use 'flex' to allow for CSS centering
            photoPreviewContainer.style.display = 'flex';
            
            // Clear the input value so the same file can be selected again
            event.target.value = '';
            
        } else {
            // User canceled the file picker
            state.cleanupPhoto = null;
            photoPreview.src = '#';
            photoPreviewContainer.style.display = 'none';
        }
        });
    }

    // --- Meetups ---
    elements.safetyCheckbox.addEventListener('change', validateMeetupForm);
    elements.meetupTitleInput.addEventListener('input', validateMeetupForm);
    elements.meetupDescriptionInput.addEventListener('input', validateMeetupForm);
    elements.createMeetupBtn.addEventListener('click', handleMeetupSubmit);

    // --- General/Global Listeners ---
    elements.shareBtn.addEventListener('click', shareCleanupResults);
    addAllModalCloseListeners();
}  //end of event listerner! ***************


/**
 * Adds listeners to close modals when clicking the close button or outside the modal content.
 */
function addAllModalCloseListeners() {
    const allModals = Object.values(elements).filter(el => el && el.classList && el.classList.contains('modal-overlay'));
    allModals.forEach(modal => {
        const closeBtn = modal.querySelector('.close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => modal.style.display = 'none');
        }
        const okBtn = modal.querySelector('.ok-btn');
        if (okBtn) {
            okBtn.addEventListener('click', () => modal.style.display = 'none');
        }
    });

    window.addEventListener('click', (event) => {
        if (event.target.classList.contains('modal-overlay')) {
            event.target.style.display = 'none';
        }
    });
}

// --- UI Update Functions ---

/**
 * Updates the UI to reflect the user's login status.
 */
export function updateLoggedInStatusUI(isLoggedIn, username = '') {
    const userStatus = document.getElementById('userStatus');
    const loggedInContent = document.getElementById('loggedInContent');
    const guestContent = document.getElementById('guestContent');
    const userEmailSpan = document.getElementById('userEmail');

    if (userStatus) userStatus.style.display = 'flex';

    if (isLoggedIn) {
        if (userEmailSpan) userEmailSpan.textContent = `Logged in as: ${username}`;
        if (loggedInContent) loggedInContent.style.display = 'flex';
        if (guestContent) guestContent.style.display = 'none';
        if (elements.authModal) elements.authModal.style.display = 'none';
        if (elements.publishBtn) elements.publishBtn.style.display = 'block';
        if (elements.managePublicationsBtn) elements.managePublicationsBtn.style.display = 'block';
        if (elements.editProfileBtn) elements.editProfileBtn.style.display = 'block';
    } else {
        if (loggedInContent) loggedInContent.style.display = 'none';
        if (guestContent) guestContent.style.display = 'block';
        if (elements.publishBtn) elements.publishBtn.style.display = 'none';
        if (elements.managePublicationsBtn) elements.managePublicationsBtn.style.display = 'none';
        if (elements.editProfileBtn) elements.editProfileBtn.style.display = 'none';
    }
}

/**
 * Toggles the auth modal between Sign Up and Log In modes.
 */
export function updateAuthModalUI() {
    const authForm = document.getElementById('authForm');
    const authTitle = document.getElementById('authTitle');
    const authSubtitle = document.getElementById('authSubtitle');
    document.getElementById('authError').textContent = '';

    if (state.isSignUpMode) {
        authTitle.textContent = 'Create a Litter Bugs Account';
        authSubtitle.innerHTML = 'Or <a href="#" id="switchAuthModeLink">log in to an existing account.</a>';
        elements.authActionBtn.textContent = 'Sign Up';
        authForm.classList.add('signup-mode');
        authForm.classList.remove('login-mode');
    } else {
        authTitle.textContent = 'Log In to Litter Bugs';
        authSubtitle.innerHTML = 'Or <a href="#" id="switchAuthModeLink">create a new account.</a>';
        elements.authActionBtn.textContent = 'Log In';
        authForm.classList.add('login-mode');
        authForm.classList.remove('signup-mode');
    }
    validateSignUpForm();
}

/**
 * Validates the sign-up/login form and enables/disables the action button.
 */
function validateSignUpForm() {
    const isEmailValid = elements.emailInput.value.includes('@');
    const isPasswordValid = elements.passwordInput.value.length >= 6;
    const isUsernameValid = elements.usernameInput.value.trim().length >= 3;
    const isAgeChecked = elements.ageCheckbox.checked;

    if (state.isSignUpMode) {
        elements.authActionBtn.disabled = !(isEmailValid && isPasswordValid && isUsernameValid && isAgeChecked);
    } else {
        elements.authActionBtn.disabled = !(isEmailValid && isPasswordValid);
    }
}
