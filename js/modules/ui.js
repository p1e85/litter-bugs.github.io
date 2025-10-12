// --- UI Module ---
// This module handles all direct manipulation of the DOM (showing/hiding modals,
// updating text, building lists, etc.). It is the bridge between the application's
// data and what the user sees on the screen.

import { doc, getDoc, collection, query, orderBy, limit, where, onSnapshot, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { state } from './config.js';
import { allBadges, profanityList } from './config.js';
import { checkAndClearOldData, calculateRouteDistance } from './utils.js';
import { db } from './firebase.js';
import { saveSession, loadSession, exportGeoJSON } from './data.js'; 
import { initializeMap, changeMapStyle, centerOnRoute } from './map.js';
import { initializeAuthListener, handleSignUp, handleLogIn, handleLogOut, handleAccountDeletion } from './auth.js';
import { toggleCommunityView, publishRoute, populatePublishedRoutesList, loadProfileForEditing, saveProfile, fetchAndDisplayLeaderboard, fetchAndDisplayMyStats, showPublicProfile, handleMeetupSubmit, validateMeetupForm } from './community.js';
import { findMe, toggleTracking, startTracking, handlePhoto, shareCleanupResults, resetFindMeState } from './tracking.js';

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

export function updateAuthModalUI() {
    const authForm = document.getElementById('authForm');
    const authTitle = document.getElementById('authTitle');
    const authSubtitle = document.getElementById('authSubtitle');
    const authActionBtn = document.getElementById('authActionBtn');
    const emailInput = document.getElementById('emailInput');
    const passwordInput = document.getElementById('passwordInput');
    
    document.getElementById('authError').textContent = '';

    if (state.isSignUpMode) {
        authTitle.textContent = 'Create a Litter Bugs Account';
        authSubtitle.innerHTML = 'Or <a href="#" id="switchAuthModeLink">log in to an existing account.</a>';
        authActionBtn.textContent = 'Sign Up';
        authForm.classList.add('signup-mode');
        authForm.classList.remove('login-mode');
    } else {
        authTitle.textContent = 'Log In to Litter Bugs';
        authSubtitle.innerHTML = 'Or <a href="#" id="switchAuthModeLink">create a new account.</a>';
        authActionBtn.textContent = 'Log In';
        authForm.classList.add('login-mode');
        authForm.classList.remove('signup-mode');
    }

    const isEmailValid = emailInput.value.includes('@');
    const isPasswordValid = passwordInput.value.length >= 6;
    const isUsernameValid = document.getElementById('usernameInput').value.trim().length >= 3;
    const isAgeChecked = document.getElementById('ageCheckbox').checked;

    authActionBtn.disabled = state.isSignUpMode ? 
        !(isEmailValid && isPasswordValid && isUsernameValid && isAgeChecked) : 
        !(isEmailValid && isPasswordValid);
}

/**
 * Validates the sign-up/login form and enables/disables the action button.
 */
export function validateSignUpForm() {
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

export function createPinPopup(pinInfo, type, routeInfo = {}) {
    let popupHTML;
    if (type === 'user') {
        const categories = ['Plastic', 'Glass', 'Metal', 'Paper', 'Other'];
        const optionsHTML = categories.map(cat => `<option value="${cat}" ${pinInfo.category === cat ? 'selected' : ''}>${cat}</option>`).join('');
        popupHTML = `<div><img src="${pinInfo.imageURL || pinInfo.image}" alt="User photo" style="width:100%; height:auto; border-radius: 4px;"/><div class="pin-popup-form"><input type="text" id="title-${pinInfo.id}" value="${pinInfo.title}" placeholder="Enter a title"><select id="category-${pinInfo.id}">${optionsHTML}</select><div style="display: flex; justify-content: space-between; gap: 10px;"><button id="update-${pinInfo.id}" style="flex-grow: 1;">Update</button><button id="delete-${pinInfo.id}" style="background-color: #dc3545;">Delete</button></div></div></div>`;
    } else {
        popupHTML = `<div><img src="${pinInfo.imageURL}" alt="Community photo" style="width:100%; border-radius: 4px;"/><p style="margin: 5px 0 0;"><strong>${pinInfo.title}</strong></p><p style="margin: 5px 0 0; font-style: italic; color: #555;">Category: ${pinInfo.category || 'Other'}</p><small>By: <a href="#" class="profile-link" data-userid="${routeInfo.userId}">${routeInfo.username || 'A user'}</a></small></div>`;
    }
    const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(popupHTML);
    popup.on('open', () => {
        if (type === 'user') {
            document.getElementById(`update-${pinInfo.id}`)?.addEventListener('click', () => {
                const pin = state.photoPins.find(p => p.id === pinInfo.id);
                if (pin) {
                    pin.title = document.getElementById(`title-${pinInfo.id}`).value;
                    pin.category = document.getElementById(`category-${pinInfo.id}`).value;
                }
                popup.remove(); alert("Pin updated! Remember to save your session.");
            });
            document.getElementById(`delete-${pinInfo.id}`)?.addEventListener('click', () => {
                if (confirm("Are you sure?")) {
                    state.setPhotoPins(state.photoPins.filter(p => p.id !== pinInfo.id));
                    const markerToRemove = state.userMarkers.find(m => {
                        const lngLat = m.getLngLat();
                        return lngLat.lng === pinInfo.coords[0] && lngLat.lat === pinInfo.coords[1];
                    });
                    if (markerToRemove) {
                        markerToRemove.remove();
                        state.setUserMarkers(state.userMarkers.filter(m => m !== markerToRemove));
                    }
                    updateUserPinsSource();
                    popup.remove();
                }
            });
        } else {
            document.querySelector(`.profile-link[data-userid="${routeInfo.userId}"]`)?.addEventListener('click', (e) => {
                e.preventDefault();
                showPublicProfile(routeInfo.userId);
            });
        }
    });
    return popup;
}

export function showAchievementPopup(badgeKey) {
    const badge = allBadges[badgeKey];
    if (!badge) return;
    const achievementModal = document.getElementById('achievementModal');
    const iconEl = achievementModal.querySelector('.achievement-icon');
    const nameEl = document.getElementById('achievementName');
    const descEl = document.getElementById('achievementDescription');
    iconEl.textContent = badge.icon;
    nameEl.textContent = badge.name;
    descEl.textContent = badge.description;
    achievementModal.style.display = 'flex';
}

export function openMeetupModal(poiName) {
    if (!state.currentUser) {
        alert("Please log in to schedule a meetup.");
        return;
    }
    document.getElementById('meetupLocationName').textContent = poiName;
    document.getElementById('poiNameInput').value = poiName;
    document.getElementById('meetupModal').style.display = 'flex';
    validateMeetupForm();
}

export function openViewMeetupsModal(poiName) {
    document.getElementById('viewMeetupsLocationName').textContent = poiName;
    const meetupsList = document.getElementById('meetupsList');
    meetupsList.innerHTML = '<li>Loading meetups...</li>';
    document.getElementById('viewMeetupsModal').style.display = 'flex';
    const q = query(collection(db, "meetups"), where("poiName", "==", poiName), orderBy("createdAt", "desc"));
    onSnapshot(q, (querySnapshot) => {
        if (querySnapshot.empty) {
            meetupsList.innerHTML = '<li>No meetups scheduled for this location yet. Be the first!</li>';
            return;
        }
        meetupsList.innerHTML = '';
        querySnapshot.forEach((doc) => {
            const meetup = doc.data();
            const li = document.createElement('li');
            const date = meetup.createdAt.toDate().toLocaleDateString();
            li.innerHTML = `
                <div>
                    <span>${meetup.title}</span><br>
                    <small class="session-date">Organized by: ${meetup.organizerName} on ${date}</small>
                    <p style="margin-top: 5px; white-space: pre-wrap;">${meetup.description}</p>
                </div>
            `;
            meetupsList.appendChild(li);
        });
    });
}

export function showCleanupSummary() {
    if (!state.trackingStartTime) return;
    const durationMs = new Date() - state.trackingStartTime;
    const distanceMeters = calculateRouteDistance(state.routeCoordinates);
    const pinsCount = state.photoPins.length;
    const distanceMiles = (distanceMeters * 0.000621371).toFixed(2);
    const minutes = Math.floor(durationMs / 60000);
    const seconds = ((durationMs % 60000) / 1000).toFixed(0);
    document.getElementById('summaryDistance').textContent = `${distanceMiles} mi`;
    document.getElementById('summaryPins').textContent = pinsCount;
    document.getElementById('summaryDuration').textContent = `${minutes}m ${seconds}s`;
    document.getElementById('summaryModal').style.display = 'flex';
    state.setTrackingStartTime(null);
}

export function populateLocalSessionList() {
    const localSessionList = document.getElementById('localSessionList');
    const guestSessions = JSON.parse(localStorage.getItem('guestSessions')) || [];
    localSessionList.innerHTML = '';
    if (guestSessions.length === 0) { localSessionList.innerHTML = '<li>No locally saved sessions found.</li>'; return; }
    guestSessions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).forEach((sessionData, index) => {
        const li = document.createElement('li');
        li.innerHTML = `<div><span>${sessionData.sessionName}</span><br><small class="session-date">${new Date(sessionData.timestamp).toLocaleDateString()}</small></div><button class="delete-session-btn">Delete</button>`;
        li.querySelector('div').addEventListener('click', () => loadSpecificLocalSession(index));
        li.querySelector('button').addEventListener('click', (e) => { 
            e.stopPropagation(); 
            if (confirm(`Are you sure you want to delete "${sessionData.sessionName}"?`)) {
                deleteLocalSession(index);
                populateLocalSessionList();
            }
        });
        localSessionList.appendChild(li);
    });
}

export async function populateSessionList() {
    const sessionList = document.getElementById('sessionList');
    sessionList.innerHTML = '<li>Loading...</li>';
    try {
        const q = query(collection(db, "users", state.currentUser.uid, "privateSessions"), orderBy("timestamp", "desc"));
        const querySnapshot = await getDocs(q);
        sessionList.innerHTML = '';
        if (querySnapshot.empty) { sessionList.innerHTML = '<li>No saved cloud sessions found.</li>'; return; }
        querySnapshot.forEach(doc => {
            const sessionData = doc.data();
            const li = document.createElement('li');
            li.innerHTML = `<div><span>${sessionData.sessionName}</span><br><small class="session-date">${new Date(sessionData.timestamp.seconds * 1000).toLocaleDateString()}</small></div><button class="delete-session-btn">Delete</button>`;
            li.querySelector('div').addEventListener('click', () => loadSpecificSession(doc.id));
            li.querySelector('button').addEventListener('click', async (e) => { 
                e.stopPropagation(); 
                if (confirm(`Are you sure you want to delete "${sessionData.sessionName}"?`)) {
                    const success = await deletePrivateSession(doc.id);
                    if (success) {
                        populateSessionList();
                    }
                }
            });
            sessionList.appendChild(li);
        });
    } catch (error) { console.error("Error fetching sessions:", error); sessionList.innerHTML = '<li>Could not load sessions.</li>'; }
}

/**
 * Main initializer for the entire UI. This function should be exported.
 */
export function initializeUI() {
    // 1. Create the map
    initializeMap();

    state.map.on('dragstart', (e) => { if (e.originalEvent) resetFindMeState(); });
    state.map.on('zoomstart', (e) => { if (e.originalEvent) resetFindMeState(); });


    // 2. Start listening for user login/logout changes
    initializeAuthListener();

    // 3. Attach all the button click listeners
    attachEventListeners();

    // 4. Check if the user has already accepted the terms
    if (sessionStorage.getItem('termsAccepted')) {
        elements.termsModal.style.display = 'none';
        document.getElementById('userStatus').style.display = 'flex';
    } else {
        elements.termsModal.style.display = 'flex';
    }
}

/**
 * Attaches all event listeners to the DOM elements. This is a private helper
 * function called by initializeUI.
 */
export function attachEventListeners() {
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
    elements.authActionBtn.addEventListener('click', async () => {
        if (state.isSignUpMode) await handleSignUp();
        else await handleLogIn();
    });
    elements.logoutBtn.addEventListener('click', handleLogOut);
    elements.emailInput.addEventListener('input', validateSignUpForm);
    elements.passwordInput.addEventListener('input', validateSignUpForm);
    elements.usernameInput.addEventListener('input', validateSignUpForm);
    elements.ageCheckbox.addEventListener('change', validateSignUpForm);
    elements.deleteAccountBtn.addEventListener('click', handleAccountDeletion);

    // --- Main Map Controls ---
    elements.findMeBtn.addEventListener('click', findMe);
    elements.trackBtn.addEventListener('click', toggleTracking);
    elements.pictureBtn.addEventListener('click', () => elements.cameraInput.click());
    elements.cameraInput.addEventListener('change', handlePhoto);
    elements.changeStyleBtn.addEventListener('click', changeMapStyle);
    elements.communityBtn.addEventListener('click', toggleCommunityView);
    elements.centerOnRouteBtn.addEventListener('click', () => {
        if (elements.centerOnRouteBtn.classList.contains('disabled')) {
            alert("Please load a route first to use this feature.");
        } else {
            centerOnRoute();
 elements.dataModal.style.display = 'none';
        }
    });

    // --- Menu & Modals ---
    elements.menuBtn.addEventListener('click', () => elements.menuModal.style.display = 'flex');
    elements.dataBtn.addEventListener('click', () => {
        const hasRoute = state.routeCoordinates.length > 0 || state.photoPins.length > 0;
        elements.menuModal.style.display = 'none';
        elements.centerOnRouteBtn.classList.toggle('disabled', !hasRoute);
        elements.dataModal.style.display = 'flex';
    });
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

    // --- Data Management (Save, Load, Export) ---
    elements.saveBtn.addEventListener('click', saveSession);
    elements.loadBtn.addEventListener('click', () => {
        elements.dataModal.style.display = 'none';
        loadSession();
    });
    elements.exportBtn.addEventListener('click', exportGeoJSON);
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
        elements.dataModal.style.display = 'none';
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
            if (isMyStats) fetchAndDisplayMyStats();
            else fetchAndDisplayLeaderboard(tab.dataset.metric);
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

    // --- Meetups ---
    elements.safetyCheckbox.addEventListener('change', validateMeetupForm);
    elements.meetupTitleInput.addEventListener('input', validateMeetupForm);
    elements.meetupDescriptionInput.addEventListener('input', validateMeetupForm);
    elements.createMeetupBtn.addEventListener('click', handleMeetupSubmit);

    // --- General/Global Listeners ---
    elements.shareBtn.addEventListener('click', shareCleanupResults);
    addAllModalCloseListeners();
}

/**
 * Adds listeners to close modals when clicking the close button or outside the modal content.
 */
export function addAllModalCloseListeners() {
    const allModals = Object.values(elements).filter(el => el && el.classList && el.classList.contains('modal-overlay'));
    allModals.forEach(modal => {
        // Close on 'X' button click
        const closeBtn = modal.querySelector('.close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => modal.style.display = 'none');
        }
        // Close on OK button click (for single-action modals)
        const okBtn = modal.querySelector('.ok-btn');
        if (okBtn) {
            okBtn.addEventListener('click', () => modal.style.display = 'none');
        }
    });

    // Close on overlay click
    window.addEventListener('click', (event) => {
        if (event.target.classList.contains('modal-overlay')) {
            event.target.style.display = 'none';
        }
    });
}

/**
 * Updates the UI to reflect the user's login status.
 * This function must be exported so it can be called from auth.js.
 * @param {boolean} isLoggedIn - Whether the user is logged in.
 * @param {string} [username] - The user's name to display.
 */
export function updateLoggedInStatusUI(isLoggedIn, username = '') {
    // Get references to all the UI elements that change
    const userStatus = document.getElementById('userStatus');
    const loggedInContent = document.getElementById('loggedInContent');
    const guestContent = document.getElementById('guestContent');
    const userEmailSpan = document.getElementById('userEmail');
    const authModal = document.getElementById('authModal');
    const publishBtn = document.getElementById('publishBtn');
    const managePublicationsBtn = document.getElementById('managePublicationsBtn');
    const editProfileBtn = document.getElementById('editProfileBtn');

    // This container is always visible once the terms are accepted
    if (userStatus) userStatus.style.display = 'flex';

    if (isLoggedIn) {
        // --- UI State for a Logged-In User ---
        if (userEmailSpan) userEmailSpan.textContent = `Logged in as: ${username}`;
        if (loggedInContent) loggedInContent.style.display = 'flex';
        if (guestContent) guestContent.style.display = 'none';
        if (authModal) authModal.style.display = 'none'; // Close the login modal if it's open
        if (publishBtn) publishBtn.style.display = 'block';
        if (managePublicationsBtn) managePublicationsBtn.style.display = 'block';
        if (editProfileBtn) editProfileBtn.style.display = 'block';
    } else {
        // --- UI State for a Guest User ---
        if (loggedInContent) loggedInContent.style.display = 'none';
        if (guestContent) guestContent.style.display = 'block';
        if (publishBtn) publishBtn.style.display = 'none';
        if (managePublicationsBtn) managePublicationsBtn.style.display = 'none';
        if (editProfileBtn) editProfileBtn.style.display = 'none';
    }
}


