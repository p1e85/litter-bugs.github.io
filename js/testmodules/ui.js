import { db, collection, query, orderBy, limit, getDocs, doc, getDoc } from './firebase.js'; 
import { state, allTitles } from './config.js';
import { initializeMap, changeMapStyle, centerOnRoute, setupSectorVisuals } from './map.js';
import { initializeAuthListener, handleSignUp, handleLogIn, handleLogOut, handleAccountDeletion, handlePasswordReset } from './auth.js';
import { findMe, toggleTracking, startTracking, handlePhoto, shareCleanupResults, resetFindMeState } from './tracking.js';
import { saveSession, loadSession, exportGeoJSON } from './data.js';
import { 
    toggleCommunityView, publishRoute, populatePublishedRoutesList, 
    loadProfileForEditing, saveProfile, fetchAndDisplayLeaderboard, 
    fetchAndDisplayMyStats, updateSwarmPulse,
    handleMeetupSubmit, validateMeetupForm, toggleRouteLike, 
    openAchievementsModal, openEventBadgesModal, 
    // Logic Helpers
    getUserQuests, joinChallenge, getAdminChallenges, deleteChallenge, createNewChallenge, fetchAndDisplayAllEvents , initializeSquad, fetchLocalSquads
} from './community.js';

// --- DOM Element Selection ---
const elements = {
    // Admin Elements
    btnAdminPanel: document.getElementById('btnAdminPanel'),
    adminChallengeModal: document.getElementById('adminChallengeModal'),
    btnSaveChallenge: document.getElementById('btnSaveChallenge'),
    
    // Admin Inputs
    adminChalTitle: document.getElementById('adminChalTitle'),
    adminChalDesc: document.getElementById('adminChalDesc'),
    adminChalGoal: document.getElementById('adminChalGoal'),
    adminChalBadge: document.getElementById('adminChalBadge'),
    adminChalExpire: document.getElementById('adminChalExpire'),
    adminChallengeList: document.getElementById('adminChallengeList'),
    adminChalType: document.getElementById('adminChalType'),
    adminChalTime: document.getElementById('adminChalTime'),
    
    // General Modals
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
    meetupModal: document.getElementById('meetupModal'),
    viewMeetupsModal: document.getElementById('viewMeetupsModal'),
    menuModal: document.getElementById('menuModal'),
    eventsModal: document.getElementById('eventsModal'),
    
    // Challenge System Modals
    challengeMenuModal: document.getElementById('challengeMenuModal'),
    activeChallengesModal: document.getElementById('activeChallengesModal'),
    pastChallengesModal: document.getElementById('pastChallengesModal'),
    achievementsModal: document.getElementById('achievementsModal'), // The List Modal
    achievementModal: document.getElementById('achievementModal'), // The Popup Modal

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
    btnPastChallengesBack: document.getElementById('btnPastChallengesBack'),
    
    // Hub Navigation
    hubModal: document.getElementById('hubModal'),
    hubBtn: document.getElementById('hubBtn'),
    hubChallengesBtn: document.getElementById('hubChallengesBtn'),
    hubEventsBtn: document.getElementById('hubEventsBtn'),
    hubFeedBtn: document.getElementById('hubFeedBtn'),
    feedModal: document.getElementById('feedModal'),
    feedContainer: document.getElementById('feedContainer'),
    
    // Inputs
    cameraInput: document.getElementById('cameraInput'),
    termsCheckbox: document.getElementById('termsCheckbox'),
    ageCheckbox: document.getElementById('ageCheckbox'),
    emailInput: document.getElementById('emailInput'),
    passwordInput: document.getElementById('passwordInput'),
    usernameInput: document.getElementById('usernameInput'),
    safetyCheckbox: document.getElementById('safetyCheckbox'),
    meetupTitleInput: document.getElementById('meetupTitleInput'),
    meetupDescriptionInput: document.getElementById('meetupDescriptionInput'),
    meetupDateInput: document.getElementById('meetupDateInput'),
    viewTermsLink: document.getElementById('viewTermsLink'),
    
    // Lists & Containers
    leaderboardTabs: document.querySelectorAll('.leaderboard-tab'),
    leaderboardList: document.getElementById('leaderboardList'),
    publicChallengeList: document.getElementById('publicChallengeList'),
    pastChallengesContent: document.getElementById('pastChallengesContent'),
    achievementsList: document.getElementById('achievementsList'),
    achievementsTitle: document.getElementById('achievementsTitle'),
    
    // Specific Navigation Buttons
    communityChallengeBtn: document.getElementById('communityChallengeBtn'), 
    btnAchievements: document.getElementById('btnAchievements'), // Main Menu Button
    btnViewEventBadges: document.getElementById('btnViewEventBadges'), // Challenge Hub Button
    achievementListBackBtn: document.getElementById('achievementListBackBtn'), // Dynamic Back Button
    
    btnCurrentChallenges: document.getElementById('btnCurrentChallenges'),
    btnPastChallenges: document.getElementById('btnPastChallenges'),
    btnBackToMenu: document.querySelector('#pastChallengesModal .ok-btn'), // History Back
    btnBackFromCurrent: document.getElementById('btnBackFromCurrent'), // Current Back
    btnchallengeMenuBack: document.getElementById('btnchallengeMenuBack'),
    
    // Tabs
    tabCompleted: document.getElementById('tabCompleted'),
    tabUncompleted: document.getElementById('tabUncompleted'),
    
    // LOG TRASH ITEMS (NEW)
    logTrashBtn: document.getElementById('logTrashBtn'),
    logTrashModal: document.getElementById('logTrashModal'),
    trashCountInput: document.getElementById('trashCountInput'),
    confirmTrashBtn: document.getElementById('confirmTrashBtn')
};

