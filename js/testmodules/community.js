import { db, serverTimestamp, collection, getDocs, query, orderBy, addDoc, doc, getDoc, where, setDoc, deleteDoc, updateDoc, onSnapshot, limit, storage, ref, uploadBytes, getDownloadURL } from './firebase.js';
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
    // Reset date input
    document.getElementById('meetupDateInput').value = '';
    document.getElementById('meetupModal').style.display = 'flex';
    validateMeetupForm();
}

export function validateMeetupForm() {
    const title = document.getElementById('meetupTitleInput').value.trim();
    const description = document.getElementById('meetupDescriptionInput').value.trim();
    const dateVal = document.getElementById('meetupDateInput').value; // Check date
    const safetyChecked = document.getElementById('safetyCheckbox').checked;
    const createBtn = document.getElementById('createMeetupBtn');
    const profanityWarning = document.getElementById('profanityWarning');

    const hasProfanity = profanityList.some(word => title.toLowerCase().includes(word) || description.toLowerCase().includes(word));
    profanityWarning.style.display = hasProfanity ? 'block' : 'none';
    
    // Button is enabled only if ALL fields are filled
    createBtn.disabled = !(title && description && dateVal && safetyChecked && !hasProfanity);
}

export async function handleMeetupSubmit() {
    if (!state.currentUser) return;

    const title = document.getElementById('meetupTitleInput').value.trim();
    const description = document.getElementById('meetupDescriptionInput').value.trim();
    const dateVal = document.getElementById('meetupDateInput').value;
    const poiName = document.getElementById('poiNameInput').value;

    try {
        const publicProfileRef = doc(db, "publicProfiles", state.currentUser.uid);
        const docSnap = await getDoc(publicProfileRef);
        if (!docSnap.exists()) throw new Error("Could not find your public profile.");

        const username = docSnap.data().username;
        
        // Save the new "eventDate" field
        await addDoc(collection(db, "meetups"), {
            organizerId: state.currentUser.uid,
            organizerName: username,
            poiName: poiName,
            title: title,
            description: description,
            eventDate: new Date(dateVal), // Convert string to Date object
            createdAt: new Date()
        });

        alert("Meetup scheduled successfully!");
        document.getElementById('meetupModal').style.display = 'none';
        document.getElementById('meetupTitleInput').value = '';
        document.getElementById('meetupDescriptionInput').value = '';
        document.getElementById('meetupDateInput').value = '';
        document.getElementById('safetyCheckbox').checked = false;
    } catch (error) {
        console.error("Error scheduling meetup:", error);
        alert("There was an error scheduling your meetup.");
    }
}

