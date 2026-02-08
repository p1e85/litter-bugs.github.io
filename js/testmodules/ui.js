import { db, collection, query, orderBy, limit, getDocs, doc, getDoc, updateDoc, serverTimestamp, where, deleteDoc } from './firebase.js'; 
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
    openAchievementsModal, openEventBadgesModal, fetchSquadDetails,
    getUserQuests, joinChallenge, getAdminChallenges, deleteChallenge, createNewChallenge, fetchAndDisplayAllEvents, initializeSquad, fetchLocalSquads
} from './community.js';

// --- DOM Element Selection ---
export const elements = {
    btnAdminPanel: document.getElementById('btnAdminPanel'),
    adminChallengeModal: document.getElementById('adminChallengeModal'),
    btnSaveChallenge: document.getElementById('btnSaveChallenge'),
    adminChallengeList: document.getElementById('adminChallengeList'),
    adminChalTitle: document.getElementById('adminChalTitle'),
    adminChalDesc: document.getElementById('adminChalDesc'),
    adminChalGoal: document.getElementById('adminChalGoal'),
    adminChalBadge: document.getElementById('adminChalBadge'),
    adminChalExpire: document.getElementById('adminChalExpire'),
    adminChalType: document.getElementById('adminChalType'),
    adminChalTime: document.getElementById('adminChalTime'),
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
    hubModal: document.getElementById('hubModal'),
    feedModal: document.getElementById('feedModal'),
    squadsModal: document.getElementById('squadsModal'),
    logTrashModal: document.getElementById('logTrashModal'),
    challengeMenuModal: document.getElementById('challengeMenuModal'),
    activeChallengesModal: document.getElementById('activeChallengesModal'),
    pastChallengesModal: document.getElementById('pastChallengesModal'),
    achievementsModal: document.getElementById('achievementsModal'), 
    achievementModal: document.getElementById('achievementModal'), 
    agreeBtn: document.getElementById('agreeBtn'),
    skipBtn: document.getElementById('skipBtn'),
    findMeBtn: document.getElementById('findMeBtn'),
    trackBtn: document.getElementById('trackBtn'),
    pictureBtn: document.getElementById('pictureBtn'),
    logTrashBtn: document.getElementById('logTrashBtn'),
    confirmTrashBtn: document.getElementById('confirmTrashBtn'),
    dataBtn: document.getElementById('dataBtn'),
    saveBtn: document.getElementById('saveBtn'),
    loadBtn: document.getElementById('loadBtn'),
    exportBtn: document.getElementById('exportBtn'),
    communityBtn: document.getElementById('communityBtn'),
    publishBtn: document.getElementById('publishBtn'),
    loginBtn: document.getElementById('loginBtn'), 
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
    hubSquadsBtn: document.getElementById('hubSquadsBtn'),
    btnCurrentChallenges: document.getElementById('btnCurrentChallenges'),
    btnPastChallenges: document.getElementById('btnPastChallenges'),
    btnViewEventBadges: document.getElementById('btnViewEventBadges'),
    btnchallengeMenuBack: document.getElementById('btnchallengeMenuBack'),
    btnPastChallengesBack: document.getElementById('btnPastChallengesBack'),
    btnBackFromCurrent: document.getElementById('btnBackFromCurrent'),
    btnEventsBack: document.getElementById('btnEventsBack'),
    achievementListBackBtn: document.getElementById('achievementListBackBtn'),
    btnAchievements: document.getElementById('btnAchievements'),
    btnFinalizeSquad: document.getElementById('btnFinalizeSquad'),
    toggleSectorsBtn: document.getElementById('toggleSectorsBtn'),
    cameraInput: document.getElementById('cameraInput'),
    trashCountInput: document.getElementById('trashCountInput'),
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
    leaderboardTabs: document.querySelectorAll('.leaderboard-tab'),
    leaderboardList: document.getElementById('leaderboardList'),
    feedContainer: document.getElementById('feedContainer'),
    publicChallengeList: document.getElementById('publicChallengeList'),
    pastChallengesContent: document.getElementById('pastChallengesContent'),
    achievementsList: document.getElementById('achievementsList'),
    achievementsTitle: document.getElementById('achievementsTitle'),
    tabCompleted: document.getElementById('tabCompleted'),
    tabUncompleted: document.getElementById('tabUncompleted'),
    meetupLocationName: document.getElementById('meetupLocationName')
};

