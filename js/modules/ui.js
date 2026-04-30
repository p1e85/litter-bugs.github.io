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
// Note: Some of these might be NULL in the Beta/MVP HTML.
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
    // General Modals
    welcomeModal: document.getElementById('welcomeModal'),
    closeWelcomeBtn: document.getElementById('closeWelcomeBtn'),

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
    if (elements.termsCheckbox) elements.termsCheckbox.addEventListener('change', () => elements.agreeBtn.disabled = !elements.termsCheckbox.checked);
elements.agreeBtn.addEventListener('click', () => {
        elements.termsModal.style.display = 'none';
        sessionStorage.setItem('termsAccepted', 'true');
        document.getElementById('userStatus').style.display = 'flex';
        
        // --- THE NEW ONBOARDING LOGIC ---
        // Check if they have ever seen the welcome screen
        if (!localStorage.getItem('lt_has_seen_welcome')) {
            // Show the welcome tutorial
            elements.welcomeModal.style.display = 'flex';
            // Mark it so they never see it again
            localStorage.setItem('lt_has_seen_welcome', 'true');
        } else if (!state.currentUser) {
            // If they HAVE seen it before, but aren't logged in, prompt login
            elements.authModal.style.display = 'flex';
        }
    });

    elements.closeWelcomeBtn.addEventListener('click', () => {
        elements.welcomeModal.style.display = 'none';
        
        // After reading the tutorial, prompt them to log in if they are a guest!
        if (!state.currentUser) {
            elements.authModal.style.display = 'flex';
        }
    });
    if (elements.loginSignupBtn) elements.loginSignupBtn.addEventListener('click', () => elements.authModal.style.display = 'flex');
    if (elements.skipBtn) elements.skipBtn.addEventListener('click', () => elements.authModal.style.display = 'none');
    
    if (elements.authModal) {
        elements.authModal.addEventListener('click', (e) => {
            if (e.target.id === 'switchAuthModeLink') {
                e.preventDefault();
                state.isSignUpMode = !state.isSignUpMode;
                updateAuthModalUI();
            }
        });
    }

    if (elements.authActionBtn) {
        elements.authActionBtn.addEventListener('click', async (event) => { 
            event.preventDefault();
            if (state.isSignUpMode) await handleSignUp();
            else await handleLogIn();
        });
    }

    if (elements.logoutBtn) elements.logoutBtn.addEventListener('click', handleLogOut);
    if (elements.emailInput) elements.emailInput.addEventListener('input', validateSignUpForm);
    if (elements.passwordInput) elements.passwordInput.addEventListener('input', validateSignUpForm);
    if (elements.usernameInput) elements.usernameInput.addEventListener('input', validateSignUpForm);
    if (elements.ageCheckbox) elements.ageCheckbox.addEventListener('change', validateSignUpForm);
    if (elements.deleteAccountBtn) elements.deleteAccountBtn.addEventListener('click', handleAccountDeletion);

    // --- Community Challenge Modal Listeners ---
    if (elements.addChallengeBtn) {
        elements.addChallengeBtn.addEventListener('click', () => {
            alert('Add New Challenge modal will go here.'); document.getElementById('addChallengeModal').style.display = 'flex';
        });
    }

    if (elements.communityChallengeBtn) {
        elements.communityChallengeBtn.addEventListener('click', () => {
            elements.challengeModal.style.display = 'flex';
            elements.menuModal.style.display = 'none';
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

    // --- Main Controls ---
    if (elements.findMeBtn) elements.findMeBtn.addEventListener('click', findMe);
    if (elements.trackBtn) elements.trackBtn.addEventListener('click', toggleTracking);
    if (elements.pictureBtn) elements.pictureBtn.addEventListener('click', () => elements.cameraInput.click());
    if (elements.cameraInput) elements.cameraInput.addEventListener('change', handlePhoto);
    if (elements.changeStyleBtn) elements.changeStyleBtn.addEventListener('click', changeMapStyle);
    if (elements.communityBtn) elements.communityBtn.addEventListener('click', toggleCommunityView);
    if (elements.menuBtn) elements.menuBtn.addEventListener('click', () => elements.menuModal.style.display = 'flex');
    if (elements.infoBtn) elements.infoBtn.addEventListener('click', () => elements.infoModal.style.display = 'flex');
    
    if (elements.viewTermsLink) {
        elements.viewTermsLink.addEventListener('click', (e) => {
            e.preventDefault();
            elements.infoModal.style.display = 'none';
            elements.termsModal.style.display = 'flex';
        });
    }

    if (elements.safetyModalOkBtn) {
        elements.safetyModalOkBtn.addEventListener('click', () => {
            elements.safetyModal.style.display = 'none';
            startTracking();
        });
    }

    if (elements.summaryOkBtn) {
        elements.summaryOkBtn.addEventListener('click', () => { 
            elements.summaryModal.style.display = 'none';
            const preview = document.getElementById('cleanupPhotoPreviewContainer');
            if(preview) preview.style.display = 'none';
            const img = document.getElementById('cleanupPhotoPreview');
            if(img) img.src = '#';
        });
    }

    // --- Data Management ---
    if (elements.dataBtn) {
        elements.dataBtn.addEventListener('click', () => {
            const hasRoute = state.routeCoordinates.length > 0 || state.photoPins.length > 0;
            elements.menuModal.style.display = 'none';
            if (elements.centerOnRouteBtn) elements.centerOnRouteBtn.classList.toggle('disabled', !hasRoute);
            elements.dataModal.style.display = 'flex';
        });
    }
    if (elements.saveBtn) elements.saveBtn.addEventListener('click', saveSession);
    if (elements.loadBtn) elements.loadBtn.addEventListener('click', () => {
        elements.dataModal.style.display = 'none';
        loadSession();
    });
    if (elements.exportBtn) elements.exportBtn.addEventListener('click', exportGeoJSON);
    
    if (elements.centerOnRouteBtn) {
        elements.centerOnRouteBtn.addEventListener('click', () => {
            if (elements.centerOnRouteBtn.classList.contains('disabled')) {
                alert("Please load a route first to use this feature.");
            } else {
                centerOnRoute();
                elements.dataModal.style.display = 'none';
            }
        });
    }
    
    if (elements.publishBtn) elements.publishBtn.addEventListener('click', publishRoute);

    // --- Profile ---
    if (elements.managePublicationsBtn) {
        elements.managePublicationsBtn.addEventListener('click', () => {
            if (!state.currentUser) { alert("You must be logged in to manage your publications."); return; }
            elements.dataModal.style.display = 'none';
            populatePublishedRoutesList();
            elements.publishedRoutesModal.style.display = 'flex';
        });
    }
    if (elements.editProfileBtn) {
        elements.editProfileBtn.addEventListener('click', () => {
            if (!state.currentUser) { alert("You must be logged in to edit your profile."); return; }
            elements.menuModal.style.display = 'none'; 
            loadProfileForEditing();
            elements.profileModal.style.display = 'flex';
        });
    }
    if (elements.saveProfileBtn) elements.saveProfileBtn.addEventListener('click', saveProfile);

    // --- Leaderboard & Stats (SAFETY CHECK ADDED) ---
    if (elements.leaderboardBtn) {
        elements.leaderboardBtn.addEventListener('click', () => {
            elements.leaderboardModal.style.display = 'flex';
            document.getElementById('leaderboardList').style.display = 'block';
            document.getElementById('myStatsContainer').style.display = 'none';
            elements.leaderboardTabs.forEach(t => t.classList.remove('active'));
            const tab = document.querySelector('.leaderboard-tab[data-metric="totalPins"]');
            if(tab) tab.classList.add('active');
            fetchAndDisplayLeaderboard('totalPins');
        });
    }

    if (elements.leaderboardTabs) {
        elements.leaderboardTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                elements.leaderboardTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const isMyStats = tab.id === 'myStatsBtn';
                const list = document.getElementById('leaderboardList');
                const stats = document.getElementById('myStatsContainer');
                if (list) list.style.display = isMyStats ? 'none' : 'block';
                if (stats) stats.style.display = isMyStats ? 'block' : 'none';
                
                if (isMyStats) { fetchAndDisplayMyStats(); }
                else { fetchAndDisplayLeaderboard(tab.dataset.metric); }
            });
        });
    }

    if (elements.leaderboardList) {
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
    }

    // --- Cleanup Photo ---
    const addCleanupPhotoBtn = document.getElementById('addCleanupPhotoBtn');
    const cleanupCameraInput = document.getElementById('cleanupCameraInput');
    const photoPreviewContainer = document.getElementById('cleanupPhotoPreviewContainer');
    const photoPreview = document.getElementById('cleanupPhotoPreview');

    if (addCleanupPhotoBtn) { 
        addCleanupPhotoBtn.addEventListener('click', () => {
            cleanupCameraInput.click();
        });
    }

    if (cleanupCameraInput) { 
        cleanupCameraInput.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (file) {
                // NOTE: imageCompression is loaded globally via CDN in HTML
                const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1280 };
                let compressedFile;
                try {
                    // Check if imageCompression exists (it might not in test env)
                    if (typeof imageCompression !== 'undefined') {
                        compressedFile = await imageCompression(file, options);
                    } else {
                        compressedFile = file;
                    }
                } catch (error) {
                    console.error("Compression error:", error);
                    compressedFile = file;
                }
                
                state.cleanupPhoto = compressedFile; 
                const objectURL = URL.createObjectURL(compressedFile);
                if (photoPreview) photoPreview.src = objectURL;
                if (photoPreviewContainer) photoPreviewContainer.style.display = 'flex';
                event.target.value = '';
            } else {
                state.cleanupPhoto = null;
                if (photoPreview) photoPreview.src = '#';
                if (photoPreviewContainer) photoPreviewContainer.style.display = 'none';
            }
        });
    }

    // --- Meetups (SAFETY CHECK ADDED - THIS WAS THE CRASH) ---
    if (elements.safetyCheckbox) elements.safetyCheckbox.addEventListener('change', validateMeetupForm);
    if (elements.meetupTitleInput) elements.meetupTitleInput.addEventListener('input', validateMeetupForm);
    if (elements.meetupDescriptionInput) elements.meetupDescriptionInput.addEventListener('input', validateMeetupForm);
    if (elements.createMeetupBtn) elements.createMeetupBtn.addEventListener('click', handleMeetupSubmit);

    // --- General ---
    if (elements.shareBtn) elements.shareBtn.addEventListener('click', shareCleanupResults);
    
    addAllModalCloseListeners();
}  // end of event listener!

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
