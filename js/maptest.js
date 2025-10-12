import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, addDoc, getDocs, query, orderBy, where, deleteDoc, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    deleteUser
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCE1b6VtJjUs0O5YvyLjeslxuHC8UlgJUM",
  authDomain: "garbagepathv2.firebaseapp.com",
  projectId: "garbagepathv2",
  storageBucket: "garbagepathv2.firebasestorage.app",
  messagingSenderId: "505856089619",
  appId: "1:505856089619:web:682f58d02be4295be4a9e6",
  measurementId: "G-SM46WXV0CN"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore();
const auth = getAuth();
const storage = getStorage();
console.log("Firebase Initialized!");

let currentUser = null;
let trackingWatcher = null;
let routeCoordinates = [];
let photoPins = [];
let map;
let findMeMarker = null;
let isCommunityViewOn = false;
let communityLayers = [];
let isSignUpMode = true;
let userMarkers = [];
let communityMarkers = [];
const ZOOM_THRESHOLD = 14;
let trackingStartTime = null;
const profanityList = ["word1", "word2", "word3"];

const mapStyles = [
    { name: 'Streets', url: 'mapbox://styles/mapbox/streets-v12' },
    { name: 'Outdoors', url: 'mapbox://styles/mapbox/outdoors-v12' },
    { name: 'Light', url: 'mapbox://styles/mapbox/light-v11' },
    { name: 'Dark', url: 'mapbox://styles/mapbox/dark-v11' },
    { name: 'Satellite', url: 'mapbox://styles/mapbox/satellite-streets-v12' }
];
let currentStyleIndex = 0;

const allBadges = {
    first_find: { name: 'First Find', icon: '🗑️', description: 'Pinned your very first piece of litter.' },
    collector: { name: 'Collector', icon: '🛍️', description: 'Pinned a total of 50 items.' },
    super_collector: { name: 'Super Collector', icon: '🏆', description: 'Pinned a total of 250 items.' },
    eagle_eye: { name: 'Eagle Eye', icon: '🦅', description: 'Pinned 1000 items. A true garbage spotter!' },
    first_steps: { name: 'First Steps', icon: '👟', description: 'Completed your first route over 1km.' },
    explorer: { name: 'Explorer', icon: '🗺️', description: 'Walked a total of 25 kilometers.' },
    trailblazer: { name: 'Trailblazer', icon: '⛰️', description: 'Walked a total of 100 kilometers.' },
    marathoner: { name: 'Marathoner', icon: '🏃', description: 'Walked over 42.2km in a single session.' },
    initiate: { name: 'Initiate', icon: '🌱', description: 'Published your first route to the community.' },
    activist: { name: 'Activist', icon: '🌍', description: 'Published 10 routes to the community.' },
    guardian: { name: 'Guardian', icon: '🛡️', description: 'Published 50 routes to the community.' },
    community_pillar: { name: 'Community Pillar', icon: '🏛️', description: 'Published 100 routes. You are a legend!' }
};