/**
 * Main initializer for the entire UI.
 */
export function initializeUI() {
    initializeMap();
    state.map.on('load', () => {
        setupSectorVisuals();
        updateSwarmPulse();
    });
    state.map.on('dragstart', (e) => { if (e.originalEvent) resetFindMeState(); });
    state.map.on('zoomstart', (e) => { if (e.originalEvent) resetFindMeState(); });
    initializeAuthListener();
    attachEventListeners();
    if (sessionStorage.getItem('termsAccepted')) {
        if (elements.termsModal) elements.termsModal.style.display = 'none';
        document.getElementById('userStatus').style.display = 'flex';
    } else {
        if (elements.termsModal) elements.termsModal.style.display = 'flex';
    }
    const dateElement = document.getElementById('dynamicDateDay');
    if (dateElement) dateElement.textContent = new Date().getDate(); 
}

export function attachEventListeners() {
    elements.logoutBtn?.addEventListener('click', handleLogOut);
    elements.termsCheckbox?.addEventListener('change', () => {
        if (elements.agreeBtn) elements.agreeBtn.disabled = !elements.termsCheckbox.checked;
    });
    elements.agreeBtn?.addEventListener('click', () => {
        elements.termsModal.style.display = 'none';
        sessionStorage.setItem('termsAccepted', 'true');
        document.getElementById('userStatus').style.display = 'flex';
        if (!state.currentUser) elements.authModal.style.display = 'flex';
    });
    elements.loginBtn?.addEventListener('click', () => elements.authModal.style.display = 'flex');
    elements.skipBtn?.addEventListener('click', () => elements.authModal.style.display = 'none');
    elements.authModal?.addEventListener('click', (e) => {
        if (e.target.id === 'switchAuthModeLink') {
            e.preventDefault();
            state.isSignUpMode = !state.isSignUpMode;
            updateAuthModalUI();
        }
    });
    elements.authActionBtn?.addEventListener('click', async (event) => { 
        event.preventDefault();
        if (state.isSignUpMode) await handleSignUp();
        else await handleLogIn();
    });
    elements.emailInput?.addEventListener('input', validateSignUpForm);
    elements.passwordInput?.addEventListener('input', validateSignUpForm);
    elements.usernameInput?.addEventListener('input', validateSignUpForm);
    elements.ageCheckbox?.addEventListener('change', validateSignUpForm);
    elements.deleteAccountBtn?.addEventListener('click', handleAccountDeletion);
    elements.findMeBtn?.addEventListener('click', findMe);
    elements.trackBtn?.addEventListener('click', toggleTracking);
    elements.pictureBtn?.addEventListener('click', () => elements.cameraInput?.click());
    elements.cameraInput?.addEventListener('change', handlePhoto);
    elements.changeStyleBtn?.addEventListener('click', changeMapStyle);
    elements.logTrashBtn?.addEventListener('click', () => {
        elements.logTrashModal.style.display = 'flex';
        if (elements.trashCountInput) {
            elements.trashCountInput.value = '';
            elements.trashCountInput.focus();
        }
    });
    elements.confirmTrashBtn?.addEventListener('click', () => {
        const count = parseInt(elements.trashCountInput.value);
        if (count > 0) {
            alert(`Logged ${count} items! (Saved when tracking stops).`);
            elements.logTrashModal.style.display = 'none';
        } else { alert("Please enter a valid number."); }
    });
    elements.menuBtn?.addEventListener('click', () => elements.menuModal.style.display = 'flex');
    elements.hubBtn?.addEventListener('click', () => {
        elements.menuModal.style.display = 'none';
        elements.hubModal.style.display = 'flex';
    });
    elements.hubChallengesBtn?.addEventListener('click', () => {
        elements.hubModal.style.display = 'none';
        elements.challengeMenuModal.style.display = 'flex';
    });
    elements.hubEventsBtn?.addEventListener('click', () => {
        elements.hubModal.style.display = 'none';
        elements.eventsModal.style.display = 'flex';
        fetchAndDisplayAllEvents();
    });
    elements.hubFeedBtn?.addEventListener('click', () => {
        elements.hubModal.style.display = 'none';
        elements.feedModal.style.display = 'flex';
        loadActivityFeed();
    });
    elements.hubSquadsBtn?.addEventListener('click', () => {
        elements.hubModal.style.display = 'none';
        openModal('squadsModal');
        window.showSquadRegistry();
        fetchLocalSquads();
    });
    elements.btnCurrentChallenges?.addEventListener('click', () => {
        elements.challengeMenuModal.style.display = 'none';
        elements.activeChallengesModal.style.display = 'flex';
        loadPublicChallenges();
    });
    elements.btnPastChallenges?.addEventListener('click', () => {
        elements.challengeMenuModal.style.display = 'none';
        elements.pastChallengesModal.style.display = 'flex';
        loadPastChallenges('completed');
    });
    elements.btnViewEventBadges?.addEventListener('click', () => {
        elements.challengeMenuModal.style.display = 'none';
        elements.achievementsModal.style.display = 'flex';
        openEventBadgesModal();
    });
    elements.btnchallengeMenuBack?.addEventListener('click', () => {
        elements.challengeMenuModal.style.display = 'none';
        elements.hubModal.style.display = 'flex';
    });
    elements.btnBackFromCurrent?.addEventListener('click', () => {
        elements.activeChallengesModal.style.display = 'none';
        elements.challengeMenuModal.style.display = 'flex';
    });
    elements.btnPastChallengesBack?.addEventListener('click', () => {
        elements.pastChallengesModal.style.display = 'none';
        elements.challengeMenuModal.style.display = 'flex';
    });
    elements.btnEventsBack?.addEventListener('click', () => {
        elements.eventsModal.style.display = 'none';
        elements.hubModal.style.display = 'flex';
    });
    elements.achievementListBackBtn?.addEventListener('click', () => {
        elements.achievementsModal.style.display = 'none';
        elements.menuModal.style.display = 'flex';
    });
    elements.dataBtn?.addEventListener('click', () => {
        const hasRoute = state.routeCoordinates.length > 0 || state.photoPins.length > 0;
        elements.menuModal.style.display = 'none';
        if (elements.centerOnRouteBtn) elements.centerOnRouteBtn.classList.toggle('disabled', !hasRoute);
        elements.dataModal.style.display = 'flex';
    });
    elements.saveBtn?.addEventListener('click', saveSession);
    elements.loadBtn?.addEventListener('click', () => {
        elements.dataModal.style.display = 'none';
        loadSession();
    });
    elements.exportBtn?.addEventListener('click', exportGeoJSON);
    elements.centerOnRouteBtn?.addEventListener('click', () => {
        if (!elements.centerOnRouteBtn.classList.contains('disabled')) {
            centerOnRoute();
            elements.dataModal.style.display = 'none';
        }
    });
    elements.publishBtn?.addEventListener('click', publishRoute);
    elements.managePublicationsBtn?.addEventListener('click', () => {
        if (!state.currentUser) return alert("Please log in.");
        elements.dataModal.style.display = 'none';
        populatePublishedRoutesList();
        elements.publishedRoutesModal.style.display = 'flex';
    });
    elements.safetyModalOkBtn?.addEventListener('click', () => {
        elements.safetyModal.style.display = 'none';
        startTracking();
    });
    elements.summaryOkBtn?.addEventListener('click', () => { elements.summaryModal.style.display = 'none'; });
    elements.editProfileBtn?.addEventListener('click', async () => {
        if (!state.currentUser) return alert("Please log in.");
        const docSnap = await getDoc(doc(db, "publicProfiles", state.currentUser.uid));
        populateTitleDropdown(docSnap.data()?.unlockedTitles || []);
        loadProfileForEditing();
        elements.profileModal.style.display = 'flex';
    });
    elements.saveProfileBtn?.addEventListener('click', saveProfile);
    elements.leaderboardBtn?.addEventListener('click', () => {
        elements.leaderboardModal.style.display = 'flex';
        fetchAndDisplayLeaderboard('totalPins');
    });
    elements.btnAchievements?.addEventListener('click', () => {
        elements.menuModal.style.display = 'none';
        elements.achievementsModal.style.display = 'flex';
        openAchievementsModal();
    });
    elements.toggleSectorsBtn?.addEventListener('click', () => {
        const active = elements.toggleSectorsBtn.classList.toggle('active');
        const visibility = active ? 'visible' : 'none';
        ['RP-01', 'RP-02', 'RP-03', 'RP-04', 'RP-05'].forEach(id => {
            if (state.map.getLayer(`layer-${id}`)) state.map.setLayoutProperty(`layer-${id}`, 'visibility', visibility);
            if (state.map.getLayer(`label-${id}`)) state.map.setLayoutProperty(`label-${id}`, 'visibility', visibility);
        });
        elements.toggleSectorsBtn.textContent = active ? '🗺️ Hide Sectors' : '🗺️ Show Sectors';
    });
    elements.btnAdminPanel?.addEventListener('click', () => {
        elements.challengeMenuModal.style.display = 'none';
        elements.adminChallengeModal.style.display = 'flex';
        loadAdminChallengeList();
    });
    elements.btnSaveChallenge?.addEventListener('click', async () => {
        await createNewChallenge(
            elements.adminChalTitle.value, elements.adminChalDesc.value, 
            elements.adminChalType.value, elements.adminChalGoal.value, 
            elements.adminChalTime.value, elements.adminChalBadge.value, 
            elements.adminChalExpire.value
        );
        loadAdminChallengeList();
    });
    addAllModalCloseListeners();
}

