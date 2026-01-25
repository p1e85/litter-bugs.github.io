import { db, serverTimestamp, Timestamp, collection, getDocs, query, orderBy, addDoc, doc, getDoc, where, setDoc, deleteDoc, updateDoc, onSnapshot, limit, storage, ref, uploadBytes, getDownloadURL } from './firebase.js';
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
      const routeId = doc.id; // Capture the ID here
      const mapboxCoords = convertRouteFromFirestore(routeData.route);
      
      // 1. Draw the Route Lines
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
      
      // 2. Prepare the Pins (Photos)
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
              userId: routeData.userId,
              routeId: routeId // <--- CRITICAL: Pass the ID so we can delete it later
            },
            'geometry': { 'type': 'Point', 'coordinates': pin.coords }
          });
        });
      }
    });

    // 3. Add the Pins Source
    if (!state.map.getSource('community-pins')) {
      state.map.addSource('community-pins', {
        type: 'geojson',
        data: { 'type': 'FeatureCollection', 'features': allPinFeatures },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50
      });
    }

    // 4. Cluster Circles
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

    // 5. Cluster Counts
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

    // 6. Individual Pins (The clickable ones)
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

    // 7. Cluster Click Listener
    state.map.on('click', 'clusters', (e) => {
      const features = state.map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
      const clusterId = features[0].properties.cluster_id;
      state.map.getSource('community-pins').getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err) return;
        state.map.easeTo({ center: features[0].geometry.coordinates, zoom: zoom });
      });
    });

    // 8. INDIVIDUAL PIN CLICK LISTENER (God Mode Updated)
    state.map.on('click', 'unclustered-point', async (e) => {
      const coordinates = e.features[0].geometry.coordinates.slice();
      const properties = e.features[0].properties;

      // A. Check Admin Status
      let isAdmin = false;
      if (state.currentUser) {
          try {
              const pSnap = await getDoc(doc(db, "publicProfiles", state.currentUser.uid));
              if (pSnap.exists() && pSnap.data().role === 'admin') isAdmin = true;
          } catch (err) { console.error(err); }
      }

      // B. Determine Permissions
      const isOwner = state.currentUser && (state.currentUser.uid == properties.userId);
      const canDelete = isOwner || isAdmin;

      // C. Build Popup HTML
      const popupHTML = `
        <div style="text-align:center;">
            <img src="${properties.thumbnailURL || properties.imageURL}" alt="${properties.title}" style="width:100%; border-radius: 4px; margin-bottom:5px;"/>
            <p style="margin: 0; font-weight:bold;">${properties.title}</p>
            <p style="margin: 0; font-size:0.8em; color:#555;">${properties.category || 'Other'}</p>
            <small>By: <a href="#" class="profile-link" data-userid="${properties.userId}">${properties.username || 'A user'}</a></small>
            
            ${canDelete ? `<br><button class="delete-route-btn" style="background:#d32f2f; color:white; border:none; padding:5px 10px; border-radius:4px; margin-top:8px; cursor:pointer; font-size:0.8em;">⚠️ Delete Route</button>` : ''}
        </div>
      `;

      const popup = new mapboxgl.Popup().setLngLat(coordinates).setHTML(popupHTML).addTo(state.map);

      // D. Attach Profile Link Listener
      const profileLink = popup.getElement().querySelector('.profile-link');
      if (profileLink) {
          profileLink.addEventListener('click', (ev) => {
              ev.preventDefault();
              showPublicProfile(properties.userId);
          });
      }

      // E. Attach Delete Button Listener
      if (canDelete) {
          const delBtn = popup.getElement().querySelector('.delete-route-btn');
          if (delBtn) {
              delBtn.addEventListener('click', async () => {
                  if (confirm("⚠️ GOD MODE: Permanently delete this entire route and its photos?")) {
                      try {
                          await deleteDoc(doc(db, "publishedRoutes", properties.routeId)); 
                          popup.remove();
                          alert("Route deleted.");
                          fetchAndDisplayCommunityRoutes(); // Refresh map
                      } catch (err) {
                          console.error("Delete failed:", err);
                          alert("Error deleting route.");
                      }
                  }
              });
          }
      }
    });

    // 9. Mouse Cursors
    const clickableLayers = ['clusters', 'unclustered-point'];
    clickableLayers.forEach(layer => {
      state.map.on('mouseenter', layer, () => { state.map.getCanvas().style.cursor = 'pointer'; });
      state.map.on('mouseleave', layer, () => { state.map.getCanvas().style.cursor = ''; });
    });

  } catch (error) {
    console.error("Error fetching community routes:", error);
    alert("Could not load community data.");
  }
} //*** end fetchAndDisplayCommunityRoutes ********

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
            showPopup(newBadges[0]);
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
            const profilesContainer = document.getElementById('profiles');
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

            profilesContainer.innerHTML = '';
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
                    profilesContainer.appendChild(badgeElement);
                }
            }
            if (earnedBadgesCount === 0) {
                profilesContainer.innerHTML = '<p class="no-badges-message">This user hasn\'t earned any badges yet.</p>';
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
            <h4>My s</h4><div class="my-stats-badges"><div class="badge-container">`;
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
function showPopup(badgeKey) {
    const badge = allBadges[badgeKey];
    if (!badge) return;
    const Modal = document.getElementById('Modal');
    Modal.querySelector('.-icon').textContent = badge.icon;
    document.getElementById('Name').textContent = badge.name;
    document.getElementById('Description').textContent = badge.description;
    Modal.style.display = 'flex';
}

// --- Meetups ---

// js/testmodules/community.js

export function setupPoiClickListeners() {
    const poiLayers = ['poi-label', 'transit-label', 'airport-label', 'natural-point-label', 'natural-line-label', 'water-point-label', 'water-line-label', 'waterway-label'];
    
    poiLayers.forEach(layerId => {
        if (state.map.getLayer(layerId)) {
            state.map.on('click', layerId, (e) => {
                if (e.features.length > 0) {
                    const feature = e.features[0];
                    const name = feature.properties.name || "Unknown Location";
                    
                    // NEW: Get Coordinates
                    // e.lngLat contains {lng: -87.xxx, lat: 41.xxx}
                    const coords = e.lngLat; 

                    const popupHTML = `
                        <div>
                            <strong>${name}</strong>
                            <div class="poi-popup-buttons">
                                <button class="modal-button schedule-btn">Schedule Meetup</button>
                                <button class="modal-button view-btn">View Meetups</button>
                            </div>
                        </div>`;
                        
                    const popup = new mapboxgl.Popup()
                        .setLngLat(coords) // Use the clicked coordinates
                        .setHTML(popupHTML)
                        .addTo(state.map);

                    // PASS COORDINATES TO THE MODAL
                    popup.getElement().querySelector('.schedule-btn').addEventListener('click', () => {
                        openMeetupModal(name, coords.lat, coords.lng); // <--- NEW ARGUMENTS
                        popup.remove();
                    });

                    popup.getElement().querySelector('.view-btn').addEventListener('click', () => {
                        openViewMeetupsModal(name);
                        popup.remove();
                    });
                }
            });
            
            // Cursor pointers
            state.map.on('mouseenter', layerId, () => { state.map.getCanvas().style.cursor = 'pointer'; });
            state.map.on('mouseleave', layerId, () => { state.map.getCanvas().style.cursor = ''; });
        }
    });
}

// Updated to accept coordinates
function openMeetupModal(poiName, lat, lng) {
    if (!state.currentUser) {
        alert("Please log in to schedule a meetup.");
        return;
    }
    
    document.getElementById('meetupLocationName').textContent = poiName;
    document.getElementById('poiNameInput').value = poiName;
    
    // NEW: Save coordinates to the hidden inputs
    document.getElementById('meetupLat').value = lat;
    document.getElementById('meetupLng').value = lng;
    
    // Reset other fields
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
    const latStr = document.getElementById('meetupLat').value;
    const lngStr = document.getElementById('meetupLng').value;

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
            createdAt: new Date(),
            coordinates: (latStr && lngStr) ? {
                lat: parseFloat(latStr),
                lng: parseFloat(lngStr)
            } : null
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
} // end handle meetup submit **********************

// --- NEW: Fetch All Upcoming Events ---
// js/testmodules/community.js

// --- 1. THE MATH HELPER (Haversine Formula) ---
// Calculates the distance (in miles) between two GPS points
function getDistanceInMiles(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null; // Safety check
    
    const R = 3958.8; // Radius of the earth in miles
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
    return R * c;
}

// --- 2. THE MAIN DISPLAY FUNCTION ---

export async function fetchAndDisplayAllEvents() {
    const eventsList = document.getElementById('eventsList');
    if (!eventsList) return;
    eventsList.innerHTML = '<li><div style="text-align:center; padding:20px;">📡 Locating events near you...</div></li>';

    let dbLimit = 25;       
    let visibleCount = 4;   
    let userPos = null;
    let isAdmin = false;

    // --- 1. GET USER LOCATION & ADMIN STATUS ---
    try {
        // Parallel fetch: Get Location AND Check Admin Role
        const [posResult, profileSnap] = await Promise.all([
            new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
            }).catch(e => null), // Catch error so it doesn't break the whole app
            
            state.currentUser ? getDoc(doc(db, "publicProfiles", state.currentUser.uid)) : Promise.resolve(null)
        ]);

        if (posResult) {
            userPos = { lat: posResult.coords.latitude, lng: posResult.coords.longitude };
        }
        
        // Check if user is Admin
        if (profileSnap && profileSnap.exists() && profileSnap.data().role === 'admin') {
            isAdmin = true;
            console.log("⚡️ GOD MODE ACTIVE: You are an Admin.");
        }

    } catch (err) { console.log("Init error:", err); }

    // --- 2. MAIN DATA LOADER ---
    const loadAndRender = async () => {
        try {
            const existingBtn = document.getElementById('loadMoreEventsBtn');
            if(existingBtn) existingBtn.querySelector('button').innerText = "Loading...";

            const today = new Date();
            const q = query(
                collection(db, "meetups"), 
                where("eventDate", ">=", today),
                orderBy("eventDate", "asc"), 
                limit(dbLimit)
            );

            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                eventsList.innerHTML = `<div style="text-align:center; padding:30px; color:#666;"><h3>No upcoming events.</h3><p>Be the first to schedule a cleanup!</p></div>`;
                return;
            }

            let allEvents = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                let dist = null;
                if (userPos && data.coordinates) {
                    dist = getDistanceInMiles(userPos.lat, userPos.lng, data.coordinates.lat, data.coordinates.lng);
                }
                allEvents.push({ id: doc.id, ...data, distance: dist });
            });

            if (userPos) {
                allEvents.sort((a, b) => {
                    const distA = a.distance !== null ? a.distance : 99999;
                    const distB = b.distance !== null ? b.distance : 99999;
                    return distA - distB;
                });
            }

            // --- RENDER LOGIC ---
            eventsList.innerHTML = ''; 
            const eventsToShow = allEvents.slice(0, visibleCount);

            eventsToShow.forEach(event => {
                const dateObj = event.eventDate ? event.eventDate.toDate() : event.createdAt.toDate();
                const dateStr = dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                const timeStr = dateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

                let distanceBadge = '';
                if (event.distance !== null) {
                    const distText = event.distance < 0.2 ? "📍 Nearby" : `${event.distance.toFixed(1)} mi away`;
                    distanceBadge = `<span style="background:#e8f5e9; color:#2e7d32; padding:3px 8px; border-radius:12px; font-size:0.75em; font-weight:bold; margin-left:8px;">${distText}</span>`;
                } else if (userPos) {
                     distanceBadge = `<span style="background:#f5f5f5; color:#888; padding:3px 8px; border-radius:12px; font-size:0.75em;">🌎 Global</span>`;
                }

                // CHECK PERMISSIONS (Owner OR Admin)
                const isOwner = state.currentUser && state.currentUser.uid === event.organizerId;
                const canDelete = isOwner || isAdmin;

                const li = document.createElement('li');
                li.className = "event-card"; 
                li.style.borderBottom = "1px solid #eee";
                li.style.padding = "15px";
                li.style.marginBottom = "10px";
                li.style.background = "white";
                li.style.borderRadius = "8px";
                li.style.cursor = "pointer";
                li.style.position = "relative";

                li.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:start;">
                        <div style="width:100%;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                                <strong style="font-size:1.1em; color:#333;">${event.title}</strong>
                                <div>
                                    ${distanceBadge}
                                    ${canDelete ? `<button class="delete-event-btn" data-id="${event.id}" style="background:#ffebee; color:#c62828; border:none; border-radius:4px; padding:2px 6px; font-size:0.8em; margin-left:5px; cursor:pointer;">🗑️ Delete</button>` : ''}
                                </div>
                            </div>
                            <div style="color: #4A7C59; font-weight: 600; font-size: 0.9em; margin-bottom: 5px;">
                                📅 ${dateStr} @ ${timeStr}
                            </div>
                            <div style="font-size: 0.85em; color: #666; margin-bottom: 8px;">
                                📍 ${event.poiName} <br>
                                👤 Host: ${event.organizerName}
                            </div>
                            <p style="margin: 0; font-size: 0.9em; color:#444; line-height:1.4;">${event.description}</p>
                        </div>
                    </div>
                `;

                // Card Click: Fly to map
                li.addEventListener('click', () => {
                    if (event.coordinates) {
                        document.getElementById('eventsModal').style.display = 'none';
                        document.getElementById('hubModal').style.display = 'none';
                        document.getElementById('menuModal').style.display = 'none';
                        state.map.flyTo({ center: [event.coordinates.lng, event.coordinates.lat], zoom: 16, essential: true });
                        new mapboxgl.Popup().setLngLat([event.coordinates.lng, event.coordinates.lat])
                            .setHTML(`<div style="text-align:center;"><strong>${event.title}</strong><br><span style="font-size:0.9em; color:#666;">${event.poiName}</span><br><span style="font-size:0.8em; color:#4A7C59;">📅 ${dateStr} @ ${timeStr}</span></div>`)
                            .addTo(state.map);
                    } else {
                        alert("⚠️ This event doesn't have GPS data attached.");
                    }
                });

                // Delete Click: Handle separately (stop bubbling)
                if (canDelete) {
                    const delBtn = li.querySelector('.delete-event-btn');
                    delBtn.addEventListener('click', async (e) => {
                        e.stopPropagation(); // Don't trigger the map flyTo
                        if (confirm(`⚠️ GOD MODE: Delete "${event.title}" permanently?`)) {
                            await deleteDoc(doc(db, "meetups", event.id));
                            alert("Event deleted.");
                            loadAndRender(); // Refresh list
                        }
                    });
                }

                eventsList.appendChild(li);
            });

            // Button Logic
            const hasMoreLocal = visibleCount < allEvents.length;
            const mightHaveMoreDB = allEvents.length === dbLimit;

            if (hasMoreLocal || mightHaveMoreDB) {
                const btnContainer = document.createElement('div');
                btnContainer.id = "loadMoreEventsBtn";
                btnContainer.style.textAlign = "center";
                btnContainer.style.padding = "10px";
                
                const btn = document.createElement('button');
                btn.className = "modal-button secondary"; 
                btn.style.width = "auto";
                btn.style.display = "inline-block";
                
                if (hasMoreLocal) {
                    btn.innerText = `Load More (${allEvents.length - visibleCount} nearby)`;
                    btn.onclick = () => { visibleCount += 4; loadAndRender(); };
                } else {
                    btn.innerText = `Search Wider Area 📡`;
                    btn.onclick = () => { dbLimit += 25; visibleCount += 4; loadAndRender(); };
                }

                btnContainer.appendChild(btn);
                eventsList.appendChild(btnContainer);
            }

        } catch (error) {
            console.error("Error loading events:", error);
            eventsList.innerHTML = '<li>Error loading events.</li>';
        }
    };

    loadAndRender();
} // end fetchAndDisplayAllEvents ******************