document.addEventListener('DOMContentLoaded', () => {
    
    checkAndClearOldData();

    const termsModal = document.getElementById('termsModal');
    const authModal = document.getElementById('authModal');
    const agreeBtn = document.getElementById('agreeBtn');
    const termsCheckbox = document.getElementById('termsCheckbox');
    const skipBtn = document.getElementById('skipBtn');
    const findMeBtn = document.getElementById('findMeBtn');
    const trackBtn = document.getElementById('trackBtn');
    const pictureBtn = document.getElementById('pictureBtn');
    const cameraInput = document.getElementById('cameraInput');
    const dataBtn = document.getElementById('dataBtn');
    const dataModal = document.getElementById('dataModal');
    const closeDataModalBtn = dataModal.querySelector('.close-btn');
    const saveBtn = document.getElementById('saveBtn');
    const loadBtn = document.getElementById('loadBtn');
    const exportBtn = document.getElementById('exportBtn');
    const communityBtn = document.getElementById('communityBtn');
    const publishBtn = document.getElementById('publishBtn');
    const loginSignupBtn = document.getElementById('loginSignupBtn');
    const sessionsModal = document.getElementById('sessionsModal');
    const sessionsModalCloseBtn = sessionsModal.querySelector('.close-btn');
    const localSessionsModal = document.getElementById('localSessionsModal');
    const localSessionsModalCloseBtn = localSessionsModal.querySelector('.close-btn');
    const infoBtn = document.getElementById('infoBtn');
    const infoModal = document.getElementById('infoModal');
    const infoModalCloseBtn = infoModal.querySelector('.close-btn');
    const authActionBtn = document.getElementById('authActionBtn');
    const managePublicationsBtn = document.getElementById('managePublicationsBtn');
    const publishedRoutesModal = document.getElementById('publishedRoutesModal');
    const publishedRoutesModalCloseBtn = publishedRoutesModal.querySelector('.close-btn');
    const viewTermsLink = document.getElementById('viewTermsLink');
    const editProfileBtn = document.getElementById('editProfileBtn');
    const profileModal = document.getElementById('profileModal');
    const profileModalCloseBtn = profileModal.querySelector('.close-btn');
    const saveProfileBtn = document.getElementById('saveProfileBtn');
    const publicProfileModal = document.getElementById('publicProfileModal');
    const publicProfileModalCloseBtn = publicProfileModal.querySelector('.close-btn');
    const deleteAccountBtn = document.getElementById('deleteAccountBtn');
    const ageCheckbox = document.getElementById('ageCheckbox');
    const emailInput = document.getElementById('emailInput');
    const passwordInput = document.getElementById('passwordInput');
    const usernameInput = document.getElementById('usernameInput');
    const safetyModal = document.getElementById('safetyModal');
    const safetyModalOkBtn = document.getElementById('safetyModalOkBtn');
    const safetyModalCloseBtn = safetyModal.querySelector('.close-btn');
    const changeStyleBtn = document.getElementById('changeStyleBtn');
    const centerOnRouteBtn = document.getElementById('centerOnRouteBtn');
    const summaryModal = document.getElementById('summaryModal');
    const summaryOkBtn = document.getElementById('summaryOkBtn');
    const summaryModalCloseBtn = summaryModal.querySelector('.close-btn');
    const leaderboardBtn = document.getElementById('leaderboardBtn');
    const leaderboardModal = document.getElementById('leaderboardModal');
    const leaderboardModalCloseBtn = leaderboardModal.querySelector('.close-btn');
    const leaderboardTabs = document.querySelectorAll('.leaderboard-tab');
    const myStatsBtn = document.getElementById('myStatsBtn');
    const achievementModal = document.getElementById('achievementModal');
    const achievementOkBtn = document.getElementById('achievementOkBtn');
    const meetupModal = document.getElementById('meetupModal');
    const meetupModalCloseBtn = meetupModal.querySelector('.close-btn');
    const createMeetupBtn = document.getElementById('createMeetupBtn');
    const safetyCheckbox = document.getElementById('safetyCheckbox');
    const meetupTitleInput = document.getElementById('meetupTitleInput');
    const meetupDescriptionInput = document.getElementById('meetupDescriptionInput');
    const viewMeetupsModal = document.getElementById('viewMeetupsModal');
    const viewMeetupsModalCloseBtn = viewMeetupsModal.querySelector('.close-btn');
    const shareBtn = document.getElementById('shareBtn');
    const leaderboardList = document.getElementById('leaderboardList');
    const menuBtn = document.getElementById('menuBtn');
    const menuModal = document.getElementById('menuModal');
    const menuModalCloseBtn = menuModal.querySelector('.close-btn');

    onAuthStateChanged(auth, async (user) => {
        const userStatus = document.getElementById('userStatus');
        const loggedInContent = document.getElementById('loggedInContent');
        const guestContent = document.getElementById('guestContent');
        const userEmailSpan = document.getElementById('userEmail');
        const publishBtn = document.getElementById('publishBtn');
        const managePublicationsBtn = document.getElementById('managePublicationsBtn');
        const editProfileBtn = document.getElementById('editProfileBtn');

        if(userStatus) userStatus.style.display = 'flex';

        if (user) {
            currentUser = user;
            try {
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
                    console.log("User profile missing! Creating a default one.");
                    const defaultUsername = user.email.split('@')[0];
                    await setDoc(publicProfileRef, {
                        username: defaultUsername,
                        bio: "This user is new to Litter Bugs!",
                        location: "",
                        buyMeACoffeeLink: "",
                        badges: {}
                    });
                    username = defaultUsername;
                }
                if (userEmailSpan) {
                    userEmailSpan.textContent = `Logged in as: ${username}`;
                }
            } catch (error) {
                console.error("Error fetching or updating user profile:", error);
            }
            if (loggedInContent) loggedInContent.style.display = 'flex';
            if (guestContent) guestContent.style.display = 'none';
            if (authModal) authModal.style.display = 'none';
            if (publishBtn) publishBtn.style.display = 'block';
            if (managePublicationsBtn) managePublicationsBtn.style.display = 'block';
            if (editProfileBtn) editProfileBtn.style.display = 'block';
        } else {
            currentUser = null;
            if (loggedInContent) loggedInContent.style.display = 'none';
            if (guestContent) guestContent.style.display = 'block';
            if (publishBtn) publishBtn.style.display = 'none';
            if (managePublicationsBtn) managePublicationsBtn.style.display = 'none';
            if (editProfileBtn) editProfileBtn.style.display = 'none';
        }
    });

    if (sessionStorage.getItem('termsAccepted')) {
        termsModal.style.display = 'none';
        document.getElementById('userStatus').style.display = 'flex';
    } else {
        termsModal.style.display = 'flex';
    }

    mapboxgl.accessToken = 'pk.eyJ1IjoicDFjcmVhdGlvbnMiLCJhIjoiY2p6ajZvejJmMDZhaTNkcWpiN294dm12eCJ9.8ckNT6kfuJry7K7GAeIuxw';
    map = new mapboxgl.Map({
        container: 'map',
        style: mapStyles[currentStyleIndex].url,
        center: [-87.6298, 41.8781],
        zoom: 10
    });
    
    const geocoder = new MapboxGeocoder({
        accessToken: mapboxgl.accessToken,
        mapboxgl: mapboxgl,
        marker: false,
        placeholder: 'Search for a place'
    });
    document.getElementById('geocoder-container').appendChild(geocoder.onAdd(map));

    map.on('load', () => {
        initializeMapLayers();
        setupPoiClickListeners();
    });
    
    map.on('zoom', () => {
        toggleMarkerVisibility();
    });

    const validateSignUpForm = () => {
        const isEmailValid = emailInput.value.includes('@');
        const isPasswordValid = passwordInput.value.length >= 6;
        const isUsernameValid = usernameInput.value.trim().length >= 3;
        const isAgeChecked = ageCheckbox.checked;
        if (isSignUpMode) {
            authActionBtn.disabled = !(isEmailValid && isPasswordValid && isUsernameValid && isAgeChecked);
        } else {
            authActionBtn.disabled = !(isEmailValid && isPasswordValid);
        }
    };
    emailInput.addEventListener('input', validateSignUpForm);
    passwordInput.addEventListener('input', validateSignUpForm);
    usernameInput.addEventListener('input', validateSignUpForm);
    ageCheckbox.addEventListener('change', validateSignUpForm);
    infoBtn.addEventListener('click', () => infoModal.style.display = 'flex');
    infoModalCloseBtn.addEventListener('click', () => infoModal.style.display = 'none');
    viewTermsLink.addEventListener('click', (e) => {
        e.preventDefault();
        infoModal.style.display = 'none';
        termsModal.style.display = 'flex';
    });
    termsCheckbox.addEventListener('change', () => agreeBtn.disabled = !termsCheckbox.checked);
    agreeBtn.addEventListener('click', () => {
        termsModal.style.display = 'none';
        sessionStorage.setItem('termsAccepted', 'true');
        document.getElementById('userStatus').style.display = 'flex';
        if (!currentUser) authModal.style.display = 'flex';
    });
    loginSignupBtn.addEventListener('click', () => authModal.style.display = 'flex');
    document.getElementById('authModal').addEventListener('click', (e) => {
        if (e.target.id === 'switchAuthModeLink') {
            e.preventDefault();
            isSignUpMode = !isSignUpMode;
            updateAuthModalUI();
        }
    });
    authActionBtn.addEventListener('click', async () => {
        if (isSignUpMode) await handleSignUp();
        else await handleLogIn();
    });
    document.getElementById('logoutBtn').addEventListener('click', async () => await signOut(auth));
    skipBtn.addEventListener('click', () => authModal.style.display = 'none');
    findMeBtn.addEventListener('click', findMe);
    trackBtn.addEventListener('click', toggleTracking);
    pictureBtn.addEventListener('click', () => cameraInput.click());
    cameraInput.addEventListener('change', handlePhoto);
    dataBtn.addEventListener('click', () => {
        const centerOnRouteBtn = document.getElementById('centerOnRouteBtn');
        const hasRoute = routeCoordinates.length > 0 || photoPins.length > 0;
        
        menuModal.style.display = 'none'; // Close the menu modal
        
        centerOnRouteBtn.classList.toggle('disabled', !hasRoute);
        dataModal.style.display = 'flex'; // Open the data modal
    });
    closeDataModalBtn.addEventListener('click', () => dataModal.style.display = 'none');
    sessionsModalCloseBtn.addEventListener('click', () => sessionsModal.style.display = 'none');
    localSessionsModalCloseBtn.addEventListener('click', () => localSessionsModal.style.display = 'none');
    publishedRoutesModalCloseBtn.addEventListener('click', () => publishedRoutesModal.style.display = 'none');
    profileModalCloseBtn.addEventListener('click', () => profileModal.style.display = 'none');
    publicProfileModalCloseBtn.addEventListener('click', () => publicProfileModal.style.display = 'none');
    safetyModalCloseBtn.addEventListener('click', () => safetyModal.style.display = 'none');
    safetyModalOkBtn.addEventListener('click', () => {
        safetyModal.style.display = 'none';
        startTracking();
    });
    summaryModalCloseBtn.addEventListener('click', () => summaryModal.style.display = 'none');
    summaryOkBtn.addEventListener('click', () => summaryModal.style.display = 'none');
    shareBtn.addEventListener('click', shareCleanupResults);
    leaderboardBtn.addEventListener('click', () => {
        leaderboardModal.style.display = 'flex';
        document.getElementById('leaderboardList').style.display = 'block';
        document.getElementById('myStatsContainer').style.display = 'none';
        leaderboardTabs.forEach(t => t.classList.remove('active'));
        document.querySelector('.leaderboard-tab[data-metric="totalPins"]').classList.add('active');
        fetchAndDisplayLeaderboard('totalPins');
    });
    leaderboardModalCloseBtn.addEventListener('click', () => leaderboardModal.style.display = 'none');
    leaderboardTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            leaderboardTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            if (tab.id === 'myStatsBtn') {
                document.getElementById('leaderboardList').style.display = 'none';
                document.getElementById('myStatsContainer').style.display = 'block';
                fetchAndDisplayMyStats();
            } else {
                document.getElementById('leaderboardList').style.display = 'block';
                document.getElementById('myStatsContainer').style.display = 'none';
                fetchAndDisplayLeaderboard(tab.dataset.metric);
            }
        });
    });
    leaderboardList.addEventListener('click', (e) => {
        if (e.target && e.target.classList.contains('leaderboard-profile-link')) {
            e.preventDefault();
            const userId = e.target.closest('li').dataset.userid;
            if (userId) {
                leaderboardModal.style.display = 'none';
                showPublicProfile(userId);
            }
        }
    });
    window.addEventListener('click', (event) => {
        const modals = [dataModal, sessionsModal, localSessionsModal, infoModal, authModal, publishedRoutesModal, profileModal, publicProfileModal, safetyModal, summaryModal, leaderboardModal, achievementModal, meetupModal, viewMeetupsModal, menuModal];
        if (modals.includes(event.target)) {
            modals.forEach(m => m.style.display = 'none');
        }
    });
    achievementOkBtn.addEventListener('click', () => achievementModal.style.display = 'none');
    meetupModalCloseBtn.addEventListener('click', () => meetupModal.style.display = 'none');
    viewMeetupsModalCloseBtn.addEventListener('click', () => viewMeetupsModal.style.display = 'none');
    safetyCheckbox.addEventListener('change', validateMeetupForm);
    meetupTitleInput.addEventListener('input', validateMeetupForm);
    meetupDescriptionInput.addEventListener('input', validateMeetupForm);
    createMeetupBtn.addEventListener('click', handleMeetupSubmit);
    saveBtn.addEventListener('click', saveSession);
    loadBtn.addEventListener('click', () => {
        dataModal.style.display = 'none';
        loadSession();
    });
    exportBtn.addEventListener('click', exportGeoJSON);
    communityBtn.addEventListener('click', toggleCommunityView);
    publishBtn.addEventListener('click', publishRoute);
    managePublicationsBtn.addEventListener('click', () => {
        if (!currentUser) { alert("You must be logged in to manage your publications."); return; }
        dataModal.style.display = 'none';
        populatePublishedRoutesList();
        publishedRoutesModal.style.display = 'flex';
    });
    editProfileBtn.addEventListener('click', () => {
        if (!currentUser) { alert("You must be logged in to edit your profile."); return; }
        dataModal.style.display = 'none';
        loadProfileForEditing();
        profileModal.style.display = 'flex';
    });
    saveProfileBtn.addEventListener('click', saveProfile);
    deleteAccountBtn.addEventListener('click', handleAccountDeletion);
    changeStyleBtn.addEventListener('click', changeMapStyle);
    centerOnRouteBtn.addEventListener('click', () => {
        if (centerOnRouteBtn.classList.contains('disabled')) {
            alert("Please load a route first to use this feature.");
        } else {
            centerOnRoute();
        }
    });
    menuBtn.addEventListener('click', () => menuModal.style.display = 'flex');
    menuModalCloseBtn.addEventListener('click', () => menuModal.style.display = 'none');
});