/**
 * Main initializer for the entire UI.
 */
export function initializeUI() {
    initializeMap();
    // Add this right after initializeMap();
    state.map.on('load', () => {
        setupSectorVisuals();
        updateSwarmPulse();
    });
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

    const dateElement = document.getElementById('dynamicDateDay');
    if (dateElement) {
        dateElement.textContent = new Date().getDate(); 
    }

    const hubSquadsBtn = document.getElementById('hubSquadsBtn');
    if (hubSquadsBtn) {
        hubSquadsBtn.addEventListener('click', () => {
            openModal('squadsModal'); // This should now work!
            if (typeof fetchLocalSquads === 'function') {
                fetchLocalSquads(); 
            }
        });
    }
    
}

export function attachEventListeners() {
    
    // --- AUTHENTICATION ---
    if (elements.loginBtn) {
        elements.loginBtn.addEventListener('click', () => {
            const email = prompt("Enter email:");
            const password = prompt("Enter password:");
            if (email && password) loginUser(email, password);
        });
    }

    if (elements.logoutBtn) {
        elements.logoutBtn.addEventListener('click', handleLogOut);
    }
    
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

    elements.emailInput.addEventListener('input', validateSignUpForm);
    elements.passwordInput.addEventListener('input', validateSignUpForm);
    elements.usernameInput.addEventListener('input', validateSignUpForm);
    elements.ageCheckbox.addEventListener('change', validateSignUpForm);
    elements.deleteAccountBtn.addEventListener('click', handleAccountDeletion);

    // --- MAP & TRACKING ---
    elements.findMeBtn.addEventListener('click', findMe);
    elements.trackBtn.addEventListener('click', toggleTracking);
    
    elements.pictureBtn.addEventListener('click', () => elements.cameraInput.click());
    elements.cameraInput.addEventListener('change', handlePhoto);
    
    elements.changeStyleBtn.addEventListener('click', changeMapStyle);
    
    // --- MAIN MENU NAVIGATION ---
    elements.menuBtn.addEventListener('click', () => elements.menuModal.style.display = 'flex');

    // 1. Community Hub (Challenges)
    if (elements.communityChallengeBtn) {
        elements.communityChallengeBtn.addEventListener('click', () => {
            elements.menuModal.style.display = 'none';
            elements.challengeMenuModal.style.display = 'flex';
        });
    }
    
    // 2. Main Menu: Achievements
    if (elements.btnAchievements) {
        elements.btnAchievements.addEventListener('click', () => {
            elements.menuModal.style.display = 'none';
            elements.achievementsModal.style.display = 'flex';
            
            openAchievementsModal(); // Calls the code above
            
            // Back Button logic...
            if (elements.achievementListBackBtn) {
                const newBackBtn = elements.achievementListBackBtn.cloneNode(true);
                elements.achievementListBackBtn.parentNode.replaceChild(newBackBtn, elements.achievementListBackBtn);
                elements.achievementListBackBtn = newBackBtn; 

                newBackBtn.addEventListener('click', () => {
                    elements.achievementsModal.style.display = 'none';
                    elements.menuModal.style.display = 'flex';
                });
            }
        });
    }

    // 3. Community Map View
    elements.communityBtn.addEventListener('click', toggleCommunityView);
    
    // 4. Info / Settings
    elements.infoBtn.addEventListener('click', () => elements.infoModal.style.display = 'flex');
    elements.viewTermsLink.addEventListener('click', (e) => {
        e.preventDefault();
        elements.infoModal.style.display = 'none';
        elements.termsModal.style.display = 'flex';
    });

    // --- DATA & SAVING ---
    elements.safetyModalOkBtn.addEventListener('click', () => {
        elements.safetyModal.style.display = 'none';
        startTracking();
    });

    elements.summaryOkBtn.addEventListener('click', () => { 
        elements.summaryModal.style.display = 'none';
        document.getElementById('cleanupPhotoPreviewContainer').style.display = 'none';
        document.getElementById('cleanupPhotoPreview').src = '#';
    });

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
    
    elements.managePublicationsBtn.addEventListener('click', () => {
        if (!state.currentUser) { alert("You must be logged in to manage your publications."); return; }
        elements.dataModal.style.display = 'none';
        populatePublishedRoutesList();
        elements.publishedRoutesModal.style.display = 'flex';
    });

    // --- PROFILE ---
    elements.editProfileBtn.addEventListener('click', async () => {
        if (!state.currentUser) { alert("You must be logged in to edit your profile."); return; }
        try {
            // Fetch the user's profile to see what titles they own
            const docSnap = await getDoc(doc(db, "publicProfiles", state.currentUser.uid));
            const userData = docSnap.data() || {};
        
            // Pass the user's unlocked titles to the dropdown (default to empty array if none)
            const myTitles = userData.unlockedTitles || []; 
        
            populateTitleDropdown(myTitles);
            loadProfileForEditing();
        
            elements.profileModal.style.display = 'flex';
        } catch (err) {
            console.error("Error opening profile:", err);
        }
    });
    elements.saveProfileBtn.addEventListener('click', saveProfile);

    // --- LEADERBOARD ---
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

    // --- CLEANUP PHOTOS ---
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
                state.cleanupPhoto = file; 
                const objectURL = URL.createObjectURL(file);
                photoPreview.src = objectURL;
                photoPreviewContainer.style.display = 'flex';
                event.target.value = '';
            } else {
                state.cleanupPhoto = null;
                photoPreview.src = '#';
                photoPreviewContainer.style.display = 'none';
            }
        });
    }

    // --- MEETUPS ---
    elements.safetyCheckbox.addEventListener('change', validateMeetupForm);
    elements.meetupTitleInput.addEventListener('input', validateMeetupForm);
    elements.meetupDescriptionInput.addEventListener('input', validateMeetupForm);
    elements.createMeetupBtn.addEventListener('click', handleMeetupSubmit);
    elements.shareBtn.addEventListener('click', shareCleanupResults);
    elements.meetupDateInput.addEventListener('change', validateMeetupForm);

    // --- HUB NAVIGATION (Feed/Events) ---
    elements.hubBtn.addEventListener('click', () => {
        elements.menuModal.style.display = 'none';
        elements.hubModal.style.display = 'flex';
    });
    if (elements.hubChallengesBtn) {
        elements.hubChallengesBtn.addEventListener('click', () => {
            elements.hubModal.style.display = 'none'; 
            elements.challengeMenuModal.style.display = 'flex'; 
        });
    }
    elements.hubEventsBtn.addEventListener('click', () => {
        elements.hubModal.style.display = 'none';
        elements.eventsModal.style.display = 'flex';
        fetchAndDisplayAllEvents();
    });
    elements.hubFeedBtn.addEventListener('click', () => {
        elements.hubModal.style.display = 'none';
        elements.feedModal.style.display = 'flex';
        loadActivityFeed();
    });

    // --- CHALLENGE MENU NAVIGATION ---

    // 1. EVENT BADGES (Challenge Menu -> Event Rewards)
    if (elements.btnViewEventBadges) {
        elements.btnViewEventBadges.addEventListener('click', () => {
            elements.challengeMenuModal.style.display = 'none'; // Close Hub
            elements.achievementsModal.style.display = 'flex';  // Open List
            
            // Call the Specific Function for Events
            openEventBadgesModal(); 
            
            // DYNAMIC BACK BUTTON: Returns to Challenge Hub
            if (elements.achievementListBackBtn) {
                // Clone node to strip old listeners
                const newBackBtn = elements.achievementListBackBtn.cloneNode(true);
                elements.achievementListBackBtn.parentNode.replaceChild(newBackBtn, elements.achievementListBackBtn);
                elements.achievementListBackBtn = newBackBtn; 

                newBackBtn.addEventListener('click', () => {
                    elements.achievementsModal.style.display = 'none';
                    elements.challengeMenuModal.style.display = 'flex'; // <--- Go back to Challenge Hub
                });
            }
        });
    }

    // 2. Current Challenges
    if (elements.btnCurrentChallenges) {
        elements.btnCurrentChallenges.addEventListener('click', () => {
            elements.challengeMenuModal.style.display = 'none';
            elements.activeChallengesModal.style.display = 'flex';
            loadPublicChallenges();
        });
    }
    
    // Back from Current -> Hub
    if (elements.btnBackFromCurrent) {
        elements.btnBackFromCurrent.addEventListener('click', (e) => {
            e.stopPropagation();
            elements.activeChallengesModal.style.display = 'none';
            elements.challengeMenuModal.style.display = 'flex';
        });
    }

    // 3. Challenge Menu BACK Button (The Fix!)
    if (elements.btnchallengeMenuBack) {
        elements.btnchallengeMenuBack.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close the Challenge Menu
            elements.challengeMenuModal.style.display = 'none';
            // Return to the Community Hub
            elements.hubModal.style.display = 'flex';
        });
    }

    // 4. Past Challenges
    elements.btnPastChallenges.addEventListener('click', () => {
        elements.challengeMenuModal.style.display = 'none';
        elements.pastChallengesModal.style.display = 'flex';
        elements.tabCompleted.classList.add('active');
        elements.tabUncompleted.classList.remove('active');
        loadPastChallenges('completed'); 
    });

    // Back from History -> Hub
    if (elements.btnBackToMenu) {
        elements.btnBackToMenu.addEventListener('click', () => {
            elements.pastChallengesModal.style.display = 'none';
            elements.challengeMenuModal.style.display = 'flex';
        });
    }

    // 5. History Tabs
    elements.tabCompleted.addEventListener('click', () => {
        elements.tabCompleted.classList.add('active');
        elements.tabUncompleted.classList.remove('active');
        loadPastChallenges('completed');
    });

    elements.tabUncompleted.addEventListener('click', () => {
        elements.tabUncompleted.classList.add('active');
        elements.tabCompleted.classList.remove('active');
        loadPastChallenges('uncompleted');
    });

    // 6. Admin Panel
    if (elements.btnAdminPanel) {
        elements.btnAdminPanel.addEventListener('click', async () => {
            elements.challengeMenuModal.style.display = 'none';
            elements.adminChallengeModal.style.display = 'flex';
            await loadAdminChallengeList(); 
        });
    }

    if (elements.btnSaveChallenge) {
        elements.btnSaveChallenge.addEventListener('click', async () => {
            const title = elements.adminChalTitle.value;
            const desc = elements.adminChalDesc.value;
            const type = elements.adminChalType.value; // NEW
            const goal = elements.adminChalGoal.value;
            const timeLimit = elements.adminChalTime.value; // NEW
            const badge = elements.adminChalBadge.value;
            const expire = elements.adminChalExpire.value;

            if(!title || !goal || !expire) {
                alert("Please fill in Title, Goal, and Expiration Date.");
                return;
            }

            // Pass all arguments to the function
            await createNewChallenge(title, desc, type, goal, timeLimit, badge, expire);            
            alert("Challenge Created!");
            // Clear inputs (Optional)
            elements.adminChalTitle.value = '';
            elements.adminChalGoal.value = '';
            
            loadAdminChallengeList(); 
        });
    }

    // --- LOCAL EVENTS BACK BUTTON ---
    const btnEventsBack = document.getElementById('btnEventsBack');
    if (btnEventsBack) {
        btnEventsBack.addEventListener('click', () => {
            // Close the Events Modal
            elements.eventsModal.style.display = 'none';
            // Return to the Community Hub
            elements.hubModal.style.display = 'flex';
        });
    }

    if (elements.btnPastChallengesBack) {
        elements.btnPastChallengesBack.addEventListener('click', () => {
            elements.pastChallengesModal.style.display = 'none';
            elements.challengeMenuModal.style.display = 'flex';
        });
    }
    
    // --- LOG TRASH (NEW BUTTONS) ---
    if (elements.logTrashBtn) {
        elements.logTrashBtn.addEventListener('click', () => {
            elements.logTrashModal.style.display = 'flex';
            elements.trashCountInput.value = ''; 
            elements.trashCountInput.focus();
        });
    }

    if (elements.confirmTrashBtn) {
        elements.confirmTrashBtn.addEventListener('click', () => {
            const count = parseInt(elements.trashCountInput.value);
            if (count > 0) {
                // We add these to the 'state' temporarily, or we could just alert for now.
                // Since we are using "1 Pin = 1 Item" for the main logic, 
                // this button is likely for "Bulk Logging" if you decided to keep it.
                // If you opted for "1 Pin = 1 Item" only, you might not need this listener logic connected to DB yet.
                alert(`Logged ${count} items! (This will be saved when you stop tracking).`);
                
                // Optional: Push dummy pins to count as items?
                // For now, just close modal.
                elements.logTrashModal.style.display = 'none';
            } else {
                alert("Please enter a valid number.");
            }
        });
    }

    const forgotLink = document.getElementById('forgotPasswordLink');
    if (forgotLink) {
        forgotLink.addEventListener('click', (e) => {
            e.preventDefault();
            handlePasswordReset();
        });
    }

    let sectorsVisible = false;

