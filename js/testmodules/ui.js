import { state } from './config.js';
import { initializeMap, changeMapStyle, centerOnRoute } from './map.js';
import { initializeAuthListener, handleSignUp, handleLogIn, handleLogOut, handleAccountDeletion } from './auth.js';
import { findMe, toggleTracking, startTracking, handlePhoto, shareCleanupResults, resetFindMeState } from './tracking.js';
import { saveSession, loadSession, exportGeoJSON } from './data.js';
import { fetchAndDisplayAllEvents } from './community.js'; 
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
    validateMeetupForm,
    toggleRouteLike,
    openAchievementsModal,
    openCurrentChallenges,
    openPastChallenges,
    getAdminChallenges,
    deleteChallenge,
    createNewChallenge
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
    hubModal: document.getElementById('hubModal'),
    feedModal: document.getElementById('feedModal'),
    feedContainer: document.getElementById('feedContainer'),
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
    hubBtn: document.getElementById('hubBtn'),
    hubChallengesBtn: document.getElementById('hubChallengesBtn'),
    hubEventsBtn: document.getElementById('hubEventsBtn'),
    hubFeedBtn: document.getElementById('hubFeedBtn'),
    cameraInput: document.getElementById('cameraInput'),
    termsCheckbox: document.getElementById('termsCheckbox'),
    ageCheckbox: document.getElementById('ageCheckbox'),
    emailInput: document.getElementById('emailInput'),
    passwordInput: document.getElementById('passwordInput'),
    usernameInput: document.getElementById('usernameInput'),
    safetyCheckbox: document.getElementById('safetyCheckbox'),
    meetupTitleInput: document.getElementById('meetupTitleInput'),
    meetupDescriptionInput: document.getElementById('meetupDescriptionInput'),
    viewTermsLink: document.getElementById('viewTermsLink'),
    leaderboardTabs: document.querySelectorAll('.leaderboard-tab'),
    leaderboardList: document.getElementById('leaderboardList'),
    eventsModal: document.getElementById('eventsModal'),
    meetupDateInput: document.getElementById('meetupDateInput'),
    challengeMenuModal: document.getElementById('challengeMenuModal'),
    achievementsModal: document.getElementById('achievementsModal'),
    currentChallengesModal: document.getElementById('currentChallengesModal'),
    pastChallengesModal: document.getElementById('pastChallengesModal'),
    activeChallengesModal: document.getElementById('activeChallengesModal'),
    publicChallengeList: document.getElementById('publicChallengeList'),
    
    // New Buttons
    btnViewAchievements: document.getElementById('btnViewAchievements'),
    btnCurrentChallenges: document.getElementById('btnCurrentChallenges'),
    btnPastChallenges: document.getElementById('btnPastChallenges'),
    
    // Tabs
    tabCompleted: document.getElementById('tabCompleted'),
    tabUncompleted: document.getElementById('tabUncompleted'),
};

/**
 * Main initializer for the entire UI.
 */
export function initializeUI() {
    initializeMap();
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

    // --- NEW: Set Dynamic Date ---
    const dateElement = document.getElementById('dynamicDateDay');
        if (dateElement) {
            dateElement.textContent = new Date().getDate(); // Sets the number to today (e.g., 22)
        }
    
}