function initializeMapLayers() {
    if (!map.getSource('user-route')) map.addSource('user-route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } } });
    if (!map.getLayer('user-route')) map.addLayer({ id: 'user-route', type: 'line', source: 'user-route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#007bff', 'line-width': 5 } });
    if (!map.getSource('user-location-point')) map.addSource('user-location-point', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Point', 'coordinates': [] } } });
    if (!map.getLayer('user-location-pulse')) map.addLayer({ id: 'user-location-pulse', type: 'circle', source: 'user-location-point', paint: { 'circle-radius': 15, 'circle-color': '#007bff', 'circle-opacity': 0.2 } });
    if (!map.getLayer('user-location-dot')) map.addLayer({ id: 'user-location-dot', type: 'circle', source: 'user-location-point', paint: { 'circle-radius': 6, 'circle-color': '#fff', 'circle-stroke-width': 2, 'circle-stroke-color': '#007bff' } });
    if (!map.getSource('user-pins-source')) map.addSource('user-pins-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    if (!map.getLayer('user-pins-dots')) map.addLayer({ id: 'user-pins-dots', type: 'circle', source: 'user-pins-source', maxzoom: ZOOM_THRESHOLD, paint: { 'circle-radius': 6, 'circle-color': '#007bff', 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' } });
    if (!map.getSource('community-pins-source')) map.addSource('community-pins-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    if (!map.getLayer('community-pins-dots')) map.addLayer({ id: 'community-pins-dots', type: 'circle', source: 'community-pins-source', maxzoom: ZOOM_THRESHOLD, paint: { 'circle-radius': 6, 'circle-color': '#28a745', 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' } });
}

function changeMapStyle() {
    currentStyleIndex = (currentStyleIndex + 1) % mapStyles.length;
    map.setStyle(mapStyles[currentStyleIndex].url);
    map.once('style.load', () => {
        initializeMapLayers();
        userMarkers.forEach(marker => marker.addTo(map));
        communityMarkers.forEach(marker => marker.addTo(map));
        toggleMarkerVisibility();
        if (isCommunityViewOn) fetchAndDisplayCommunityRoutes();
        updateUserPinsSource();
    });
}

function toggleMarkerVisibility() {
    const display = map.getZoom() >= ZOOM_THRESHOLD ? 'block' : 'none';
    userMarkers.forEach(marker => marker.getElement().style.display = display);
    communityMarkers.forEach(marker => marker.getElement().style.display = display);
}

function convertRouteForFirestore(coordsArray) { if (!coordsArray) return []; return coordsArray.map(coord => ({ lng: coord[0], lat: coord[1] })); }
function convertRouteFromFirestore(coordsData) { if (!coordsData || coordsData.length === 0) return []; if (Array.isArray(coordsData[0])) { return coordsData; } return coordsData.map(coord => [coord.lng, coord.lat]); }
function convertPinsForFirestore(pinsArray) { if (!pinsArray) return []; return pinsArray.map(pin => { const newPin = { ...pin }; if (Array.isArray(newPin.coords)) { newPin.coords = { lng: newPin.coords[0], lat: newPin.coords[1] }; } return newPin; }); }
function convertPinsFromFirestore(pinsData) { if (!pinsData || pinsData.length === 0) return []; return pinsData.map(pin => { const newPin = { ...pin }; if (newPin.coords && typeof newPin.coords === 'object' && !Array.isArray(newPin.coords)) { newPin.coords = [newPin.coords.lng, newPin.coords.lat]; } return newPin; }); }

function checkAndClearOldData() {
    const guestSessionsJSON = localStorage.getItem('guestSessions');
    if (guestSessionsJSON) {
        try {
            const guestSessions = JSON.parse(guestSessionsJSON);
            if (guestSessions.length > 0 && guestSessions[0].route && Array.isArray(guestSessions[0].route[0])) {
                alert("The app has been updated. Your old locally saved sessions are no longer compatible and will be cleared.");
                localStorage.removeItem('guestSessions');
            }
        } catch (error) {
            console.error("Error parsing old guest sessions, clearing data.", error);
            localStorage.removeItem('guestSessions');
        }
    }
}

function updateAuthModalUI() {
    const authForm = document.getElementById('authForm'), authTitle = document.getElementById('authTitle'), authSubtitle = document.getElementById('authSubtitle'), authActionBtn = document.getElementById('authActionBtn'), emailInput = document.getElementById('emailInput'), passwordInput = document.getElementById('passwordInput'), usernameInput = document.getElementById('usernameInput'), ageCheckbox = document.getElementById('ageCheckbox');
    document.getElementById('authError').textContent = '';
    if (isSignUpMode) {
        authTitle.textContent = 'Create a Litter Bugs Account'; authSubtitle.innerHTML = 'Or <a href="#" id="switchAuthModeLink">log in to an existing account.</a>'; authActionBtn.textContent = 'Sign Up'; authForm.classList.add('signup-mode'); authForm.classList.remove('login-mode');
    } else {
        authTitle.textContent = 'Log In to Litter Bugs'; authSubtitle.innerHTML = 'Or <a href="#" id="switchAuthModeLink">create a new account.</a>'; authActionBtn.textContent = 'Log In'; authForm.classList.add('login-mode'); authForm.classList.remove('signup-mode');
    }
    const isEmailValid = emailInput.value.includes('@'), isPasswordValid = passwordInput.value.length >= 6, isUsernameValid = usernameInput.value.trim().length >= 3, isAgeChecked = ageCheckbox.checked;
    authActionBtn.disabled = isSignUpMode ? !(isEmailValid && isPasswordValid && isUsernameValid && isAgeChecked) : !(isEmailValid && isPasswordValid);
}

async function handleSignUp() {
    const email = document.getElementById('emailInput').value;
    const password = document.getElementById('passwordInput').value;
    const username = document.getElementById('usernameInput').value;
    const ageCheckbox = document.getElementById('ageCheckbox');
    const authError = document.getElementById('authError');
    authError.textContent = '';
    if (!ageCheckbox.checked) { authError.textContent = 'You must certify that you are 18 or older to sign up.'; return; }
    if (!username || username.trim().length < 3) { authError.textContent = 'Username must be at least 3 characters.'; return; }
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const userId = userCredential.user.uid;
        await setDoc(doc(db, "users", userId), { 
            email: userCredential.user.email, 
            totalPins: 0, 
            totalDistance: 0, 
            totalRoutes: 0 
        });
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

async function handleLogIn() {
    const email = document.getElementById('emailInput').value, password = document.getElementById('passwordInput').value, authError = document.getElementById('authError');
    authError.textContent = '';
    try { await signInWithEmailAndPassword(auth, email, password); } catch (error) { authError.textContent = error.message; }
}

function findMe() {
    if (findMeMarker) findMeMarker.remove();
    navigator.geolocation.getCurrentPosition(position => {
        const { latitude, longitude } = position.coords;
        findMeMarker = new mapboxgl.Marker().setLngLat([longitude, latitude]).addTo(map);
        map.flyTo({ center: [longitude, latitude], zoom: 15 });
    }, () => alert("Could not get your location."), { enableHighAccuracy: true });
}

function toggleTracking() {
    const trackBtn = document.getElementById('trackBtn');
    if (trackingWatcher) {
        navigator.geolocation.clearWatch(trackingWatcher);
        trackingWatcher = null;
        trackBtn.textContent = '🛰️ Start Tracking';
        trackBtn.classList.remove('tracking');
        if (map.getSource('user-location-point')) map.getSource('user-location-point').setData({ type: 'Feature', geometry: { type: 'Point', coordinates: [] } });
        showCleanupSummary();
    } else { document.getElementById('safetyModal').style.display = 'flex'; }
}

function startTracking() {
    clearCurrentSession();
    const trackBtn = document.getElementById('trackBtn');
    trackingStartTime = new Date();
    navigator.geolocation.getCurrentPosition(pos => map.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 16 }));
    trackingWatcher = navigator.geolocation.watchPosition(pos => {
        const newCoord = [pos.coords.longitude, pos.coords.latitude];
        routeCoordinates.push(newCoord);
        if (map.getSource('user-route')) map.getSource('user-route').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: routeCoordinates } });
        if (map.getSource('user-location-point')) map.getSource('user-location-point').setData({ type: 'Feature', geometry: { type: 'Point', coordinates: newCoord } });
    }, () => alert("Error watching position."), { enableHighAccuracy: true });
    trackBtn.textContent = '🛑 Stop Tracking';
    trackBtn.classList.add('tracking');
}