document.getElementById('toggleSectorsBtn').addEventListener('click', () => {
    sectorsVisible = !sectorsVisible;
    const visibility = sectorsVisible ? 'visible' : 'none';
    const btn = document.getElementById('toggleSectorsBtn');

    // Loop through our 4 sectors and flip the switch
    ['RP-01', 'RP-02', 'RP-03', 'RP-04', 'RP-05'].forEach(id => {
        if (state.map.getLayer(`layer-${id}`)) {
            state.map.setLayoutProperty(`layer-${id}`, 'visibility', visibility);
        }
    });

    btn.textContent = sectorsVisible ? '🗺️ Hide Sectors' : '🗺️ Show Sectors';
    btn.classList.toggle('active', sectorsVisible);
});

    document.getElementById('hubSquadsBtn').addEventListener('click', () => {
    openModal('squadsModal');
    fetchLocalSquads(); // Refresh list every time it opens
});

document.getElementById('btnFinalizeSquad').addEventListener('click', initializeSquad);
    
    // Generic Close Listeners
    addAllModalCloseListeners();

    
} //********************end event listern**************

function addAllModalCloseListeners() {
    const allModals = Object.values(elements).filter(el => el && el.classList && el.classList.contains('modal-overlay'));
    allModals.forEach(modal => {
        const closeBtn = modal.querySelector('.close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => modal.style.display = 'none');
        }
        // NOTE: We don't auto-close on generic .ok-btn anymore because we have specific logic for them now
    });
    window.addEventListener('click', (event) => {
        if (event.target.classList.contains('modal-overlay')) {
            event.target.style.display = 'none';
        }
    });
}

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