// (Keep openViewMeetupsModal and deleteMeetup as they were, or update them to show dates too)
export async function openViewMeetupsModal(poiName) {
    document.getElementById('viewMeetupsLocationName').textContent = poiName;
    const meetupsList = document.getElementById('meetupsList');
    meetupsList.innerHTML = '<li>Loading meetups...</li>';
    document.getElementById('viewMeetupsModal').style.display = 'flex';

    // 1. Check Admin Status First
    let isAdmin = false;
    if (state.currentUser) {
        try {
            const pSnap = await getDoc(doc(db, "publicProfiles", state.currentUser.uid));
            if (pSnap.exists() && pSnap.data().role === 'admin') isAdmin = true;
        } catch (e) { console.error(e); }
    }

    // 2. Fetch Meetups
    const q = query(collection(db, "meetups"), where("poiName", "==", poiName), orderBy("createdAt", "desc"));
    
    onSnapshot(q, (querySnapshot) => {
        meetupsList.innerHTML = '';
        if(querySnapshot.empty) { meetupsList.innerHTML = '<li>No meetups scheduled here yet.</li>'; return; }
        
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const dateObj = data.eventDate ? data.eventDate.toDate() : data.createdAt.toDate();
            const dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            
            // PERMISSION CHECK
            const isOwner = state.currentUser && state.currentUser.uid === data.organizerId;
            const canDelete = isOwner || isAdmin;

            const li = document.createElement('li');
            li.innerHTML = `
                <div style="display:flex; justify-content:space-between;">
                    <strong>${data.title}</strong>
                    ${canDelete ? `<button class="del-btn" style="color:red; font-size:0.8em; border:none; background:none; cursor:pointer;">🗑️</button>` : ''}
                </div>
                <small>${dateStr}</small><br>
                ${data.description}
            `;

            if (canDelete) {
                li.querySelector('.del-btn').addEventListener('click', async () => {
                    if (confirm("Delete this meetup?")) {
                        await deleteDoc(doc(db, "meetups", docSnap.id));
                    }
                });
            }
            
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
    // We target the existing list container in your HTML
    const grid = document.getElementById('achievementsList');
    const title = document.getElementById('achievementsTitle');

    if (title) title.innerText = "🏆 All Achievements";
    
    if (!grid) return;

    grid.innerHTML = '<p>Loading...</p>';

    if (!state.currentUser) {
        grid.innerHTML = "<p>Please log in to see your achievements.</p>";
        return;
    }

    try {
        // 1. Get User's Earned Badges from PUBLIC PROFILES (The fix!)
        const profileRef = doc(db, "publicProfiles", state.currentUser.uid);
        const profileSnap = await getDoc(profileRef);
        
        // Grab the badges object, or empty object if none exist
        const userBadges = profileSnap.exists() ? (profileSnap.data().badges || {}) : {};

        console.log("🏆 Loaded Badges from PublicProfile:", userBadges); // Debug log

        // 2. Clear Grid
        grid.innerHTML = '';

        // 3. Loop through ALL possible badges (from config.js)
        Object.entries(allBadges).forEach(([badgeId, badgeInfo]) => {
            
            // Check if user has it. We use !! to handle strictly true OR object data
            const hasBadge = !!userBadges[badgeId];
            
            const card = document.createElement('div');
            // We use the class names from your snippet to match your CSS expectations
            card.className = `achievement-card ${hasBadge ? 'unlocked' : 'locked'}`;
            
            // Add tooltips
            card.title = hasBadge ? `EARNED: ${badgeInfo.description}` : `LOCKED: ${badgeInfo.description}`;
            
            // Render: Icon + Name
            // Note: Locked items get handled by CSS opacity/grayscale
            card.innerHTML = `
                <div class="achievement-icon">${badgeInfo.icon}</div>
                <div class="achievement-name">${badgeInfo.name}</div>
                <div class="achievement-desc">${badgeInfo.description}</div>
            `;
            
            // Optional: Click to see details (From your snippet)
            card.addEventListener('click', () => {
                alert(`${badgeInfo.name}\n\n${badgeInfo.description}\n\nStatus: ${hasBadge ? "✅ Earned" : "🔒 Locked"}`);
            });

            grid.appendChild(card);
        });

    } catch (error) {
        console.error("Error loading achievements:", error);
        grid.innerHTML = '<p>Error loading data.</p>';
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
        // FIX: Added 'grid-column: 1 / -1' so it spans the whole width
        // and 'display: flex' to center content vertically/horizontally
        list.innerHTML = `
            <div style="grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 20px; color: #888; text-align: center;">
                <div style="font-size: 3em; margin-bottom: 10px; opacity: 0.5;">🛡️</div>
                <h4 style="margin: 0; color: #666;">No Event Badges Yet</h4>
                <p style="margin-top: 5px; font-size: 0.9em;">Complete a Quest to earn your first reward!</p>
            </div>`;
    }
} // end ........

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

export async function createNewChallenge(title, description, type, goal, timeLimit, badgeIcon, expirationDate) {
    if (!confirm("Are you sure you want to launch this challenge globally?")) return;

    try {
        const docRef = await addDoc(collection(db, "challenges"), {
            title: title,
            description: description,
            challengeType: type || 'distance', // 'distance' or 'count'
            goalValue: Number(goal),           // The number to reach
            timeLimit: timeLimit ? Number(timeLimit) : null, // Minutes (null if unlimited)
            badge_icon: badgeIcon || "🏅",
            created_at: serverTimestamp(),
            expires_at: Timestamp.fromDate(new Date(expirationDate))
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
        await deleteDoc(doc(db, "challenges", challengeId));
        alert("🗑️ Challenge Deleted!");
        // We will refresh the list in the UI
    } catch (e) {
        console.error("Error deleting:", e);
        alert("Error: " + e.message);
    }
}

// 2. Fetch all challenges (for the admin list)
export async function getAdminChallenges() {
    const q = query(collection(db, "challenges"), orderBy("created_at", "desc"));
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
            const chalRef = doc(db, "challenges", chalId);
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
            
            // --- LOGIC FOR DISPLAYING TEXT ---
            const type = chal.challengeType || 'distance'; // default to distance for old data
            const goalVal = chal.goalValue || chal.goal_miles; // fallback for old data
            
            let goalText = "";
            let progressText = "";
            
            // Format Goal String
            if (type === 'count') {
                goalText = `${goalVal} Items`;
            } else {
                goalText = `${goalVal} Miles`;
            }

            // Format Time Limit String
            let timeText = "";
            if (chal.timeLimit) {
                timeText = `<br>⏱ Time Limit: ${chal.timeLimit} mins`;
            }

            const expireDate = new Date(chal.expires_at.seconds * 1000);
            const diffDays = Math.ceil((expireDate - new Date()) / (1000 * 60 * 60 * 24)); 
            
            const questData = myQuests[chal.id];
            const isJoined = !!questData;
            const isCompleted = questData && questData.status === 'completed';
            const userProgress = isJoined ? questData.progress : 0;

            // Format Progress String
            if (isJoined) {
                if (type === 'count') {
                    progressText = `${userProgress.toFixed(0)} / ${goalVal} items`;
                } else {
                    progressText = `${userProgress.toFixed(2)} / ${goalVal} mi`;
                }
            }

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
                        <small style="color:#666;">${progressText}</small>
                    </div>`;
            } else {
                buttonHtml = `<button class="modal-button primary start-btn" data-id="${chal.id}">Start</button>`;
            }

            card.innerHTML = `
                <div style="flex-grow:1;">
                    <h4 style="margin: 0; color: #4A7C59;">${chal.title}</h4>
                    <p style="font-size: 0.9em; color: #666; margin: 5px 0;">${chal.description}</p>
                    <div style="font-size: 0.85em; font-weight: bold; color: ${statusColor};">
                        🎯 Goal: ${goalText} ${timeText} <br>
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
                    // Pass the type to the join function if needed, or just ID
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