async function handlePhoto(event) {
    const pictureBtn = document.getElementById('pictureBtn');
    const originalButtonText = pictureBtn.innerHTML;
    if (!event.target.files || event.target.files.length === 0) { event.target.value = ''; return; }
    const file = event.target.files[0];
    pictureBtn.innerHTML = 'Processing...'; pictureBtn.disabled = true;
    const options = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true };
    let processedFile;
    try {
        processedFile = await imageCompression(file, options);
    } catch (error) {
        console.error("Image compression error:", error); alert("Error processing image.");
        pictureBtn.innerHTML = originalButtonText; pictureBtn.disabled = false; event.target.value = ''; return;
    }
    navigator.geolocation.getCurrentPosition(async (position) => {
        const coords = [position.coords.longitude, position.coords.latitude];
        const defaultTitle = `Pin ${photoPins.length + 1}`;
        if (!currentUser) {
            const reader = new FileReader();
            reader.readAsDataURL(processedFile);
            reader.onload = e => {
                const pinInfo = { id: `pin-${Date.now()}`, coords, image: e.target.result, title: defaultTitle, category: 'Other' };
                photoPins.push(pinInfo);
                const newMarker = createAndAddMarker(pinInfo, 'user');
                newMarker.togglePopup();
                updateUserPinsSource();
            };
        } else {
            try {
                const timestamp = Date.now();
                const storageRef = ref(storage, `photos/${currentUser.uid}/${timestamp}-${processedFile.name}`);
                const snapshot = await uploadBytes(storageRef, processedFile);
                const downloadURL = await getDownloadURL(snapshot.ref);
                const pinInfo = { id: `pin-${timestamp}`, coords, imageURL: downloadURL, title: defaultTitle, category: 'Other' };
                photoPins.push(pinInfo);
                const newMarker = createAndAddMarker(pinInfo, 'user');
                newMarker.togglePopup();
                updateUserPinsSource();
            } catch (error) { console.error("Error uploading photo:", error); alert("Photo upload failed."); }
        }
        pictureBtn.innerHTML = originalButtonText; pictureBtn.disabled = false; event.target.value = '';
    }, () => {
        alert("Could not get location. Photo was not pinned.");
        pictureBtn.innerHTML = originalButtonText; pictureBtn.disabled = false; event.target.value = '';
    }, { enableHighAccuracy: true });
}