export function updateAuthModalUI() {
    const authForm = document.getElementById('authForm');
    const authTitle = document.getElementById('authTitle');
    const authSubtitle = document.getElementById('authSubtitle');
    const forgotLink = document.getElementById('forgotPasswordLink'); // Get the link

    document.getElementById('authError').textContent = '';

    if (state.isSignUpMode) {
        authTitle.textContent = 'Create a Litter Troopers Account';
        authSubtitle.innerHTML = 'Or <a href="#" id="switchAuthModeLink">log in to an existing account.</a>';
        elements.authActionBtn.textContent = 'Sign Up';
        authForm.classList.add('signup-mode');
        authForm.classList.remove('login-mode');
        
        // Hide on Sign Up
        if (forgotLink) forgotLink.style.display = 'none'; 
    } else {
        authTitle.textContent = 'Log In to Litter Troopers';
        authSubtitle.innerHTML = 'Or <a href="#" id="switchAuthModeLink">create a new account.</a>';
        elements.authActionBtn.textContent = 'Log In';
        authForm.classList.add('login-mode');
        authForm.classList.remove('signup-mode');
        
        // Show on Login
        if (forgotLink) forgotLink.style.display = 'inline-block'; 
    }
    validateSignUpForm();
}

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

// --- ACTIVITY FEED (User View) ---
async function loadActivityFeed() {
    const container = elements.feedContainer;
    container.innerHTML = '<div class="feed-loader">Loading latest cleanups...</div>';

    try {
        const q = query(
            collection(db, "publishedRoutes"), 
            orderBy("timestamp", "desc"), 
            limit(20)
        );
        
        const querySnapshot = await getDocs(q);
        container.innerHTML = '';

        if (querySnapshot.empty) {
            container.innerHTML = '<p>No cleanups shared yet. Be the first!</p>';
            return;
        }

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (typeof data.distance === 'undefined' && typeof data.distanceMiles === 'undefined') return; 

            const date = data.timestamp?.toDate().toLocaleDateString() || "Recently";
            const photoUrl = data.cleanupPhotoURL || 'https://placehold.co/400x300?text=No+Photo';
            const likeCount = data.likeCount || 0;
            const likedBy = data.likedBy || [];
            const isLiked = state.currentUser && likedBy.includes(state.currentUser.uid);
            const likeBtnClass = isLiked ? 'like-btn active' : 'like-btn';
            
            const card = document.createElement('div');
            card.className = 'feed-card';
            card.innerHTML = `
                <div class="feed-header">
                    <div class="feed-avatar">${data.username?.charAt(0).toUpperCase() || 'T'}</div>
                    <div class="feed-user-info">
                        <h4>${data.username || 'Anonymous Trooper'}</h4>
                        <span>${date}</span>
                    </div>
                </div>
                <img src="${photoUrl}" class="feed-photo" loading="lazy">
                <div class="feed-body">
                    <div class="feed-stats">
                        <span>📍 <strong>${data.pins?.length || 0}</strong> Items</span>
                        <span>📏 <strong>${data.distanceMiles || '0.00 mi'}</strong></span>
                    </div>
                    <p class="feed-caption">${data.sessionName || 'Just finished a cleanup!'}</p>
                    <div class="feed-actions">
                         <button class="${likeBtnClass}">
                           👍 <span class="like-count">${likeCount}</span>
                         </button>
                    </div>
                </div>
            `;
            container.appendChild(card);

            const likeBtn = card.querySelector('.like-btn');
            likeBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const result = await toggleRouteLike(doc.id);
                if (result) {
                    likeBtn.querySelector('.like-count').textContent = result.likeCount;
                    likeBtn.classList.toggle('active', result.isLiked);
                }
            });
        });
    } catch (error) {
        console.error("Error loading feed:", error);
        container.innerHTML = '<p>Failed to load feed. Check your connection.</p>';
    }
}

