import { db, collection, getDocs, query, orderBy, addDoc, doc, getDoc, where, deleteDoc, updateDoc, onSnapshot, limit } from './firebase.js';
import { state, allBadges, profanityList } from './config.js';
import { createAndAddMarker } from './map.js';
import { convertRouteForFirestore, convertPinsForFirestore, convertRouteFromFirestore, convertPinsFromFirestore } from './utils.js';
import { clearCurrentSession } from './data.js';

// --- Community View ---

/**
 * Toggles the visibility of community-generated routes on the map.
 */
export async function toggleCommunityView() {
    state.isCommunityViewOn = !state.isCommunityViewOn;
    const communityBtn = document.getElementById('communityBtn');
    if (state.isCommunityViewOn) {
        communityBtn.textContent = '🌎 Community View: ON';
        communityBtn.classList.remove('off');
        await fetchAndDisplayCommunityRoutes();
    } else {
        communityBtn.textContent = '🌎 Community View: OFF';
        communityBtn.classList.add('off');
        clearCommunityRoutes();
    }
}

/**
 * Fetches all published routes from Firestore and displays them on the map.
 */
export async function fetchAndDisplayCommunityRoutes() {
  try {
    // This function still clears the old route lines and markers
    clearCommunityRoutes();

    const q = query(collection(db, "publishedRoutes"), orderBy("timestamp", "desc"));
    const querySnapshot = await getDocs(q);

    // 1. Initialize an empty array to hold all pin data
    const allPinFeatures = [];

    querySnapshot.forEach(doc => {
      const routeData = doc.data();
      const routeId = doc.id;
      const mapboxCoords = convertRouteFromFirestore(routeData.route);
      const mapboxPins = convertPinsFromFirestore(routeData.pins);

      // This part stays the same - we still draw the green route lines
      if (mapboxCoords && mapboxCoords.length > 0) {
        state.map.addSource(`community-route-${routeId}`, {
          type: 'geojson',
          data: { type: 'Feature', geometry: { type: 'LineString', coordinates: mapboxCoords } }
        });
        state.map.addLayer({
          id: `community-route-${routeId}`,
          type: 'line',
          source: `community-route-${routeId}`,
          paint: { 'line-color': '#28a745', 'line-width': 4, 'line-opacity': 0.7 }
        });
        state.communityLayers.push({ id: `community-route-${routeId}`, type: 'layer' });
      }

      // 2. NEW: Instead of creating markers, we collect pin data
      if (mapboxPins) {
        mapboxPins.forEach(pin => {
          allPinFeatures.push({
            'type': 'Feature',
            'properties': {
              // Add any data we want to access later when a pin is clicked
              title: pin.title,
              category: pin.category,
              imageURL: pin.imageURL,
              thumbnailURL: pin.thumbnailURL,
              username: routeData.username,
              userId: routeData.userId
            },
            'geometry': {
              'type': 'Point',
              'coordinates': pin.coords
            }
          });
        });
      }
    });

      if (!state.map.getSource('community-pins')) {
      state.map.addSource('community-pins', {
        type: 'geojson',
        data: {
          'type': 'FeatureCollection',
          'features': allPinFeatures
        },
        cluster: true,        // The magic switch that turns on clustering
        clusterMaxZoom: 14,   // The zoom level where clustering stops
        clusterRadius: 50     // How close points can be before they're grouped (in pixels)
      });
    }

  } catch (error) {
    console.error("Error fetching community routes:", error);
    alert("Could not load community data.");
  }
    
}

/**
 * Removes all community-related routes and markers from the map.
 */
function clearCommunityRoutes() {
    state.communityMarkers.forEach(marker => marker.remove());
    state.communityMarkers = [];
    state.communityLayers.forEach(layer => {
        if (state.map.getLayer(layer.id)) state.map.removeLayer(layer.id);
        if (state.map.getSource(layer.id)) state.map.removeSource(layer.id);
    });
    if (state.map.getSource('community-pins-source')) {
        state.map.getSource('community-pins-source').setData({ type: 'FeatureCollection', features: [] });
    }
    state.communityLayers = [];
}

// --- Publishing & Profile Management ---

/**
 * Publishes the current user's route to the public collection.
 */