function createAndAddMarker(pinInfo, type, routeInfo = {}) {
    const el = document.createElement('div');
    el.className = 'photo-marker';
    el.style.backgroundImage = `url(${pinInfo.imageURL || pinInfo.image})`;
    el.style.display = map.getZoom() >= ZOOM_THRESHOLD ? 'block' : 'none';
    const popup = createPinPopup(pinInfo, type, routeInfo);
    const marker = new mapboxgl.Marker(el).setLngLat(pinInfo.coords).setPopup(popup).addTo(map);
    if (type === 'user') {
        userMarkers.push(marker);
    } else {
        el.style.borderColor = '#28a745';
        communityMarkers.push(marker);
    }
    return marker;
}
// MODIFIED: createPinPopup now includes the expanded list of categories.
function createPinPopup(pinInfo, type, routeInfo = {}) {
    let popupHTML;
    if (type === 'user') {
        // NEW expanded category list
        const categories = ['Plastic', 'Glass', 'Metal', 'Paper', 'Cardboard', 'Styrofoam', 'Cigarette Butts', 'Food Waste', 'Fabric/Clothing', 'Electronics', 'Other'];
        const optionsHTML = categories.map(cat => `<option value="${cat}" ${pinInfo.category === cat ? 'selected' : ''}>${cat}</option>`).join('');
        popupHTML = `<div><img src="${pinInfo.imageURL || pinInfo.image}" alt="User photo" style="width:100%; height:auto; border-radius: 4px;"/><div class="pin-popup-form"><input type="text" id="title-${pinInfo.id}" value="${pinInfo.title}" placeholder="Enter a title"><select id="category-${pinInfo.id}">${optionsHTML}</select><div style="display: flex; justify-content: space-between; gap: 10px;"><button id="update-${pinInfo.id}" style="flex-grow: 1;">Update</button><button id="delete-${pinInfo.id}" style="background-color: #dc3545;">Delete</button></div></div></div>`;
    } else {
        popupHTML = `<div><img src="${pinInfo.imageURL}" alt="Community photo" style="width:100%; border-radius: 4px;"/><p style="margin: 5px 0 0;"><strong>${pinInfo.title}</strong></p><p style="margin: 5px 0 0; font-style: italic; color: #555;">Category: ${pinInfo.category || 'Other'}</p><small>By: <a href="#" class="profile-link" data-userid="${routeInfo.userId}">${routeInfo.username || 'A user'}</a></small></div>`;
    }
    const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(popupHTML);
    popup.on('open', () => {
        if (type === 'user') {
            document.getElementById(`update-${pinInfo.id}`)?.addEventListener('click', () => {
                const pin = photoPins.find(p => p.id === pinInfo.id);
                if (pin) {
                    pin.title = document.getElementById(`title-${pinInfo.id}`).value;
                    pin.category = document.getElementById(`category-${pinInfo.id}`).value;
                }
                popup.remove(); alert("Pin updated! Remember to save your session.");
            });
            document.getElementById(`delete-${pinInfo.id}`)?.addEventListener('click', () => {
                if (confirm("Are you sure?")) {
                    photoPins = photoPins.filter(p => p.id !== pinInfo.id);
                    const markerToRemove = userMarkers.find(m => {
                        const lngLat = m.getLngLat();
                        return lngLat.lng === pinInfo.coords[0] && lngLat.lat === pinInfo.coords[1];
                    });
                    if (markerToRemove) {
                        markerToRemove.remove();
                        userMarkers = userMarkers.filter(m => m !== markerToRemove);
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

function updateUserPinsSource() {
    const features = photoPins.map(pin => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: pin.coords },
        properties: {}
    }));
    if (map.getSource('user-pins-source')) {
        map.getSource('user-pins-source').setData({ type: 'FeatureCollection', features });
    }
}

async function toggleCommunityView() {
    isCommunityViewOn = !isCommunityViewOn;
    const communityBtn = document.getElementById('communityBtn');
    if (isCommunityViewOn) {
        communityBtn.textContent = '🌎 Community View: ON'; communityBtn.classList.remove('off');
        await fetchAndDisplayCommunityRoutes();
    } else {
        communityBtn.textContent = '🌎 Community View: OFF'; communityBtn.classList.add('off');
        clearCommunityRoutes();
    }
}

async function fetchAndDisplayCommunityRoutes() {
    try {
        const q = query(collection(db, "publishedRoutes"), orderBy("timestamp", "desc"));
        const querySnapshot = await getDocs(q);
        clearCommunityRoutes();
        let allCommunityPinFeatures = [];
        querySnapshot.forEach(doc => {
            const routeData = doc.data();
            const routeId = doc.id;
            const mapboxCoords = convertRouteFromFirestore(routeData.route);
            const mapboxPins = convertPinsFromFirestore(routeData.pins);
            map.addSource(`community-route-${routeId}`, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: mapboxCoords } } });
            map.addLayer({ id: `community-route-${routeId}`, type: 'line', source: `community-route-${routeId}`, paint: { 'line-color': '#28a745', 'line-width': 4, 'line-opacity': 0.7 } });
            communityLayers.push({ id: `community-route-${routeId}`, type: 'layer' });
            if (mapboxPins) {
                mapboxPins.forEach(pin => {
                    createAndAddMarker(pin, 'community', { userId: routeData.userId, username: routeData.username });
                    allCommunityPinFeatures.push({
                        type: 'Feature',
                        geometry: { type: 'Point', coordinates: pin.coords },
                        properties: {}
                    });
                });
            }
        });
        if (map.getSource('community-pins-source')) map.getSource('community-pins-source').setData({ type: 'FeatureCollection', features: allCommunityPinFeatures });
    } catch (error) { console.error("Error fetching community routes:", error); alert("Could not load community data."); }
}

function clearCommunityRoutes() {
    communityMarkers.forEach(marker => marker.remove());
    communityMarkers = [];
    communityLayers.forEach(layer => {
        if (map.getLayer(layer.id)) map.removeLayer(layer.id);
        if (map.getSource(layer.id)) map.removeSource(layer.id);
    });
    if (map.getSource('community-pins-source')) map.getSource('community-pins-source').setData({ type: 'FeatureCollection', features: [] });
    communityLayers = [];
}

async function publishRoute() {
    if (!currentUser) return;
    if (routeCoordinates.length < 2 || photoPins.length === 0) { alert("You need a tracked route and at least one photo pin to publish."); return; }
    
    const dataModal = document.getElementById('dataModal');
    dataModal.style.display = 'none';

    try {
        const publicProfileRef = doc(db, "publicProfiles", currentUser.uid);
        
        const beforeSnap = await getDoc(publicProfileRef);
        const badgesBefore = beforeSnap.exists() ? Object.keys(beforeSnap.data().badges || {}) : [];

        const username = beforeSnap.exists() ? beforeSnap.data().username : "Anonymous";
        await addDoc(collection(db, "publishedRoutes"), { 
            userId: currentUser.uid, 
            username, 
            timestamp: new Date(), 
            route: convertRouteForFirestore(routeCoordinates), 
            pins: convertPinsForFirestore(photoPins) 
        });
        
        await new Promise(resolve => setTimeout(resolve, 2000)); 

        const afterSnap = await getDoc(publicProfileRef);
        const badgesAfter = afterSnap.exists() ? Object.keys(afterSnap.data().badges || {}) : [];

        const newBadges = badgesAfter.filter(badge => !badgesBefore.includes(badge));

        if (newBadges.length > 0) {
            showAchievementPopup(newBadges[0]);
        } else {
            alert("Success! Your route has been published.");
        }

        clearCurrentSession();

    } catch (error) { 
        console.error("Error publishing route:", error); 
        alert("There was an error publishing your route."); 
    }
}

async function saveSession() {
    const dataModal = document.getElementById('dataModal');
    if (!currentUser) {
        const sessionName = prompt("Name this Litter Bugs session:", `Cleanup on ${new Date().toLocaleDateString()}`);
        if (sessionName) {
            const guestSessions = JSON.parse(localStorage.getItem('guestSessions')) || [];
            guestSessions.push({ sessionName, timestamp: new Date().toISOString(), pins: convertPinsForFirestore(photoPins), route: convertRouteForFirestore(routeCoordinates) });
            localStorage.setItem('guestSessions', JSON.stringify(guestSessions));
            alert(`Session "${sessionName}" saved locally.`);
            dataModal.style.display = 'none';
        }
        return;
    }
    const sessionName = prompt("Name this Litter Bugs session:", `Cleanup on ${new Date().toLocaleDateString()}`);
    if (sessionName) {
        try {
            await addDoc(collection(db, "users", currentUser.uid, "privateSessions"), { sessionName, timestamp: new Date(), pins: convertPinsForFirestore(photoPins), route: convertRouteForFirestore(routeCoordinates) });
            alert(`Session "${sessionName}" saved to your account!`);
            dataModal.style.display = 'none';
        } catch (error) { console.error("Error saving session:", error); alert("Could not save session."); }
    }
}

async function loadSession() {
    if (!currentUser) {
        populateLocalSessionList();
        document.getElementById('localSessionsModal').style.display = 'flex';
        return;
    }
    await populateSessionList();
    document.getElementById('sessionsModal').style.display = 'flex';
}

function populateLocalSessionList() {
    const localSessionList = document.getElementById('localSessionList');
    const guestSessions = JSON.parse(localStorage.getItem('guestSessions')) || [];
    localSessionList.innerHTML = '';
    if (guestSessions.length === 0) { localSessionList.innerHTML = '<li>No locally saved sessions found.</li>'; return; }
    guestSessions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).forEach((sessionData, index) => {
        const li = document.createElement('li');
        li.innerHTML = `<div><span>${sessionData.sessionName}</span><br><small class="session-date">${new Date(sessionData.timestamp).toLocaleDateString()}</small></div><button class="delete-session-btn">Delete</button>`;
        li.querySelector('div').addEventListener('click', () => loadSpecificLocalSession(index));
        li.querySelector('button').addEventListener('click', (e) => { e.stopPropagation(); deleteLocalSession(index, sessionData.sessionName); });
        localSessionList.appendChild(li);
    });
}

function deleteLocalSession(sessionIndex, sessionName) {
    if (confirm(`Are you sure you want to delete "${sessionName}"?`)) {
        let guestSessions = JSON.parse(localStorage.getItem('guestSessions')) || [];
        guestSessions.splice(sessionIndex, 1);
        localStorage.setItem('guestSessions', JSON.stringify(guestSessions));
        alert("Session deleted.");
        populateLocalSessionList();
    }
}

function loadSpecificLocalSession(sessionIndex) {
    const guestSessions = JSON.parse(localStorage.getItem('guestSessions')) || [];
    const sessionData = guestSessions[sessionIndex];
    if (sessionData) {
        clearCurrentSession();
        const convertedData = { ...sessionData, pins: convertPinsFromFirestore(sessionData.pins), route: convertRouteFromFirestore(sessionData.route) };
        displaySessionData(convertedData);
        alert(`Session "${sessionData.sessionName}" loaded!`);
        document.getElementById('localSessionsModal').style.display = 'none';
        document.getElementById('centerOnRouteBtn').classList.remove('disabled');
    }
}

async function populateSessionList() {
    const sessionList = document.getElementById('sessionList');
    sessionList.innerHTML = '<li>Loading...</li>';
    try {
        const q = query(collection(db, "users", currentUser.uid, "privateSessions"), orderBy("timestamp", "desc"));
        const querySnapshot = await getDocs(q);
        sessionList.innerHTML = '';
        if (querySnapshot.empty) { sessionList.innerHTML = '<li>No saved cloud sessions found.</li>'; return; }
        querySnapshot.forEach(doc => {
            const sessionData = doc.data();
            const li = document.createElement('li');
            li.innerHTML = `<div><span>${sessionData.sessionName}</span><br><small class="session-date">${new Date(sessionData.timestamp.seconds * 1000).toLocaleDateString()}</small></div><button class="delete-session-btn">Delete</button>`;
            li.querySelector('div').addEventListener('click', () => loadSpecificSession(doc.id));
            li.querySelector('button').addEventListener('click', (e) => { e.stopPropagation(); deletePrivateSession(doc.id, sessionData.sessionName); });
            sessionList.appendChild(li);
        });
    } catch (error) { console.error("Error fetching sessions:", error); sessionList.innerHTML = '<li>Could not load sessions.</li>'; }
}

async function deletePrivateSession(sessionId, sessionName) {
    if (confirm(`Are you sure you want to delete "${sessionName}"?`)) {
        try {
            await deleteDoc(doc(db, "users", currentUser.uid, "privateSessions", sessionId));
            alert("Session deleted.");
            populateSessionList();
        } catch (error) { console.error("Error deleting session:", error); alert("Failed to delete session."); }
    }
}

async function loadSpecificSession(sessionId) {
    try {
        const docSnap = await getDoc(doc(db, "users", currentUser.uid, "privateSessions", sessionId));
        if (docSnap.exists()) {
            clearCurrentSession();
            const sessionData = docSnap.data();
            displaySessionData({ ...sessionData, pins: convertPinsFromFirestore(sessionData.pins), route: convertRouteFromFirestore(sessionData.route) });
            alert(`Session "${sessionData.sessionName}" loaded!`);
            document.getElementById('sessionsModal').style.display = 'none';
            document.getElementById('centerOnRouteBtn').classList.remove('disabled');
        }
    } catch (error) { console.error("Error loading specific session:", error); alert("Failed to load session."); }
}

function clearCurrentSession() {
    userMarkers.forEach(marker => marker.remove());
    userMarkers = [];
    photoPins = [];
    routeCoordinates = [];
    updateUserPinsSource();
    if (map && map.getSource('user-route')) map.getSource('user-route').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: [] } });
    document.getElementById('centerOnRouteBtn').classList.add('disabled');
}