// --- ADMIN PERMISSIONS ---
export function checkAdminPermissions(userProfile) {
    if (userProfile && userProfile.role === 'admin') {
        if (elements.btnAdminPanel) elements.btnAdminPanel.style.display = 'flex';
    } else {
        if (elements.btnAdminPanel) elements.btnAdminPanel.style.display = 'none';
    }
}

async function loadAdminChallengeList() {
    if (!elements.adminChallengeList) return;
    elements.adminChallengeList.innerHTML = "<p>Loading...</p>";
    
    const challenges = await getAdminChallenges();

    elements.adminChallengeList.innerHTML = ""; 

    if (challenges.length === 0) {
        elements.adminChallengeList.innerHTML = "<p>No active challenges found.</p>";
        return;
    }

    challenges.forEach(chal => {
        const item = document.createElement('div');
        item.style.borderBottom = "1px solid #eee";
        item.style.padding = "10px";
        item.style.display = "flex";
        item.style.justifyContent = "space-between";
        item.style.alignItems = "center";

        item.innerHTML = `
            <div>
                <strong>${chal.title}</strong><br>
                <small>${chal.goal_miles} Miles • Exp: ${new Date(chal.expires_at.seconds * 1000).toLocaleDateString()}</small>
            </div>
            <button class="delete-btn" style="background: #dc3545; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">🗑️</button>
        `;

        const delBtn = item.querySelector('.delete-btn');
        delBtn.addEventListener('click', async () => {
            if(confirm("Delete this challenge?")) {
                await deleteChallenge(chal.id);
                loadAdminChallengeList(); 
            }
        });
        elements.adminChallengeList.appendChild(item);
    });
}