function addAllModalCloseListeners() {
    const allModals = document.querySelectorAll('.modal-overlay');
    allModals.forEach(modal => {
        modal.querySelector('.close-btn')?.addEventListener('click', () => modal.style.display = 'none');
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
    });
}

export function updateLoggedInStatusUI(isLoggedIn, username = '') {
    const userStatus = document.getElementById('userStatus');
    if (userStatus) userStatus.style.display = 'flex';
    const displayStyle = isLoggedIn ? 'flex' : 'none';
    const guestStyle = isLoggedIn ? 'none' : 'flex';
    const pubStyle = isLoggedIn ? 'block' : 'none';
    const emailEl = document.getElementById('userEmail');
    if (emailEl) emailEl.textContent = isLoggedIn ? `Logged in as: ${username}` : '';
    const loggedInEl = document.getElementById('loggedInContent');
    if (loggedInEl) loggedInEl.style.display = displayStyle;
    const guestEl = document.getElementById('guestContent');
    if (guestEl) guestEl.style.display = guestStyle;
    if (elements.authModal) elements.authModal.style.display = 'none';
    if (elements.publishBtn) elements.publishBtn.style.display = pubStyle;
    if (elements.managePublicationsBtn) elements.managePublicationsBtn.style.display = pubStyle;
    if (elements.editProfileBtn) elements.editProfileBtn.style.display = pubStyle;
}