function displaySessionData(data) {
    photoPins = data.pins || [];
    routeCoordinates = data.route || [];
    photoPins.forEach(pin => createAndAddMarker(pin, 'user'));
    updateUserPinsSource();
    if(map && map.getSource('user-route')) map.getSource('user-route').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: routeCoordinates } });
}

function exportGeoJSON() {
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
    const fileName = `litter_bugs_data_${timestamp}.geojson`;
    const pinFeatures = photoPins.map(pin => ({ type: 'Feature', geometry: { type: 'Point', coordinates: pin.coords }, properties: { title: pin.title, image_url: pin.imageURL || 'local_data', category: pin.category } }));
    const routeFeature = { type: 'Feature', geometry: { type: 'LineString', coordinates: routeCoordinates }, properties: {} };
    const geojson = { type: 'FeatureCollection', features: [...pinFeatures, routeFeature] };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(geojson, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", fileName);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    document.getElementById('dataModal').style.display = 'none';
}

async function populatePublishedRoutesList() {
    const publishedRoutesList = document.getElementById('publishedRoutesList');
    publishedRoutesList.innerHTML = '<li>Loading your publications...</li>';
    try {
        const q = query(collection(db, "publishedRoutes"), where("userId", "==", currentUser.uid), orderBy("timestamp", "desc"));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) { publishedRoutesList.innerHTML = '<li>You have not published any routes yet.</li>'; return; }
        publishedRoutesList.innerHTML = '';
        querySnapshot.forEach(doc => {
            const routeData = doc.data();
            const li = document.createElement('li');
            li.innerHTML = `<div><span>Route published on</span><br><small class="session-date">${new Date(routeData.timestamp.seconds * 1000).toLocaleString()}</small></div><button class="delete-session-btn">Delete</button>`;
            li.querySelector('button').addEventListener('click', (e) => { e.stopPropagation(); deletePublishedRoute(doc.id); });
            publishedRoutesList.appendChild(li);
        });
    } catch (error) { console.error("Error fetching published routes:", error); publishedRoutesList.innerHTML = '<li>Could not load publications.</li>'; }
}

async function deletePublishedRoute(routeId) {
    if (confirm("Are you sure you want to permanently delete this published route?")) {
        try {
            await deleteDoc(doc(db, "publishedRoutes", routeId));
            alert("Route deleted from the community map.");
            populatePublishedRoutesList();
            if (isCommunityViewOn) {
                clearCommunityRoutes();
                fetchAndDisplayCommunityRoutes();
            }
        } catch (error) { console.error("Error deleting published route:", error); alert("Failed to delete route."); }
    }
}

async function loadProfileForEditing() {
    if (!currentUser) return;
    try {
        const docSnap = await getDoc(doc(db, "publicProfiles", currentUser.uid));
        if (docSnap.exists()) {
            const profileData = docSnap.data();
            document.getElementById('bioInput').value = profileData.bio || '';
            document.getElementById('locationInput').value = profileData.location || '';
            document.getElementById('coffeeLinkInput').value = profileData.buyMeACoffeeLink || '';
        }
    } catch (error) { console.error("Error loading profile:", error); alert("Could not load your profile for editing."); }
}