export async function publishRoute() {
    if (!state.currentUser) return;
    if (state.routeCoordinates.length < 2 || state.photoPins.length === 0) {
        alert("You need a tracked route and at least one photo pin to publish.");
        return;
    }
    document.getElementById('dataModal').style.display = 'none';

    try {
        const publicProfileRef = doc(db, "publicProfiles", state.currentUser.uid);
        const beforeSnap = await getDoc(publicProfileRef);
        const badgesBefore = beforeSnap.exists() ? Object.keys(beforeSnap.data().badges || {}) : [];
        const username = beforeSnap.exists() ? beforeSnap.data().username : "Anonymous";

        await addDoc(collection(db, "publishedRoutes"), {
            userId: state.currentUser.uid,
            username,
            timestamp: new Date(),
            route: convertRouteForFirestore(state.routeCoordinates),
            pins: convertPinsForFirestore(state.photoPins)
        });

        // NOTE: A better solution would be to await a Cloud Function response.
        // This timeout is a simple way to allow Firestore triggers to run.
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

export async function populatePublishedRoutesList() {
    const publishedRoutesList = document.getElementById('publishedRoutesList');
    publishedRoutesList.innerHTML = '<li>Loading your publications...</li>';
    try {
        const q = query(collection(db, "publishedRoutes"), where("userId", "==", state.currentUser.uid), orderBy("timestamp", "desc"));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            publishedRoutesList.innerHTML = '<li>You have not published any routes yet.</li>';
            return;
        }
        publishedRoutesList.innerHTML = '';
        querySnapshot.forEach(doc => {
            const routeData = doc.data();
            const li = document.createElement('li');
            li.innerHTML = `<div><span>Route published on</span><br><small class="session-date">${new Date(routeData.timestamp.seconds * 1000).toLocaleString()}</small></div><button class="delete-session-btn">Delete</button>`;
            li.querySelector('button').addEventListener('click', (e) => {
                e.stopPropagation();
                deletePublishedRoute(doc.id);
            });
            publishedRoutesList.appendChild(li);
        });
    } catch (error) {
        console.error("Error fetching published routes:", error);
        publishedRoutesList.innerHTML = '<li>Could not load publications.</li>';
    }
}

async function deletePublishedRoute(routeId) {
    if (confirm("Are you sure you want to permanently delete this published route?")) {
        try {
            await deleteDoc(doc(db, "publishedRoutes", routeId));
            alert("Route deleted from the community map.");
            populatePublishedRoutesList();
            if (state.isCommunityViewOn) {
                fetchAndDisplayCommunityRoutes();
            }
        } catch (error) {
            console.error("Error deleting published route:", error);
            alert("Failed to delete route.");
        }
    }
}

export async function loadProfileForEditing() {
    if (!state.currentUser) return;
    try {
        const docSnap = await getDoc(doc(db, "publicProfiles", state.currentUser.uid));
        if (docSnap.exists()) {
            const profileData = docSnap.data();
            document.getElementById('bioInput').value = profileData.bio || '';
            document.getElementById('locationInput').value = profileData.location || '';
            document.getElementById('coffeeLinkInput').value = profileData.buyMeACoffeeLink || '';
        }
    } catch (error) {
        console.error("Error loading profile:", error);
        alert("Could not load your profile for editing.");
    }
}

export async function saveProfile() {
    if (!state.currentUser) return;
    const bio = document.getElementById('bioInput').value;
    const location = document.getElementById('locationInput').value;
    const coffeeLink = document.getElementById('coffeeLinkInput').value;
    try {
        const publicProfileRef = doc(db, "publicProfiles", state.currentUser.uid);
        await updateDoc(publicProfileRef, { bio, location, buyMeACoffeeLink: coffeeLink });
        alert("Profile updated successfully!");
        document.getElementById('profileModal').style.display = 'none';
    } catch (error) {
        console.error("Error saving profile:", error);
        alert("Error saving profile.");
    }
}

export async function showPublicProfile(userId) {
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
                </div>`;

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

// --- Leaderboard, Stats, & Achievements ---

export async function fetchAndDisplayLeaderboard(metric) {
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

            const score = metric === 'totalDistance' ?
                `${((profileData.totalDistance || 0) * 0.000621371).toFixed(2)} mi` :
                (profileData.totalPins || 0);

            li.innerHTML = `
                <span class="leaderboard-rank">${rank}.</span>
                <span class="leaderboard-name"><a href="#" class="leaderboard-profile-link">${profileData.username}</a></span>
                <span class="leaderboard-score">${score}</span>`;
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

export async function fetchAndDisplayMyStats() {
    const myStatsContainer = document.getElementById('myStatsContainer');
    myStatsContainer.innerHTML = '';

    if (!state.currentUser) {
        myStatsContainer.innerHTML = '<p class="login-prompt">Please log in to view your personal stats.</p>';
        return;
    }

    try {
        const publicProfileRef = doc(db, "publicProfiles", state.currentUser.uid);
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
            <div class="my-stats-badges"><div class="badge-container">`;

        const userBadges = profileData.badges || {};
        let earnedBadgesCount = 0;
        for (const badgeKey in allBadges) {
            if (userBadges[badgeKey] === true) {
                earnedBadgesCount++;
                const badgeInfo = allBadges[badgeKey];
                statsHTML += `<div class="badge-item" title="${badgeInfo.name}: ${badgeInfo.description}">${badgeInfo.icon}</div>`;
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

function showAchievementPopup(badgeKey) {
    const badge = allBadges[badgeKey];
    if (!badge) return;

    const achievementModal = document.getElementById('achievementModal');
    achievementModal.querySelector('.achievement-icon').textContent = badge.icon;
    document.getElementById('achievementName').textContent = badge.name;
    document.getElementById('achievementDescription').textContent = badge.description;
    achievementModal.style.display = 'flex';
}

// --- Meetups ---

export function setupPoiClickListeners() {
    const poiLayers = ['poi-label', 'transit-label', 'airport-label', 'natural-point-label', 'natural-line-label', 'water-point-label', 'water-line-label', 'waterway-label'];
    poiLayers.forEach(layerId => {
        if (state.map.getLayer(layerId)) {
            state.map.on('click', layerId, (e) => {
                if (e.features.length > 0) {
                    const feature = e.features[0];
                    const popupHTML = `<div><strong>${feature.properties.name}</strong><div class="poi-popup-buttons"><button class="schedule-btn">Schedule Meetup</button><button class="view-btn">View Meetups</button></div></div>`;

                    const popup = new mapboxgl.Popup().setLngLat(e.lngLat).setHTML(popupHTML).addTo(state.map);

                    popup.getElement().querySelector('.schedule-btn').addEventListener('click', () => {
                        openMeetupModal(feature.properties.name);
                        popup.remove();
                    });
                    popup.getElement().querySelector('.view-btn').addEventListener('click', () => {
                        openViewMeetupsModal(feature.properties.name);
                        popup.remove();
                    });
                }
            });
            state.map.on('mouseenter', layerId, () => { state.map.getCanvas().style.cursor = 'pointer'; });
            state.map.on('mouseleave', layerId, () => { state.map.getCanvas().style.cursor = ''; });
        }
    });
}

function openMeetupModal(poiName) {
    if (!state.currentUser) {
        alert("Please log in to schedule a meetup.");
        return;
    }
    document.getElementById('meetupLocationName').textContent = poiName;
    document.getElementById('poiNameInput').value = poiName;
    document.getElementById('meetupModal').style.display = 'flex';
    validateMeetupForm();
}

export function validateMeetupForm() {
    const title = document.getElementById('meetupTitleInput').value.trim();
    const description = document.getElementById('meetupDescriptionInput').value.trim();
    const safetyChecked = document.getElementById('safetyCheckbox').checked;
    const createBtn = document.getElementById('createMeetupBtn');
    const profanityWarning = document.getElementById('profanityWarning');

    const hasProfanity = profanityList.some(word => title.toLowerCase().includes(word) || description.toLowerCase().includes(word));
    profanityWarning.style.display = hasProfanity ? 'block' : 'none';
    createBtn.disabled = !(title && description && safetyChecked && !hasProfanity);
}

export async function handleMeetupSubmit() {
    if (!state.currentUser) return;

    const title = document.getElementById('meetupTitleInput').value.trim();
    const description = document.getElementById('meetupDescriptionInput').value.trim();
    const poiName = document.getElementById('poiNameInput').value;

    try {
        const publicProfileRef = doc(db, "publicProfiles", state.currentUser.uid);
        const docSnap = await getDoc(publicProfileRef);
        if (!docSnap.exists()) throw new Error("Could not find your public profile.");

        const username = docSnap.data().username;
        await addDoc(collection(db, "meetups"), {
            organizerId: state.currentUser.uid,
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
                </div>`;
            meetupsList.appendChild(li);
        });
    });
}