export function updateAuthModalUI() {
    const authForm = document.getElementById('authForm');
    const forgotLink = document.getElementById('forgotPasswordLink');
    const authTitle = document.getElementById('authTitle');
    const authSub = document.getElementById('authSubtitle');
    const authErr = document.getElementById('authError');
    if (authErr) authErr.textContent = '';
    
    if (state.isSignUpMode) {
        if (authTitle) authTitle.textContent = 'Create a Litter Troopers Account';
        if (authSub) authSub.innerHTML = 'Or <a href="#" id="switchAuthModeLink">log in.</a>';
        if (elements.authActionBtn) elements.authActionBtn.textContent = 'Sign Up';
        authForm?.classList.replace('login-mode', 'signup-mode');
        if (forgotLink) forgotLink.style.display = 'none'; 
    } else {
        if (authTitle) authTitle.textContent = 'Log In to Litter Troopers';
        if (authSub) authSub.innerHTML = 'Or <a href="#" id="switchAuthModeLink">create an account.</a>';
        if (elements.authActionBtn) elements.authActionBtn.textContent = 'Log In';
        authForm?.classList.replace('signup-mode', 'login-mode');
        if (forgotLink) forgotLink.style.display = 'inline-block'; 
    }
    validateSignUpForm();
}

function validateSignUpForm() {
    const isEmailValid = elements.emailInput.value.includes('@');
    const isPasswordValid = elements.passwordInput.value.length >= 6;
    if (state.isSignUpMode) {
        const isUserValid = elements.usernameInput.value.trim().length >= 3;
        if (elements.authActionBtn) elements.authActionBtn.disabled = !(isEmailValid && isPasswordValid && isUserValid && elements.ageCheckbox.checked);
    } else { 
        if (elements.authActionBtn) elements.authActionBtn.disabled = !(isEmailValid && isPasswordValid); 
    }
}