// --- PUBLIC CHALLENGE DISPLAY (Active) ---
async function loadPublicChallenges() {
    const listContainer = elements.publicChallengeList;
    if (!listContainer) return;
    listContainer.innerHTML = "<p>Loading quests...</p>";

    try {
        const challenges = await getAdminChallenges();
        let myQuests = {};
        if (state.currentUser) {
            myQuests = await getUserQuests(state.currentUser.uid);
        }

        listContainer.innerHTML = ""; 

        if (challenges.length === 0) {
            listContainer.innerHTML = "<p>No active challenges.</p>";
            return;
        }

        // Sort: Active first, Completed last
        challenges.sort((a, b) => {
            const statA = myQuests[a.id] ? myQuests[a.id].status : 'new';
            const statB = myQuests[b.id] ? myQuests[b.id].status : 'new';
            if (statA === 'completed' && statB !== 'completed') return 1;
            if (statA !== 'completed' && statB === 'completed') return -1;
            return 0;
        });

        challenges.forEach(chal => {
            const card = document.createElement('div');
            card.className = "hub-card"; 
            card.style.marginBottom = "15px";
            card.style.textAlign = "left";
            card.style.display = "flex"; 
            card.style.justifyContent = "space-between";
            card.style.alignItems = "center";

            const expireDate = new Date(chal.expires_at.seconds * 1000);
            const diffDays = Math.ceil((expireDate - new Date()) / (1000 * 60 * 60 * 24)); 
            
            const questData = myQuests[chal.id];
            const isJoined = !!questData;
            const isCompleted = questData && questData.status === 'completed';
            const userProgress = isJoined ? questData.progress : 0;

            let statusColor = "#333";
            let buttonHtml = "";

            if (isCompleted) {
                card.style.border = "2px solid #FFD700"; 
                card.style.backgroundColor = "#fff9db"; 
                buttonHtml = `
                    <div style="text-align: right;">
                        <span style="font-size:1.2em;">🏆</span>
                        <span style="display:block; font-size:0.8em; color:#B8860B; font-weight:bold;">COMPLETED</span>
                    </div>`;
            } else if (isJoined) {
                card.style.border = "1px solid #4A7C59"; 
                buttonHtml = `
                    <div style="text-align: right;">
                        <span style="display:block; font-size:0.8em; color:#4A7C59; font-weight:bold;">✅ Active</span>
                        <small style="color:#666;">${userProgress.toFixed(1)} / ${chal.goal_miles} mi</small>
                    </div>`;
            } else {
                buttonHtml = `<button class="modal-button primary start-btn" data-id="${chal.id}">Start</button>`;
            }

            card.innerHTML = `
                <div>
                    <h4 style="margin: 0; color: #4A7C59;">${chal.title}</h4>
                    <p style="font-size: 0.9em; color: #666; margin: 5px 0;">${chal.description}</p>
                    <div style="font-size: 0.85em; font-weight: bold; color: ${statusColor};">
                        🎯 Goal: ${chal.goal_miles} Miles <br>
                        ⏳ Ends in: ${diffDays} days
                    </div>
                </div>
                ${buttonHtml}
            `;
            
            if (!isJoined) {
                const btn = card.querySelector('.start-btn');
                btn.addEventListener('click', async () => {
                    if (!state.currentUser) { alert("Please login first!"); return; }
                    btn.innerText = "Joining...";
                    await joinChallenge(chal.id, chal.title, state.currentUser.uid);
                    loadPublicChallenges(); // Refresh
                });
            }
            listContainer.appendChild(card);
        });
    } catch (e) {
        console.error("Error loading challenges:", e);
        listContainer.innerHTML = "<p>Error loading content.</p>";
    }
}

