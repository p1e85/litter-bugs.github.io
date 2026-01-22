import { db, collection, getDocs, query, orderBy, addDoc, doc, getDoc, where, deleteDoc, updateDoc, onSnapshot, limit, storage, ref, uploadBytes, getDownloadURL } from './firebase.js';
import { state, allBadges, profanityList } from './config.js';
import { convertRouteForFirestore, convertPinsForFirestore, convertRouteFromFirestore, convertPinsFromFirestore } from './utils.js';
import { clearCurrentSession } from './data.js';

// --- Helper Function: Calculate Distance ---
function calculateRouteDistance(coords) {
    if (!coords || coords.length < 2) return 0;
    const R = 3958.8;
    let totalDistance = 0;
    for (let i = 0; i < coords.length - 1; i++) {
        const [lon1, lat1] = coords[i];
        const [lon2, lat2] = coords[i + 1];
        const dLat = (lat2 - lat1) * (Math.PI / 180);
        const dLon = (lon2 - lon1) * (Math.PI / 180);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        totalDistance += R * c;
    }
    return totalDistance;
}

// --- Community View ---
export async function fetchAndDisplayCommunityRoutes() {
  try {
    clearCommunityRoutes();
    const q = query(collection(db, "publishedRoutes"), orderBy("timestamp", "desc"));
    const querySnapshot = await getDocs(q);
    const allPinFeatures = [];

    querySnapshot.forEach(doc => {
      const routeData = doc.data();
      const routeId = doc.id;
      const mapboxCoords = convertRouteFromFirestore(routeData.route);
      
      if (mapboxCoords && mapboxCoords.length > 0) {
        state.map.addSource(`community-route-${routeId}`, {
          'type': 'geojson',
          'data': { 'type': 'Feature', 'geometry': { 'type': 'LineString', 'coordinates': mapboxCoords } }
        });
        state.map.addLayer({
          'id': `community-route-${routeId}`,
          'type': 'line',
          'source': `community-route-${routeId}`,
          'paint': { 'line-color': '#4A7C59', 'line-width': 4, 'line-opacity': 0.7 }
        });
        state.communityLayers.push({ id: `community-route-${routeId}`, type: 'layer' });
      }
      
      const mapboxPins = convertPinsFromFirestore(routeData.pins);
      if (mapboxPins) {
        mapboxPins.forEach(pin => {
          allPinFeatures.push({
            'type': 'Feature',
            'properties': {
              title: pin.title,
              category: pin.category,
              imageURL: pin.imageURL,
              thumbnailURL: pin.thumbnailURL,
              username: routeData.username,
              userId: routeData.userId
            },
            'geometry': { 'type': 'Point', 'coordinates': pin.coords }
          });
        });
      }
    });

    if (!state.map.getSource('community-pins')) {
      state.map.addSource('community-pins', {
        type: 'geojson',
        data: { 'type': 'FeatureCollection', 'features': allPinFeatures },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50
      });
    }

    state.map.addLayer({
      id: 'clusters',
      type: 'circle',
      source: 'community-pins',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#4A7C59',
        'circle-radius': ['step', ['get', 'point_count'], 20, 100, 30, 750, 40]
      }
    });

    state.map.addLayer({
      id: 'cluster-count',
      type: 'symbol',
      source: 'community-pins',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': '{point_count_abbreviated}',
        'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
        'text-size': 12
      },
      paint: { 'text-color': '#ffffff' }
    });

    state.map.addLayer({
      id: 'unclustered-point',
      type: 'circle',
      source: 'community-pins',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': '#4A7C59',
        'circle-radius': 8,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff'
      }
    });

    state.map.on('click', 'clusters', (e) => {
      const features = state.map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
      const clusterId = features[0].properties.cluster_id;
      state.map.getSource('community-pins').getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err) return;
        state.map.easeTo({ center: features[0].geometry.coordinates, zoom: zoom });
      });
    });

    state.map.on('click', 'unclustered-point', (e) => {
      const coordinates = e.features[0].geometry.coordinates.slice();
      const properties = e.features[0].properties;
      const popupHTML = `
        <div>
            <img src="${properties.thumbnailURL || properties.imageURL}" alt="${properties.title}" style="width:100%; border-radius: 4px;"/>
            <p style="margin: 5px 0 0;"><strong>${properties.title}</strong></p>
            <p style="margin: 5px 0 0; font-style: italic; color: #555;">Category: ${properties.category || 'Other'}</p>
            <small>By: <a href="#" class="profile-link" data-userid="${properties.userId}">${properties.username || 'A user'}</a></small>
        </div>
      `;
      const popup = new mapboxgl.Popup().setLngLat(coordinates).setHTML(popupHTML).addTo(state.map);
      popup.getElement().querySelector('.profile-link').addEventListener('click', (ev) => {
        ev.preventDefault();
        showPublicProfile(properties.userId);
      });
    });

    const clickableLayers = ['clusters', 'unclustered-point'];
    clickableLayers.forEach(layer => {
      state.map.on('mouseenter', layer, () => { state.map.getCanvas().style.cursor = 'pointer'; });
      state.map.on('mouseleave', layer, () => { state.map.getCanvas().style.cursor = ''; });
    });

  } catch (error) {
    console.error("Error fetching community routes:", error);
    alert("Could not load community data.");
  }
}