async function loadActivityFeed() {
    const container = elements.feedContainer;
    if (!container) return;
    container.innerHTML = '<div class="feed-loader">Scanning the globe...</div>';
    try {
        const q = query(collection(db, "publishedRoutes"), orderBy("timestamp", "desc"), limit(20));
        const snap = await getDocs(q);
        container.innerHTML = snap.empty ? '<p>No cleanups yet.</p>' : '';
        snap.forEach((doc) => {
            const data = doc.data();
            const date = data.timestamp?.toDate().toLocaleDateString() || "Recently";
            const isLiked = state.currentUser && data.likedBy?.includes(state.currentUser.uid);
            const card = document.createElement('div');
            card.className = 'feed-card';
            card.innerHTML = `
                <div class="feed-header">
                    <div class="feed-avatar">${data.username?.charAt(0).toUpperCase() || 'T'}</div>
                    <div class="feed-user-info"><h4>${data.username || 'Anonymous'}</h4><span>${date}</span></div>
                </div>
                <img src="${data.cleanupPhotoURL || 'https://placehold.co/400x300?text=No+Photo'}" class="feed-photo">
                <div class="feed-body">
                    <div class="feed-stats"><span>📍 <strong>${data.pins?.length || 0}</strong> Items</span><span>📏 <strong>${data.distanceMiles || '0.00 mi'}</strong></span></div>
                    <p class="feed-caption">${data.sessionName || 'Cleanup Complete!'}</p>
                    <div class="feed-actions"><button class="like-btn ${isLiked ? 'active' : ''}">👍 <span class="like-count">${data.likeCount || 0}</span></button></div>
                </div>`;
            container.appendChild(card);
            card.querySelector('.like-btn').addEventListener('click', async (e) => {
                const res = await toggleRouteLike(doc.id);
                if (res) {
                    e.currentTarget.querySelector('.like-count').textContent = res.likeCount;
                    e.currentTarget.classList.toggle('active', res.isLiked);
                }
            });
        });
    } catch (e) { container.innerHTML = '<p>Error loading feed.</p>'; }
}

export function checkAdminPermissions(userProfile) {
    if (elements.btnAdminPanel) elements.btnAdminPanel.style.display = (userProfile?.role === 'admin') ? 'flex' : 'none';
}