function attachEventListeners() {
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

    if (elements.addChallengeBtn) {
        elements.addChallengeBtn.addEventListener('click', () => {
            alert('Add New Challenge modal will go here.'); 
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
    elements.editProfileBtn.addEventListener('click', () => {
        if (!state.currentUser) { alert("You must be logged in to edit your profile."); return; }
        elements.menuModal.style.display = 'none'; 
        loadProfileForEditing();
        elements.profileModal.style.display = 'flex';
    });
    elements.saveProfileBtn.addEventListener('click', saveProfile);
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
                const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1280 };
                let compressedFile;
                try {
                    compressedFile = await imageCompression(file, options);
                } catch (error) {
                    console.error("Compression error:", error);
                    compressedFile = file; 
                }
                state.cleanupPhoto = compressedFile; 
                const objectURL = URL.createObjectURL(compressedFile);
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

    elements.safetyCheckbox.addEventListener('change', validateMeetupForm);
    elements.meetupTitleInput.addEventListener('input', validateMeetupForm);
    elements.meetupDescriptionInput.addEventListener('input', validateMeetupForm);
    elements.createMeetupBtn.addEventListener('click', handleMeetupSubmit);
    elements.shareBtn.addEventListener('click', shareCleanupResults);
    addAllModalCloseListeners();

    elements.hubBtn.addEventListener('click', () => {
        elements.menuModal.style.display = 'none';
        elements.hubModal.style.display = 'flex';
    });

    if (elements.hubChallengesBtn) {
        elements.hubChallengesBtn.addEventListener('click', () => {
            elements.hubModal.style.display = 'none'; // Close the Hub
            elements.challengeMenuModal.style.display = 'flex'; // Open the new menu
        });
    }

    elements.hubEventsBtn.addEventListener('click', () => {
        elements.hubModal.style.display = 'none';
        elements.eventsModal.style.display = 'flex';
        fetchAndDisplayAllEvents();
        //alert('Events feature coming soon!'); 
    });

    elements.hubFeedBtn.addEventListener('click', () => {
        elements.hubModal.style.display = 'none';
        elements.feedModal.style.display = 'flex';
        loadActivityFeed();
    });

    // Add listener for the new date input validation
elements.meetupDateInput.addEventListener('change', validateMeetupForm);

    // 1. Open Main Menu (Replace the old 'communityChallengeBtn' listener)
    if (elements.communityChallengeBtn) {
        elements.communityChallengeBtn.addEventListener('click', () => {
            elements.menuModal.style.display = 'none';
            elements.challengeMenuModal.style.display = 'flex';
        });
    }

    // 2. Menu Buttons
    elements.btnViewAchievements.addEventListener('click', () => {
        elements.challengeMenuModal.style.display = 'none';
        elements.achievementsModal.style.display = 'flex';
        openAchievementsModal();
    });

// "Current Challenges" Button
    if (elements.btnCurrentChallenges) {
        elements.btnCurrentChallenges.addEventListener('click', () => {
            // 1. Close the menu
            elements.challengeMenuModal.style.display = 'none';
            // 2. Open the list modal
            elements.activeChallengesModal.style.display = 'flex';
            // 3. Load the data
            loadPublicChallenges();
        });
    }

    elements.btnPastChallenges.addEventListener('click', () => {
        elements.challengeMenuModal.style.display = 'none';
        elements.pastChallengesModal.style.display = 'flex';
        // Default to completed tab
        elements.tabCompleted.classList.add('active');
        elements.tabUncompleted.classList.remove('active');
        openPastChallenges('completed');
    });

    // 3. Past Challenges Tabs
    elements.tabCompleted.addEventListener('click', () => {
        elements.tabCompleted.classList.add('active');
        elements.tabUncompleted.classList.remove('active');
        openPastChallenges('completed');
    });

    elements.tabUncompleted.addEventListener('click', () => {
        elements.tabUncompleted.classList.add('active');
        elements.tabCompleted.classList.remove('active');
        openPastChallenges('uncompleted');
    });

    // 4. Back Buttons (Re-open the Main Menu instead of closing everything)
    // Find the 'ok-btn' inside these specific modals and override them if needed, 
    // or just let them close. A better UX is to have a "Back" button go to menu.
    
    // (This logic assumes standard close behavior, but you can customize to go back to menu)

    // Admin Button (In Challenge Menu)
    if (elements.btnAdminPanel) {
        elements.btnAdminPanel.addEventListener('click', async () => {
            elements.challengeMenuModal.style.display = 'none';
            elements.adminChallengeModal.style.display = 'flex';
            
            // 👇 Load the list immediately
            await loadAdminChallengeList(); 
        });
    }

    // Save Challenge Button
    if (elements.btnSaveChallenge) {
        elements.btnSaveChallenge.addEventListener('click', () => {
            const title = elements.adminChalTitle.value;
            const desc = elements.adminChalDesc.value;
            const goal = elements.adminChalGoal.value;
            const badge = elements.adminChalBadge.value;
            const expire = elements.adminChalExpire.value;

            if(!title || !goal || !expire) {
                alert("Please fill in Title, Goal, and Date.");
                return;
            }

            // Import this function from community.js first!
            createNewChallenge(title, desc, goal, badge, expire);
        });
    }

} // end of listeners

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

import { db, collection, query, orderBy, limit, getDocs } from './firebase.js';

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

            // FILTER: Skip old legacy routes
            if (typeof data.distance === 'undefined' && typeof data.distanceMiles === 'undefined') {
                return; 
            }

            const date = data.timestamp?.toDate().toLocaleDateString() || "Recently";
            const photoUrl = data.cleanupPhotoURL || 'https://placehold.co/400x300?text=No+Photo';
            
            // --- LIKE LOGIC ---
            const likeCount = data.likeCount || 0;
            const likedBy = data.likedBy || [];
            const isLiked = state.currentUser && likedBy.includes(state.currentUser.uid);
            const likeBtnClass = isLiked ? 'like-btn active' : 'like-btn';
            
            // Generate the Card HTML
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

            // --- ATTACH LISTENER (FIXED SELECTOR) ---
            // We use .like-btn class directly instead of ID to avoid syntax errors
            const likeBtn = card.querySelector('.like-btn');
            
            likeBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                
                // Debugging log
                console.log(`Toggling like for route: ${doc.id}`);
                
                const result = await toggleRouteLike(doc.id);
                
                if (result) {
                    console.log("New like count:", result.likeCount);
                    likeBtn.querySelector('.like-count').textContent = result.likeCount;
                    likeBtn.classList.toggle('active', result.isLiked);
                } else {
                    console.error("Like failed. Check console for 'Missing Permissions' error.");
                }
            });

        });
    } catch (error) {
        console.error("Error loading feed:", error);
        container.innerHTML = '<p>Failed to load feed. Check your connection.</p>';
    }
}