export function toggleCommunityView() {
    state.isCommunityViewOn = !state.isCommunityViewOn;
    const communityBtn = document.getElementById('communityBtn');
    if (state.isCommunityViewOn) {
        communityBtn.textContent = '🌎 Community View: ON';
        communityBtn.classList.remove('off');
        fetchAndDisplayCommunityRoutes();
    } else {
        communityBtn.textContent = '🌎 Community View: OFF';
        communityBtn.classList.add('off');
        clearCommunityRoutes();
    }
}

function clearCommunityRoutes() {
  if (!state.map || !state.map.isStyleLoaded()) return;
  if (state.map.getLayer('clusters')) state.map.removeLayer('clusters');
  if (state.map.getLayer('cluster-count')) state.map.removeLayer('cluster-count');
  if (state.map.getLayer('unclustered-point')) state.map.removeLayer('unclustered-point');
  if (state.map.getSource('community-pins')) state.map.removeSource('community-pins');
  state.communityLayers.forEach(layer => {
    if (state.map.getLayer(layer.id)) state.map.removeLayer(layer.id);
    if (state.map.getSource(layer.id)) state.map.removeSource(layer.id);
  });
  state.communityLayers = [];
}

// --- Publishing & Profile Management ---

export async function publishRoute() {
    if (!state.currentUser) return;
    if (state.routeCoordinates.length < 2 || state.photoPins.length === 0) {
        alert("You need a tracked route and at least one photo pin to publish.");
        return;
    }
    
    const publishBtn = document.getElementById('publishBtn');
    const originalText = publishBtn.innerText;
    publishBtn.innerText = "Publishing...";
    publishBtn.disabled = true;
    document.getElementById('dataModal').style.display = 'none';

    try {
        const publicProfileRef = doc(db, "publicProfiles", state.currentUser.uid);
        const beforeSnap = await getDoc(publicProfileRef);
        const badgesBefore = beforeSnap.exists() ? Object.keys(beforeSnap.data().badges || {}) : [];
        const username = beforeSnap.exists() ? beforeSnap.data().username : "Anonymous";

        const distanceVal = calculateRouteDistance(state.routeCoordinates);
        const distanceStr = `${distanceVal.toFixed(2)} mi`;

        let cleanupPhotoURL = null;
        if (state.cleanupPhoto) {
            try {
                const photoRef = ref(storage, `cleanup_photos/${state.currentUser.uid}/${Date.now()}.jpg`);
                const snapshot = await uploadBytes(photoRef, state.cleanupPhoto);
                cleanupPhotoURL = await getDownloadURL(snapshot.ref);
            } catch (uploadError) {
                console.error("Photo upload failed:", uploadError);
            }
        }

        await addDoc(collection(db, "publishedRoutes"), {
            userId: state.currentUser.uid,
            username: username,
            timestamp: new Date(),
            route: convertRouteForFirestore(state.routeCoordinates),
            pins: convertPinsForFirestore(state.photoPins),
            distance: distanceVal,
            distanceMiles: distanceStr,
            cleanupPhotoURL: cleanupPhotoURL,
            // NEW FIELDS FOR LIKES
            likeCount: 0,
            likedBy: []
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
    } finally {
        publishBtn.innerText = originalText;
        publishBtn.disabled = false;
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

// ... Profile functions (loadProfileForEditing, saveProfile, showPublicProfile) can remain exactly as they were in previous versions ...
// (I am keeping them for completeness if you copy-paste the whole file)

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

// ... Leaderboard/Stats/Meetup functions remain the same ...
// (Omitting to save space, but ensure they are included if you are replacing the whole file)
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
            li.classList.toggle('current-user-entry', state.currentUser && doc.id === state.currentUser.uid);
            const score = metric === 'totalDistance' ? `${((profileData.totalDistance || 0) * 0.000621371).toFixed(2)} mi` : (profileData.totalPins || 0);
            li.innerHTML = `<span class="leaderboard-rank">${rank}.</span><span class="leaderboard-name"><a href="#" class="leaderboard-profile-link">${profileData.username}</a></span><span class="leaderboard-score">${score}</span>`;
            leaderboardList.appendChild(li);
            rank++;
        });
    } catch (error) {
        console.error("Error fetching leaderboard:", error);
        leaderboardList.innerHTML = '<li>Could not load leaderboard data.</li>';
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
                <div class="stat-card"><div class="my-stats-value">${profileData.totalPins || 0}</div><div class="my-stats-label">Items Pinned</div></div>
                <div class="stat-card"><div class="my-stats-value">${distanceMiles}</div><div class="my-stats-label">Miles Cleaned</div></div>
                <div class="stat-card"><div class="my-stats-value">${profileData.totalRoutes || 0}</div><div class="my-stats-label">Routes Completed</div></div>
            </div>
            <h4>My Achievements</h4><div class="my-stats-badges"><div class="badge-container">`;
        const userBadges = profileData.badges || {};
        let earnedBadgesCount = 0;
        for (const badgeKey in allBadges) {
            if (userBadges[badgeKey] === true) {
                earnedBadgesCount++;
                const badgeInfo = allBadges[badgeKey];
                statsHTML += `<div class="badge-item" title="${badgeInfo.name}: ${badgeInfo.description}">${badgeInfo.icon}</div>`;
            }
        }
        if (earnedBadgesCount === 0) statsHTML += '<p class="no-badges-message">You haven\'t earned any badges yet. Keep cleaning!</p>';
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
                    const popupHTML = `
                        <div>
                            <strong>${feature.properties.name}</strong>
                            <div class="poi-popup-buttons">
                                <button class="modal-button schedule-btn">Schedule Meetup</button>
                                <button class="modal-button view-btn">View Meetups</button>
                            </div>
                        </div>`;
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
            const meetupId = doc.id;
            const li = document.createElement('li');
            const date = meetup.createdAt.toDate().toLocaleDateString();
            const isOrganizer = state.currentUser && state.currentUser.uid === meetup.organizerId;
            li.innerHTML = `<div><span>${meetup.title}</span><br><small class="session-date">Organized by: ${meetup.organizerName} on ${date}</small><p style="margin-top: 5px; white-space: pre-wrap;">${meetup.description}</p></div>${isOrganizer ? `<button class="delete-meetup-btn" data-id="${meetupId}">Delete</button>` : ''}`;
            const deleteBtn = li.querySelector('.delete-meetup-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    deleteMeetup(meetupId);
                });
            }
            meetupsList.appendChild(li);
        });
    });
}
async function deleteMeetup(meetupId) {
    if (confirm("Are you sure you want to permanently delete this meetup?")) {
        try {
            await deleteDoc(doc(db, "meetups", meetupId));
            alert("Meetup deleted successfully.");
        } catch (error) {
            console.error("Error deleting meetup:", error);
            alert("Failed to delete meetup.");
        }
    }
}

// --- NEW FUNCTION: Toggle Like ---
export async function toggleRouteLike(routeId) {
    if (!state.currentUser) {
        alert("Please log in to like a route.");
        return null;
    }
    const userId = state.currentUser.uid;
    const routeRef = doc(db, "publishedRoutes", routeId);
    try {
        const routeSnap = await getDoc(routeRef);
        if (!routeSnap.exists()) return null;

        const data = routeSnap.data();
        let likedBy = data.likedBy || [];
        let likeCount = data.likeCount || 0;
        let isLiked = false;

        // Toggle Logic
        if (likedBy.includes(userId)) {
            // Remove user
            likedBy = likedBy.filter(id => id !== userId);
            likeCount = Math.max(0, likeCount - 1);
            isLiked = false;
        } else {
            // Add user
            likedBy.push(userId);
            likeCount++;
            isLiked = true;
        }

        await updateDoc(routeRef, { likedBy: likedBy, likeCount: likeCount });
        return { likeCount, isLiked };
    } catch (error) {
        console.error("Error toggling like:", error);
        return null;
    }
}