async function loadAdminChallengeList() {
    if (!elements.adminChallengeList) return;
    elements.adminChallengeList.innerHTML = "<p>Loading...</p>";
    const challenges = await getAdminChallenges();
    elements.adminChallengeList.innerHTML = challenges.length ? "" : "<p>No active missions.</p>";
    challenges.forEach(chal => {
        const item = document.createElement('div');
        item.className = "hub-card";
        item.style.display = "flex"; item.style.justifyContent = "space-between";
        item.innerHTML = `<div><strong>${chal.title}</strong><br><small>${chal.goal_miles} Miles</small></div><button class="delete-btn">🗑️</button>`;
        item.querySelector('.delete-btn').addEventListener('click', async () => {
            if(confirm("Delete mission?")) { await deleteChallenge(chal.id); loadAdminChallengeList(); }
        });
        elements.adminChallengeList.appendChild(item);
    });
}

async function loadPublicChallenges() {
    const list = elements.publicChallengeList;
    if (!list) return;
    list.innerHTML = "<p>Loading quests...</p>";
    try {
        const chals = await getAdminChallenges();
        let myQuests = state.currentUser ? await getUserQuests(state.currentUser.uid) : {};
        list.innerHTML = chals.length ? "" : "<p>No active quests.</p>";
        chals.forEach(chal => {
            const qData = myQuests[chal.id];
            const isJoined = !!qData;
            const isDone = qData?.status === 'completed';
            const card = document.createElement('div');
            card.className = "hub-card";
            card.innerHTML = `<div><h4>${chal.title}</h4><p>${chal.description}</p><strong>Goal: ${chal.goal_miles} Miles</strong></div>
                ${isDone ? '🏆' : isJoined ? '✅ Active' : `<button class="start-btn">Start</button>`}`;
            card.querySelector('.start-btn')?.addEventListener('click', async () => {
                await joinChallenge(chal.id, chal.title, state.currentUser.uid); loadPublicChallenges();
            });
            list.appendChild(card);
        });
    } catch (e) { list.innerHTML = "<p>Quest uplink failed.</p>"; }
}

async function loadPastChallenges(filterType) {
    const content = elements.pastChallengesContent;
    if (!content || !state.currentUser) return;
    content.innerHTML = "<p>Retrieving history...</p>";
    try {
        const myQuests = await getUserQuests(state.currentUser.uid);
        content.innerHTML = "";
        let count = 0;
        for (const [id, data] of Object.entries(myQuests)) {
            const isMatch = (filterType === 'completed' && data.status === 'completed') || (filterType === 'uncompleted' && data.status !== 'completed');
            if (isMatch) {
                count++;
                const card = document.createElement('div');
                card.className = "hub-card";
                card.style.borderLeft = `6px solid ${data.status === 'completed' ? '#FFD700' : '#4A7C59'}`;
                card.innerHTML = `<h4>${data.title}</h4><p>Status: ${data.status.toUpperCase()}</p><button onclick="window.handleDeleteMission('${id}')">🗑️ Purge</button>`;
                content.appendChild(card);
            }
        }
        if (!count) content.innerHTML = `<p>No ${filterType} records found.</p>`;
    } catch (e) { content.innerHTML = "<p>Archive sync failed.</p>"; }
}

export function populateTitleDropdown(unlockedTitles = []) {
    const sel = document.getElementById('titleSelect');
    if (!sel) return;
    sel.innerHTML = '<option value="">No Title Selected</option>';
    Object.keys(allTitles).forEach(k => {
        if (unlockedTitles.includes(k)) {
            const opt = document.createElement('option');
            opt.value = k; opt.textContent = allTitles[k].name;
            sel.appendChild(opt);
        }
    });
    sel.onchange = (e) => {
        const reqEl = document.getElementById('titleRequirement');
        if (reqEl) reqEl.textContent = e.target.value ? `Active: ${allTitles[e.target.value].name}` : "Select a title.";
    };
}

export function switchSquadView(view) {
    const views = { 'registry': 'squadRegistryView', 'intel': 'squadIntelView', 'create': 'squadCreateView' };
    Object.entries(views).forEach(([k, id]) => { const el = document.getElementById(id); if(el) el.style.display = (k === view ? 'block' : 'none'); });
}