async function saveProfile() {
    if (!currentUser) return;
    const bio = document.getElementById('bioInput').value, location = document.getElementById('locationInput').value, coffeeLink = document.getElementById('coffeeLinkInput').value;
    try {
        const publicProfileRef = doc(db, "publicProfiles", currentUser.uid);
        await updateDoc(publicProfileRef, { bio, location, buyMeACoffeeLink: coffeeLink });
        alert("Profile updated successfully!");
        document.getElementById('profileModal').style.display = 'none';
    } catch (error) { console.error("Error saving profile:", error); alert("Error saving profile."); }
}

async function showPublicProfile(userId) {
    if (!userId) return;
    try {
        const publicProfileRef = doc(db, "publicProfiles", userId);
        const docSnap = await getDoc(publicProfileRef);

        if (docSnap.exists()) {
            const profileData = docSnap.data();
            const publicProfileModal = document.getElementById('publicProfileModal');
            const profileSupportBtn = document.getElementById('profileSupportBtn');
            const profileAchievementsContainer = document.getElementById('profileAchievements');
            const profileStatsContainer = document.getElementById('profileStats');

            document.getElementById('profileUsername').textContent = profileData.username || 'Anonymous User';
            document.getElementById('profileLocation').textContent = profileData.location || '';
            document.getElementById('profileBio').textContent = profileData.bio || 'This user has not written a bio yet.';
            
            const distanceMiles = ((profileData.totalDistance || 0) * 0.000621371).toFixed(2);
            profileStatsContainer.innerHTML = `
                <div class="profile-stat-card">
                    <div class="profile-stat-value">${profileData.totalPins || 0}</div>
                    <div class="profile-stat-label">Items Pinned</div>
                </div>
                <div class="profile-stat-card">
                    <div class="profile-stat-value">${distanceMiles}</div>
                    <div class="profile-stat-label">Miles Cleaned</div>
                </div>
                <div class="profile-stat-card">
                    <div class="profile-stat-value">${profileData.totalRoutes || 0}</div>
                    <div class="profile-stat-label">Routes Completed</div>
                </div>
            `;

            profileAchievementsContainer.innerHTML = '';
            const userBadges = profileData.badges || {};
            let earnedBadgesCount = 0;
            for (const badgeKey in allBadges) {
                if (userBadges[badgeKey] === true) {
                    earnedBadgesCount++;
                    const badgeInfo = allBadges[badgeKey];
                    const badgeElement = document.createElement('div');
                    badgeElement.className = 'badge-item';
                    badgeElement.textContent = badgeInfo.icon;
                    badgeElement.title = `${badgeInfo.name}: ${badgeInfo.description}`;
                    profileAchievementsContainer.appendChild(badgeElement);
                }
            }
            if (earnedBadgesCount === 0) {
                profileAchievementsContainer.innerHTML = '<p class="no-badges-message">This user hasn\'t earned any badges yet.</p>';
            }

            if (profileData.buyMeACoffeeLink) {
                profileSupportBtn.style.display = 'block';
                profileSupportBtn.onclick = () => window.open(profileData.buyMeACoffeeLink, '_blank');
            } else {
                profileSupportBtn.style.display = 'none';
            }
            publicProfileModal.style.display = 'flex';
        } else {
            alert("Could not find this user's profile.");
        }
    } catch (error) {
        console.error("Error fetching public profile:", error);
        alert("Error loading profile.");
    }
}

async function handleAccountDeletion() {
    if (!currentUser) return;
    if (!confirm("DANGER: Are you absolutely sure you want to permanently delete your account? This action cannot be undone.")) return;
    if (!confirm("All of your private saved sessions and public routes will be deleted forever. Are you still sure?")) return;
    try {
        console.log("Starting account deletion for user:", currentUser.uid);
        const privateSessionsQuery = query(collection(db, "users", currentUser.uid, "privateSessions"));
        const privateSessionsSnapshot = await getDocs(privateSessionsQuery);
        await Promise.all(privateSessionsSnapshot.docs.map(d => deleteDoc(d.ref)));
        console.log("Private sessions deleted.");
        const publishedRoutesQuery = query(collection(db, "publishedRoutes"), where("userId", "==", currentUser.uid));
        const publishedRoutesSnapshot = await getDocs(publishedRoutesQuery);
        await Promise.all(publishedRoutesSnapshot.docs.map(d => deleteDoc(d.ref)));
        console.log("Published routes deleted.");
        await deleteDoc(doc(db, "users", currentUser.uid));
        await deleteDoc(doc(db, "publicProfiles", currentUser.uid));
        console.log("User documents deleted.");
        await deleteUser(currentUser);
        alert("Your account and all associated data have been permanently deleted.");
        document.getElementById('profileModal').style.display = 'none';
    } catch (error) {
        console.error("Error deleting account:", error);
        if (error.code === 'auth/requires-recent-login') {
            alert("This is a sensitive operation. Please log out and log back in to delete your account.");
        } else { alert("An error occurred while deleting your account."); }
    }
}

function centerOnRoute() {
    if (routeCoordinates.length < 1 && photoPins.length < 1) {
        alert("No route is currently loaded to center on.");
        return;
    }
    const bounds = new mapboxgl.LngLatBounds();
    routeCoordinates.forEach(coord => {
        bounds.extend(coord);
    });
    photoPins.forEach(pin => {
        bounds.extend(pin.coords);
    });
    map.fitBounds(bounds, {
        padding: {top: 150, bottom: 150, left: 60, right: 60},
        maxZoom: 16
    });
}

function showCleanupSummary() {
    if (!trackingStartTime) return;
    const durationMs = new Date() - trackingStartTime;
    const distanceMeters = calculateRouteDistance(routeCoordinates);
    const pinsCount = photoPins.length;
    const distanceMiles = (distanceMeters * 0.000621371).toFixed(2);
    const minutes = Math.floor(durationMs / 60000);
    const seconds = ((durationMs % 60000) / 1000).toFixed(0);
    document.getElementById('summaryDistance').textContent = `${distanceMiles} mi`;
    document.getElementById('summaryPins').textContent = pinsCount;
    document.getElementById('summaryDuration').textContent = `${minutes}m ${seconds}s`;
    document.getElementById('summaryModal').style.display = 'flex';
    trackingStartTime = null;
}

function calculateRouteDistance(coordinates) {
    let totalDistance = 0;
    if (coordinates.length < 2) return 0;
    for (let i = 0; i < coordinates.length - 1; i++) {
        const p1 = { lat: coordinates[i][1], lng: coordinates[i][0] };
        const p2 = { lat: coordinates[i+1][1], lng: coordinates[i+1][0] };
        const R = 6371e3;
        const φ1 = p1.lat * Math.PI / 180;
        const φ2 = p2.lat * Math.PI / 180;
        const Δφ = (p2.lat - p1.lat) * Math.PI / 180;
        const Δλ = (p2.lng - p1.lng) * Math.PI / 180;
        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        totalDistance += R * c;
    }
    return totalDistance;
}
async function fetchAndDisplayLeaderboard(metric) {
    const leaderboardList = document.getElementById('leaderboardList');
    if (!leaderboardList) return;
    leaderboardList.innerHTML = '<li>Loading...</li>';
    try {
        const profilesRef = collection(db, "publicProfiles");
        const q = query(profilesRef, orderBy(metric, "desc"), limit(10));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            leaderboardList.innerHTML = '<li>No user data yet. Be the first!</li>';
            return;
        }

        leaderboardList.innerHTML = '';
        let rank = 1;
        querySnapshot.forEach(doc => {
            const profileData = doc.data();
            const li = document.createElement('li');
            li.dataset.userid = doc.id;
            
            const score = metric === 'totalDistance'
                ? `${((profileData.totalDistance || 0) * 0.000621371).toFixed(2)} mi`
                : (profileData.totalPins || 0);

            li.innerHTML = `
                <span class="leaderboard-rank">${rank}.</span>
                <span class="leaderboard-name"><a href="#" class="leaderboard-profile-link">${profileData.username}</a></span>
                <span class="leaderboard-score">${score}</span>
            `;
            leaderboardList.appendChild(li);
            rank++;
        });
    } catch (error) {
        console.error("Error fetching leaderboard:", error);
        leaderboardList.innerHTML = '<li>Could not load leaderboard data.</li>';
        if (error.code === 'failed-precondition') {
            alert("Leaderboard data requires a new database index. Please check the browser console for a link to create it automatically.");
        }
    }
}