// --- NEW: Fetch All Upcoming Events ---
export async function fetchAndDisplayAllEvents() {
    const eventsList = document.getElementById('allEventsList');
    if (!eventsList) return;
    eventsList.innerHTML = '<li>Loading upcoming events...</li>';

    try {
        const today = new Date();
        // Get all meetups where eventDate is in the future
        const q = query(
            collection(db, "meetups"), 
            where("eventDate", ">=", today),
            orderBy("eventDate", "asc"), // Soonest events first
            limit(20)
        );

        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            eventsList.innerHTML = '<li>No upcoming events found. Schedule one on the map!</li>';
            return;
        }

        eventsList.innerHTML = '';
        querySnapshot.forEach((doc) => {
            const event = doc.data();
            const dateObj = event.eventDate ? event.eventDate.toDate() : event.createdAt.toDate();
            
            // Format Date: "Mon, Jan 24 @ 2:00 PM"
            const dateStr = dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
            const timeStr = dateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

            const li = document.createElement('li');
            li.className = "event-card"; // You can style this class in CSS
            li.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:start;">
                    <div>
                        <strong>${event.title}</strong>
                        <div style="color: #4A7C59; font-weight: bold; font-size: 0.9em; margin: 4px 0;">
                            📅 ${dateStr} @ ${timeStr}
                        </div>
                        <div style="font-size: 0.85em; color: #666;">
                            📍 ${event.poiName} <br>
                            👤 Host: ${event.organizerName}
                        </div>
                        <p style="margin-top: 5px; font-size: 0.9em;">${event.description}</p>
                    </div>
                </div>
            `;
            eventsList.appendChild(li);
        });

    } catch (error) {
        console.error("Error fetching events:", error);
        eventsList.innerHTML = '<li>Could not load events. (Make sure your Firestore Index is created!)</li>';
    }
}

// (Keep openViewMeetupsModal and deleteMeetup as they were, or update them to show dates too)
function openViewMeetupsModal(poiName) {
    document.getElementById('viewMeetupsLocationName').textContent = poiName;
    const meetupsList = document.getElementById('meetupsList');
    meetupsList.innerHTML = '<li>Loading meetups...</li>';
    document.getElementById('viewMeetupsModal').style.display = 'flex';

    const q = query(collection(db, "meetups"), where("poiName", "==", poiName), orderBy("createdAt", "desc"));
    
    // ... existing snapshot logic ...
    // Note: You might want to update the display here to show eventDate as well
    onSnapshot(q, (querySnapshot) => {
        meetupsList.innerHTML = '';
        if(querySnapshot.empty) { meetupsList.innerHTML = '<li>No meetups here.</li>'; return; }
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const dateObj = data.eventDate ? data.eventDate.toDate() : data.createdAt.toDate();
            const dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            
            const li = document.createElement('li');
            li.innerHTML = `
                <strong>${data.title}</strong> (${dateStr})<br>
                ${data.description}
                ${state.currentUser && state.currentUser.uid === data.organizerId ? `<br><button onclick="deleteMeetup('${doc.id}')" style="color:red; font-size:0.8em;">Delete</button>` : ''}
            `;
            // Note: Attaching onclick like above is quick, but addEventListener is safer if you prefer consistent style
            const delBtn = li.querySelector('button');
            if(delBtn) delBtn.addEventListener('click', () => deleteMeetup(doc.id));
            
            meetupsList.appendChild(li);
        });
    });
}

async function deleteMeetup(meetupId) {
    if (confirm("Delete this meetup?")) {
        try { await deleteDoc(doc(db, "meetups", meetupId)); } 
        catch (e) { console.error(e); }
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

// --- CHALLENGES & ACHIEVEMENTS SYSTEM ---

export async function openAchievementsModal() {
    const list = document.getElementById('achievementsList');
    const title = document.getElementById('achievementsTitle');
    
    if (!list) return;

    if (title) title.innerText = "🏆 Achievements";
    list.innerHTML = "<p>Loading...</p>";

    // 1. Fetch User Data
    let userBadges = {};
    if (state.currentUser) {
        try {
            const userDoc = await getDoc(doc(db, "users", state.currentUser.uid));
            if (userDoc.exists()) {
                userBadges = userDoc.data().badges || {};
            }
        } catch (e) { console.error("Error fetching badges", e); }
    }

    list.innerHTML = ""; 
    let count = 0;

    // 2. Render Loop (Show ALL Badges)
    if (allBadges) {
        Object.entries(allBadges).forEach(([key, config]) => {
            // Check if user has this badge
            // We verify by Key OR by Name (fuzzy match) just in case
            const userHasIt = userBadges[key] || Object.values(userBadges).some(b => b.name === config.name);
            
            count++;

            const badgeEl = document.createElement('div');
            // This class controls the Gray vs Color look in CSS
            badgeEl.className = `achievement-item ${userHasIt ? 'unlocked' : 'locked'}`;
            
            // Background Color: Only applied inline if unlocked. 
            // If locked, CSS !important overrides it to Gray.
            const bgStyle = userHasIt ? config.color : '#ccc'; 

            badgeEl.innerHTML = `
                <div class="badge-icon" style="background:${bgStyle};">
                    ${config.icon} </div>
                <div>
                    <strong>${config.name}</strong>
                    <p style="font-size: 0.75em; color: #666; margin:0;">${config.description}</p>
                </div>
            `;
            list.appendChild(badgeEl);
        });
    }

    if (count === 0) {
        list.innerHTML = "<p>No badges configured.</p>";
    }
}

// --- 2. OPEN EVENT BADGES (Challenge Menu) ---
export async function openEventBadgesModal() {
    const list = document.getElementById('achievementsList');
    const title = document.getElementById('achievementsTitle');
    
    if (!list) return;

    // Fixed Title
    if(title) title.innerText = "⚔️ Event Badges (Earned)";
    
    list.innerHTML = "<p>Loading...</p>";

    // Fetch User Progress
    let userBadges = {};
    if (state.currentUser) {
        try {
            const userDoc = await getDoc(doc(db, "users", state.currentUser.uid));
            if (userDoc.exists()) userBadges = userDoc.data().badges || {};
        } catch (e) { console.error(e); }
    }

    list.innerHTML = ""; 
    let count = 0;

    // Logic: Look at USER INVENTORY first
    // We only want to show things the user actually has.
    // We also check config to see if there are any we missed, but usually events are rare.
    
    // Merge Config + Inventory to ensure we catch everything
    let displayList = { ...allBadges };
    Object.keys(userBadges).forEach(k => {
        if(!displayList[k]) displayList[k] = userBadges[k]; // Add orphans
    });

    Object.entries(displayList).forEach(([key, config]) => {
        const badgeData = userBadges[key];
        const isUnlocked = !!badgeData;

        // FILTER: Must be Challenge Badge AND Must be Unlocked
        const isChallengeBadge = key.includes('warrior') || (config.source === 'challenge') || (badgeData && badgeData.source === 'challenge');

        if (isChallengeBadge && isUnlocked) {
            count++;
            // For orphans, ensure we have defaults
            const safeConfig = {
                name: config.name || badgeData.name || "Event Badge",
                description: config.description || badgeData.description || "Legacy Reward",
                icon: config.icon || badgeData.icon || "🛡️",
                color: config.color || badgeData.color || "#FFD700"
            };
            
            const badgeEl = createBadgeElement(safeConfig, true);
            list.appendChild(badgeEl);
        }
    });

    if (count === 0) {
        list.innerHTML = `
            <div style="text-align:center; padding: 20px; color:#888;">
                <p>No event badges earned yet.</p>
                <small>Complete a Quest to earn one!</small>
            </div>`;
    }
}

// --- Helper to draw the HTML (Reduces duplicate code) ---
function createBadgeElement(config, isUnlocked) {
    const badgeEl = document.createElement('div');
    badgeEl.className = `achievement-item ${isUnlocked ? 'unlocked' : 'locked'}`;
    
    const bg = isUnlocked ? config.color : '#eee';
    const icon = isUnlocked ? config.icon : '🔒';
    const opacity = isUnlocked ? '1' : '0.5';

    badgeEl.innerHTML = `
        <div class="badge-icon" style="background:${bg}; opacity:${opacity}; font-size: 2em; width: 60px; height: 60px; display:flex; align-items:center; justify-content:center; border-radius:50%; margin: 0 auto;">
            ${icon}
        </div>
        <div style="margin-top: 10px;">
            <strong>${config.name}</strong>
            <p style="font-size: 0.8em; color: #666;">${config.description}</p>
        </div>
    `;
    return badgeEl;
}

export function openCurrentChallenges() {
    // Placeholder for next step
    const list = document.getElementById('activeChallengesList');
    list.innerHTML = `
        <div style="padding:20px; text-align:center; color:#666;">
            <p>No active challenges right now.</p>
            <p><em>(Backend logic coming in next update!)</em></p>
        </div>
    `;
}

export function openPastChallenges(type) {
    // type is 'completed' or 'uncompleted'
    const content = document.getElementById('pastChallengesContent');
    content.innerHTML = `
        <div style="padding:20px; text-align:center; color:#666;">
            <p>You have no ${type} challenges in history.</p>
        </div>
    `;
}

export async function createNewChallenge(title, desc, goal, badgeId, expireDate) {
    if (!confirm("Are you sure you want to launch this challenge globally?")) return;

    try {
        const docRef = await addDoc(collection(db, "active_challenges"), {
            title: title,
            description: desc,
            goal_miles: parseFloat(goal),
            badge_id: badgeId,
            expires_at: new Date(expireDate),
            created_at: serverTimestamp(),
            active: true
        });
        
        alert("✅ Challenge Launched! ID: " + docRef.id);
        // Optional: clear form or close modal here
    } catch (e) {
        console.error("Error creating challenge: ", e);
        alert("❌ Error: " + e.message + "\n(Did you set your Admin role in Firebase?)");
    }
}

// --- ADMIN: MANAGE CHALLENGES ---

// 1. Delete a challenge
export async function deleteChallenge(challengeId) {
    if (!confirm("⚠️ Are you sure you want to DELETE this challenge?")) return;

    try {
        await deleteDoc(doc(db, "active_challenges", challengeId));
        alert("🗑️ Challenge Deleted!");
        // We will refresh the list in the UI
    } catch (e) {
        console.error("Error deleting:", e);
        alert("Error: " + e.message);
    }
}

// 2. Fetch all challenges (for the admin list)
export async function getAdminChallenges() {
    const q = query(collection(db, "active_challenges"), orderBy("created_at", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// --- CHALLENGE PARTICIPATION ---

// 1. Join a Challenge
export async function joinChallenge(challengeId, challengeTitle, userId) {
    try {
        const userRef = doc(db, "users", userId);
        
        // We store active quests in a map field called 'active_quests'
        const updateData = {};
        updateData[`active_quests.${challengeId}`] = {
            title: challengeTitle,
            progress: 0.0,
            status: 'active',
            joined_at: new Date()
        };

        await updateDoc(userRef, updateData);
        return true;
    } catch (e) {
        console.error("Error joining challenge:", e);
        // If the map doesn't exist yet, setDoc with merge fixes it
        const userRef = doc(db, "users", userId);
        const setObj = { active_quests: {} };
        setObj.active_quests[challengeId] = {
            title: challengeTitle,
            progress: 0.0,
            status: 'active',
            joined_at: new Date()
        };
        await setDoc(userRef, setObj, { merge: true });
        return true;
    }
}

// 2. Get User's Active Quests
export async function getUserQuests(userId) {
    try {
        const userSnap = await getDoc(doc(db, "users", userId));
        if (userSnap.exists() && userSnap.data().active_quests) {
            return userSnap.data().active_quests;
        }
        return {}; // Return empty object if none found
    } catch (e) {
        console.error("Error fetching user quests:", e);
        return {};
    }
}

// --- CHALLENGE TRACKING ---

export async function updateChallengeProgress(userId, distanceMiles) {
    const userRef = doc(db, "users", userId);
    
    try {
        // 1. Get the user's current quests
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) return;
        
        const data = userSnap.data();
        const activeQuests = data.active_quests || {};
        const currentBadges = data.badges || {};
        let updatesMade = false;
        let earnedBadges = [];

        // 2. Loop through each quest they have joined
        for (const [chalId, quest] of Object.entries(activeQuests)) {
            
            // Skip if already finished
            if (quest.status === 'completed') continue;

            // Fetch the original challenge rules to check expiration/goal
            // (We fetch this to ensure we have the authoritative Goal and Expiration)
            const chalRef = doc(db, "active_challenges", chalId);
            const chalSnap = await getDoc(chalRef);
            
            if (!chalSnap.exists()) {
                // Challenge was deleted by Admin? Ignore it.
                continue; 
            }

            const rules = chalSnap.data();
            const now = new Date();
            const expiresAt = new Date(rules.expires_at.seconds * 1000);

            // Check Expiration
            if (now > expiresAt) {
                console.log(`Quest ${quest.title} has expired.`);
                // Optional: Mark as 'expired' so it stops tracking
                activeQuests[chalId].status = 'expired';
                updatesMade = true;
                continue;
            }

            // 3. ADD DISTANCE
            const oldProgress = quest.progress || 0;
            const newProgress = oldProgress + distanceMiles;
            
            activeQuests[chalId].progress = parseFloat(newProgress.toFixed(2));
            updatesMade = true;

            // 4. CHECK COMPLETION
            if (newProgress >= rules.goal_miles) {
                // 🎉 VICTORY!
                activeQuests[chalId].status = 'completed';
                activeQuests[chalId].completed_at = new Date();
                
                // Award Badge
                if (rules.badge_id) {
                    currentBadges[rules.badge_id] = {
                        earned_at: new Date(),
                        source: 'challenge'
                    };
                    earnedBadges.push(rules.badge_id);
                }
            }
        }

        // 5. Save everything back to the database
        if (updatesMade) {
            await updateDoc(userRef, {
                active_quests: activeQuests,
                badges: currentBadges
            });
            
            // 6. Return the new badges so the UI can show a popup
            return earnedBadges;
        }

    } catch (e) {
        console.error("Error updating challenge progress:", e);
    }
    return [];
}