// --- PAST CHALLENGES (History Logic) ---
async function loadPastChallenges(filterType) {
    const listContainer = elements.pastChallengesContent;
    if (!listContainer) return;

    listContainer.innerHTML = "<p>Loading history...</p>";

    try {
        if (!state.currentUser) {
            listContainer.innerHTML = "<p>Please login to see history.</p>";
            return;
        }

        const myQuests = await getUserQuests(state.currentUser.uid);
        const questIds = Object.keys(myQuests);

        if (questIds.length === 0) {
            listContainer.innerHTML = "<p>No challenge history found.</p>";
            return;
        }

        const allChallenges = await getAdminChallenges();
        
        listContainer.innerHTML = ""; 
        let count = 0;

        for (const [chalId, userProgress] of Object.entries(myQuests)) {
            const originalData = allChallenges.find(c => c.id === chalId) || {};
            const title = originalData.title || userProgress.title || "Unknown Quest";
            const goal = originalData.goal_miles || "??";
            
            const isCompleted = userProgress.status === 'completed';
            const isExpired = userProgress.status === 'expired'; 
            
            let showIt = false;
            if (filterType === 'completed' && isCompleted) showIt = true;
            if (filterType === 'uncompleted' && !isCompleted) showIt = true;

            if (showIt) {
                count++;
                const card = document.createElement('div');
                card.className = "hub-card";
                card.style.marginBottom = "10px";
                card.style.textAlign = "left";
                
                const borderColor = isCompleted ? "#FFD700" : (isExpired ? "#ccc" : "#4A7C59");
                const statusText = isCompleted ? "🏆 COMPLETED" : (isExpired ? "⌛ EXPIRED" : "🏃 IN PROGRESS");
                const statusColor = isCompleted ? "#B8860B" : (isExpired ? "#999" : "#4A7C59");

                let dateStr = "";
                if (userProgress.completed_at) {
                    dateStr = `Done: ${new Date(userProgress.completed_at.seconds * 1000).toLocaleDateString()}`;
                } else if (userProgress.joined_at) {
                    dateStr = `Joined: ${new Date(userProgress.joined_at.seconds * 1000).toLocaleDateString()}`;
                }

                card.style.borderLeft = `5px solid ${borderColor}`;
                
                card.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <h4 style="margin:0;">${title}</h4>
                            <small style="color:#666;">${dateStr}</small>
                        </div>
                        <div style="text-align:right;">
                            <strong style="color:${statusColor}; display:block;">${statusText}</strong>
                            <span style="font-size:0.9em;">${userProgress.progress.toFixed(1)} / ${goal} mi</span>
                        </div>
                    </div>
                `;
                listContainer.appendChild(card);
            }
        }

        if (count === 0) {
            listContainer.innerHTML = `<p style="color:#888;">No ${filterType} challenges found.</p>`;
        }

    } catch (e) {
        console.error("Error loading past challenges:", e);
        listContainer.innerHTML = "<p>Error loading content.</p>";
    }
}

// --- PUBLIC PROFILE FUNCTION ---
export async function showPublicProfile(userId) {
    const modal = document.getElementById('publicProfileModal');
    const content = document.getElementById('publicProfileContent');
    content.innerHTML = '<p>Loading profile...</p>';
    modal.style.display = 'flex';

    try {
        // 1. Get Profile Data
        const docSnap = await getDoc(doc(db, "publicProfiles", userId));
        if (!docSnap.exists()) {
            content.innerHTML = '<p>User profile not found.</p>';
            return;
        }
        const data = docSnap.data();

        // --- NEW TITLE LOOKUP LOGIC ---
        // Converts the saved key (og_9) into the display name (The Original Nine)
        const titleDisplay = (data.selectedTitle && allTitles[data.selectedTitle]) 
            ? `<p style="margin:-5px 0 10px; font-weight:bold; color:#4A7C59; font-size:0.9em;">${allTitles[data.selectedTitle].name}</p>` 
            : '';

        // 2. Get Badges
        const badgesSnap = await getDocs(query(collection(db, "publicProfiles", userId, "badges"), orderBy("date", "desc")));
        let badgesHTML = '';
        if (badgesSnap.empty) {
            badgesHTML = '<p style="color:#888;">No badges yet.</p>';
        } else {
            badgesSnap.forEach(b => {
                const badge = b.data();
                const count = badge.count || 1;
                const countBadge = count > 1 ? `<span style="background:#333; color:white; font-size:0.7em; padding:1px 4px; border-radius:4px; margin-left:4px;">x${count}</span>` : '';
                
                badgesHTML += `
                    <div style="background:#f9f9f9; padding:10px; border-radius:8px; width:80px; text-align:center;">
                        <div style="font-size:2em;">${badge.icon || '🏆'}</div>
                        <div style="font-size:0.8em; font-weight:bold; margin-top:5px;">${badge.title}</div>
                        ${countBadge}
                        <div style="font-size:0.7em; color:${badge.color || '#666'};">${badge.tier || 'Stone'}</div>
                    </div>
                `;
            });
        }

        // 3. Render
        content.innerHTML = `
            <div style="text-align:center;">
                <img src="${data.photoURL || 'https://via.placeholder.com/100'}" style="width:100px; height:100px; border-radius:50%; object-fit:cover; border:3px solid #4A7C59;">
                <h2 style="margin:10px 0;">${data.username}</h2>
                
                ${titleDisplay}
                
                <p style="color:#666;">${data.bio || 'No bio yet.'}</p>
                <div style="margin:15px 0; font-size:0.9em; background:#e8f5e9; padding:10px; border-radius:8px; display:inline-block;">
                    <strong>${data.totalDistance ? data.totalDistance.toFixed(1) : 0}</strong> miles cleaned
                </div>
            </div>
            <h3 style="border-bottom:1px solid #eee; padding-bottom:5px; margin-top:20px;">Badges</h3>
            <div style="display:flex; flex-wrap:wrap; gap:10px; justify-content:center;">
                ${badgesHTML}
            </div>
        `;
    } catch (err) {
        console.error("Error loading profile:", err);
        content.innerHTML = '<p>Error loading profile.</p>';
    }
}

export function populateTitleDropdown(unlockedTitles = []) {
    const titleSelect = document.getElementById('titleSelect');
    const requirementText = document.getElementById('titleRequirement');
    
    if (!titleSelect) return;

    // 1. Clear the dropdown
    titleSelect.innerHTML = '<option value="">No Title Selected</option>';

    // 2. Only add titles that are in the user's unlockedTitles array
    // If the array is empty, they only see "No Title Selected"
    Object.keys(allTitles).forEach(key => {
        if (unlockedTitles.includes(key)) {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = allTitles[key].name;
            titleSelect.appendChild(option);
        }
    });

    // 3. Update requirement text on change
    titleSelect.onchange = (e) => {
        const selectedKey = e.target.value;
        if (selectedKey && allTitles[selectedKey]) {
            requirementText.textContent = `Active Title: ${allTitles[selectedKey].name}`;
        } else {
            requirementText.textContent = "Select from your unlocked titles.";
        }
    };
}

// Switches between the three "screens" in the Squads Modal
export function switchSquadView(viewName) {
    const views = {
        'registry': document.getElementById('squadRegistryView'),
        'intel': document.getElementById('squadIntelView'),
        'create': document.getElementById('squadCreateView')
    };

    // Hide all, then show the requested one
    Object.values(views).forEach(view => { if(view) view.style.display = 'none'; });
    if (views[viewName]) views[viewName].style.display = 'block';
}

// Global-access wrappers for your HTML onclicks
window.openCreateSquadForm = () => switchSquadView('create');
window.showSquadRegistry = () => switchSquadView('registry');

// Modal Utility Functions
export function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
        // Optional: play a subtle sound or trigger an animation here
    }
}

export function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

// Make them available to HTML onclicks
window.openModal = openModal;
window.closeModal = closeModal;