function showAchievementPopup(badgeKey) {
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

async function fetchAndDisplayMyStats() {
    const myStatsContainer = document.getElementById('myStatsContainer');
    myStatsContainer.innerHTML = '';

    if (!currentUser) {
        myStatsContainer.innerHTML = '<p class="login-prompt">Please log in to view your personal stats.</p>';
        return;
    }

    try {
        const publicProfileRef = doc(db, "publicProfiles", currentUser.uid);
        const publicProfileSnap = await getDoc(publicProfileRef);

        if (!publicProfileSnap.exists()) {
            myStatsContainer.innerHTML = '<p class="login-prompt">Could not find your profile data.</p>';
            return;
        }

        const profileData = publicProfileSnap.data();
        const distanceMiles = ((profileData.totalDistance || 0) * 0.000621371).toFixed(2);
        
        let statsHTML = `
            <div class="my-stats-grid">
                <div class="stat-card">
                    <div class="my-stats-value">${profileData.totalPins || 0}</div>
                    <div class="my-stats-label">Items Pinned</div>
                </div>
                <div class="stat-card">
                    <div class="my-stats-value">${distanceMiles}</div>
                    <div class="my-stats-label">Miles Cleaned</div>
                </div>
                <div class="stat-card">
                    <div class="my-stats-value">${profileData.totalRoutes || 0}</div>
                    <div class="my-stats-label">Routes Completed</div>
                </div>
            </div>
            <h4>My Achievements</h4>
            <div class="my-stats-badges">
                <div class="badge-container">
        `;

        const userBadges = profileData.badges || {};
        let earnedBadgesCount = 0;
        for (const badgeKey in allBadges) {
            if (userBadges[badgeKey] === true) {
                earnedBadgesCount++;
                const badgeInfo = allBadges[badgeKey];
                statsHTML += `
                    <div class="badge-item" title="${badgeInfo.name}: ${badgeInfo.description}">
                        ${badgeInfo.icon}
                    </div>
                `;
            }
        }

        if (earnedBadgesCount === 0) {
            statsHTML += '<p class="no-badges-message">You haven\'t earned any badges yet. Keep cleaning!</p>';
        }

        statsHTML += `</div></div>`;
        myStatsContainer.innerHTML = statsHTML;

    } catch (error) {
        console.error("Error fetching your stats:", error);
        myStatsContainer.innerHTML = '<p class="login-prompt">Could not load your stats.</p>';
    }
}

function setupPoiClickListeners() {
    const poiLayers = [ 'poi-label', 'transit-label', 'airport-label', 'natural-point-label', 'natural-line-label', 'water-point-label', 'water-line-label', 'waterway-label' ];
    poiLayers.forEach(layerId => {
        if (map.getLayer(layerId)) {
            map.on('click', layerId, (e) => {
                if (e.features.length > 0) {
                    const feature = e.features[0];
                    const coordinates = e.lngLat;
                    const name = feature.properties.name;

                    const popupHTML = `
                        <div>
                            <strong>${name}</strong>
                            <div class="poi-popup-buttons">
                                <button class="schedule-btn">Schedule Meetup</button>
                                <button class="view-btn">View Meetups</button>
                            </div>
                        </div>
                    `;

                    const popup = new mapboxgl.Popup()
                        .setLngLat(coordinates)
                        .setHTML(popupHTML)
                        .addTo(map);
                    
                    popup.getElement().querySelector('.schedule-btn').addEventListener('click', () => {
                        openMeetupModal(name);
                        popup.remove();
                    });
                    popup.getElement().querySelector('.view-btn').addEventListener('click', () => {
                        openViewMeetupsModal(name);
                        popup.remove();
                    });
                }
            });
            map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer'; });
            map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = ''; });
        }
    });
}

function openMeetupModal(poiName) {
    if (!currentUser) {
        alert("Please log in to schedule a meetup.");
        return;
    }
    document.getElementById('meetupLocationName').textContent = poiName;
    document.getElementById('poiNameInput').value = poiName;
    document.getElementById('meetupModal').style.display = 'flex';
    validateMeetupForm();
}

function validateMeetupForm() {
    const title = document.getElementById('meetupTitleInput').value.trim();
    const description = document.getElementById('meetupDescriptionInput').value.trim();
    const safetyChecked = document.getElementById('safetyCheckbox').checked;
    const createBtn = document.getElementById('createMeetupBtn');
    const profanityWarning = document.getElementById('profanityWarning');
    
    const hasProfanity = profanityList.some(word => title.toLowerCase().includes(word) || description.toLowerCase().includes(word));

    if (hasProfanity) {
        profanityWarning.style.display = 'block';
    } else {
        profanityWarning.style.display = 'none';
    }

    createBtn.disabled = !(title && description && safetyChecked && !hasProfanity);
}

async function handleMeetupSubmit() {
    if (!currentUser) return;

    const title = document.getElementById('meetupTitleInput').value.trim();
    const description = document.getElementById('meetupDescriptionInput').value.trim();
    const poiName = document.getElementById('poiNameInput').value;

    try {
        const publicProfileRef = doc(db, "publicProfiles", currentUser.uid);
        const docSnap = await getDoc(publicProfileRef);
        if (!docSnap.exists()) throw new Error("Could not find your public profile.");
        
        const username = docSnap.data().username;

        await addDoc(collection(db, "meetups"), {
            organizerId: currentUser.uid,
            organizerName: username,
            poiName: poiName,
            title: title,
            description: description,
            createdAt: new Date()
        });

        alert("Meetup scheduled successfully!");
        document.getElementById('meetupModal').style.display = 'none';
        document.getElementById('meetupTitleInput').value = '';
        document.getElementById('meetupDescriptionInput').value = '';
        document.getElementById('safetyCheckbox').checked = false;

    } catch (error) {
        console.error("Error scheduling meetup:", error);
        alert("There was an error scheduling your meetup.");
    }
}

function openViewMeetupsModal(poiName) {
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

async function shareCleanupResults() {
    const distance = document.getElementById('summaryDistance').textContent;
    const pins = document.getElementById('summaryPins').textContent;

    const shareText = `I just cleaned up ${distance} and pinned ${pins} items with the Litter Bugs app! Join the movement and help clean our planet. #LitterBugs #Cleanup`;

    const shareData = {
        title: 'My Litter Bugs Cleanup!',
        text: shareText,
        url: 'https://www.litter-bugs.com/'
    };

    if (navigator.share) {
        try {
            await navigator.share(shareData);
            console.log('Cleanup shared successfully!');
        } catch (err) {
            console.error('Error sharing:', err);
        }
    } else {
        try {
            await navigator.clipboard.writeText(shareText + " " + shareData.url);
            alert('Cleanup stats copied to clipboard!');
        } catch (err) {
            console.error('Failed to copy: ', err);
            alert('Sharing is not supported on this browser. You can copy the stats from the summary.');
        }
    }
}