export async function cleanupExpiredChallenges() {
    const now = new Date();
    try {
        const q = query(collection(db, "challenges"), where("status", "==", "active"));
        const snap = await getDocs(q);
        for (const d of snap.docs) {
            const exp = d.data().expires_at?.toDate();
            if (exp && exp < now) await updateDoc(doc(db, "challenges", d.id), { status: "expired" });
        }
        loadPublicChallenges();
    } catch (e) { console.error("Cleanup Error:", e); }
}

// --- FIX: ADDED EXPORT FOR COMMUNITY.JS ---
export async function showPublicProfile(userId) {
    const modal = document.getElementById('publicProfileModal');
    const content = document.getElementById('publicProfileContent');
    const supportBtn = document.getElementById('profileSupportBtn');
    
    if (content) content.innerHTML = '<p style="text-align:center; padding:20px;">Establishing uplink...</p>';
    if (supportBtn) supportBtn.style.display = 'none'; 
    if (modal) modal.style.display = 'flex';

    try {
        const docSnap = await getDoc(doc(db, "publicProfiles", userId));
        if (!docSnap.exists()) {
            if (content) content.innerHTML = '<p>Trooper not found.</p>';
            return;
        }
        const data = docSnap.data();
        let jDate = "Legacy";
        if (data.joinedAt) {
            const d = data.joinedAt.toDate ? data.joinedAt.toDate() : new Date(data.joinedAt);
            jDate = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        }

        if (content) {
            content.innerHTML = `
                <div style="text-align:center;">
                    <img src="${data.photoURL || 'https://via.placeholder.com/100'}" style="width:100px; height:100px; border-radius:50%; border:3px solid #4A7C59;">
                    <h2 style="margin:10px 0 0;">${data.username}</h2>
                    <p style="color:#888; font-size:0.7rem;">Trooper Since ${jDate}</p>
                    <p style="margin:15px 0;">${data.bio || 'Anonymous.'}</p>
                    <div style="background:#e8f5e9; padding:10px; border-radius:8px;">
                        <strong>${(data.totalDistance || 0).toFixed(1)}</strong> miles | <strong>${data.totalPins || 0}</strong> pins
                    </div>
                </div>
            `;
        }
        if (supportBtn && data.buyMeACoffeeLink) {
            supportBtn.style.display = 'block';
            supportBtn.onclick = () => window.open(data.buyMeACoffeeLink, '_blank');
        }
    } catch (err) { if (content) content.innerHTML = '<p>Link failed.</p>'; }
}

// --- GLOBAL BRIDGE ---
window.openModal = (id) => { if (elements[id]) elements[id].style.display = 'flex'; };
window.closeModal = (id) => { if (elements[id]) elements[id].style.display = 'none'; };
window.openCreateSquadForm = () => switchSquadView('create');
window.showSquadRegistry = () => switchSquadView('registry');
window.viewSquadIntel = (id) => { switchSquadView('intel'); fetchSquadDetails(id); };
window.showPublicProfile = showPublicProfile;
window.handleDeleteMission = (id) => { if(confirm("Purge record?")) deleteDoc(doc(db, "user_challenges", id)); loadPastChallenges('completed'); };
window.runGlobalCleanup = cleanupExpiredChallenges;
window.openMeetupForm = (name, lat, lng) => {
    if (elements.meetupLocationName) elements.meetupLocationName.textContent = name;
    const mLat = document.getElementById('meetupLat');
    if (mLat) mLat.value = lat;
    const mLng = document.getElementById('meetupLng');
    if (mLng) mLng.value = lng;
    const poi = document.getElementById('poiNameInput');
    if (poi) poi.value = name;
    const title = document.getElementById('meetupTitleInput');
    if (title) title.value = `Cleanup at ${name}`;
    if (elements.meetupModal) elements.meetupModal.style.display = 'flex';
};
window.handleViewProfile = (uid) => showPublicProfile(uid);