// Function to reveal admin tools
export function checkAdminPermissions(userProfile) {
    console.log("🔍 Checking Admin Permissions...");
    console.log("👤 Profile Data:", userProfile); // This will show us the raw data from Firebase

    if (userProfile && userProfile.role === 'admin') {
        console.log("✅ SUCCESS: User is Admin! Unhiding button.");
        if (elements.btnAdminPanel) {
            elements.btnAdminPanel.style.display = 'flex';
        } else {
            console.error("❌ ERROR: Button #btnAdminPanel not found in HTML.");
        }
    } else {
        console.warn("⛔ ACCESS DENIED: User is NOT admin (or role is missing).");
    }
}

async function loadAdminChallengeList() {
    if (!elements.adminChallengeList) return;
    
    elements.adminChallengeList.innerHTML = "<p>Loading...</p>";
    
    // Fetch data
    const challenges = await import('./community.js').then(m => m.getAdminChallenges());

    elements.adminChallengeList.innerHTML = ""; // Clear loading text

    if (challenges.length === 0) {
        elements.adminChallengeList.innerHTML = "<p>No active challenges found.</p>";
        return;
    }

    // Render each challenge
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

        // Add Delete Click Listener
        const delBtn = item.querySelector('.delete-btn');
        delBtn.addEventListener('click', async () => {
            // Import dynamically to avoid circular dependency issues, or use the top-level import
            const community = await import('./community.js');
            await community.deleteChallenge(chal.id);
            loadAdminChallengeList(); // Refresh list after delete
        });

        elements.adminChallengeList.appendChild(item);
    });
}

async function loadPublicChallenges() {
    const listContainer = elements.publicChallengeList;
    if (!listContainer) return;

    listContainer.innerHTML = "<p>Loading quests...</p>";

    try {
        // Reuse the fetch function from community.js
        const community = await import('./community.js');
        const challenges = await community.getAdminChallenges(); // Fetches all active quests

        listContainer.innerHTML = ""; // Clear loading text

        if (challenges.length === 0) {
            listContainer.innerHTML = "<p>No active challenges right now. Check back later!</p>";
            return;
        }

        // Render the Cards
        challenges.forEach(chal => {
            const card = document.createElement('div');
            card.className = "hub-card"; // Reusing your nice card style
            card.style.marginBottom = "15px";
            card.style.textAlign = "left";
            card.style.display = "block"; // Reset grid behavior for list

            // Calculate days remaining
            const expireDate = new Date(chal.expires_at.seconds * 1000);
            const today = new Date();
            const diffTime = Math.abs(expireDate - today);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                        <h4 style="margin: 0; color: #4A7C59;">${chal.title}</h4>
                        <p style="font-size: 0.9em; color: #666; margin-top: 5px;">${chal.description}</p>
                        <div style="margin-top: 8px; font-size: 0.85em; font-weight: bold; color: #333;">
                            🎯 Goal: ${chal.goal_miles} Miles <br>
                            ⏳ Ends in: ${diffDays} days
                        </div>
                    </div>
                    <button class="modal-button primary" style="width: auto; padding: 5px 15px; font-size: 0.8em;">Start</button>
                </div>
            `;
            
            listContainer.appendChild(card);
        });

    } catch (e) {
        console.error("Error loading challenges:", e);
        listContainer.innerHTML = "<p style='color:red'>Error loading quests.</p>";
    }
}
