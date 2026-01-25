import { db, collection, addDoc, getDocs, getDoc, query, where, orderBy, updateDoc, doc, limit, deleteDoc, onSnapshot, setDoc, arrayUnion, arrayRemove, runTransaction } from './firebase.js';
import { state } from './config.js';
import { convertRouteFromFirestore, convertPinsFromFirestore, convertRouteForFirestore, convertPinsForFirestore } from './utils.js';
import { showPublicProfile } from './ui.js';

// --- HELPER: Haversine Distance (Miles) ---
function getDistanceInMiles(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;
    const R = 3958.8; 
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
    return R * c;
}

// ==========================================
// 1. BADGES & GAMIFICATION
// ==========================================

export async function awardBadge(userId, badgeTitle, badgeDescription, icon = '🏆') {
    try {
        const badgesRef = collection(db, "publicProfiles", userId, "badges");
        const q = query(badgesRef, where("title", "==", badgeTitle));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            // Upgrade Existing
            const docSnap = querySnapshot.docs[0];
            const currentData = docSnap.data();
            const newCount = (currentData.count || 1) + 1;
            
            let tier = "Stone";
            let color = "#7f8c8d"; 
            
            if (newCount >= 1000) { tier = "Obsidian"; color = "#2c3e50"; icon = "⚫️"; }
            else if (newCount >= 500) { tier = "Ruby"; color = "#e74c3c"; icon = "💎"; }
            else if (newCount >= 250) { tier = "Diamond"; color = "#3498db"; icon = "💎"; }
            else if (newCount >= 100) { tier = "Platinum"; color = "#e5e4e2"; icon = "💠"; }
            else if (newCount >= 50) { tier = "Gold"; color = "#f1c40f"; icon = "🥇"; }
            else if (newCount >= 25) { tier = "Silver"; color = "#bdc3c7"; icon = "🥈"; }
            else if (newCount >= 10) { tier = "Bronze"; color = "#cd7f32"; icon = "🥉"; }
            else if (newCount >= 5) { tier = "Iron"; color = "#95a5a6"; }

            await updateDoc(doc(badgesRef, docSnap.id), {
                count: newCount,
                tier: tier,
                color: color,
                icon: icon,
                lastEarned: new Date()
            });
            alert(`🔥 BADGE UPGRADED!\nYour "${badgeTitle}" badge is now ${tier} Tier (${newCount}x)!`);

        } else {
            // Create New
            await addDoc(badgesRef, {
                title: badgeTitle,
                description: badgeDescription,
                icon: icon,
                date: new Date(),
                count: 1,
                tier: "Stone",
                color: "#7f8c8d"
            });
            alert(`🏆 NEW BADGE EARNED: ${badgeTitle}!`);
        }
    } catch (error) {
        console.error("Error awarding badge:", error);
    }
}

// ==========================================
// 2. MAP ROUTES & EVENTS (God Mode Enabled)
// ==========================================

export function toggleCommunityView() {
    state.isCommunityView = !state.isCommunityView;
    const btn = document.getElementById('communityBtn');
    
    if (state.isCommunityView) {
        btn.innerHTML = '🌎 Hide Community';
        btn.classList.add('active');
        fetchAndDisplayCommunityRoutes();
    } else {
        btn.innerHTML = '🌎 Community Map';
        btn.classList.remove('active');
        clearCommunityRoutes();
    }
}

function clearCommunityRoutes() {
    state.communityLayers.forEach(layer => {
        if (state.map.getLayer(layer.id)) state.map.removeLayer(layer.id);
        if (state.map.getSource(layer.id)) state.map.removeSource(layer.id);
    });
    if (state.map.getLayer('clusters')) state.map.removeLayer('clusters');
    if (state.map.getLayer('cluster-count')) state.map.removeLayer('cluster-count');
    if (state.map.getLayer('unclustered-point')) state.map.removeLayer('unclustered-point');
    if (state.map.getSource('community-pins')) state.map.removeSource('community-pins');
    state.communityLayers = [];
}

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
      
      // Draw Routes
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
      
      // Prepare Pins
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
              routeId: routeId // Critical for God Mode
            },
            'geometry': { 'type': 'Point', 'coordinates': pin.coords }
          });
        });
      }
    });

    // Add Pins Source
    if (!state.map.getSource('community-pins')) {
      state.map.addSource('community-pins', {
        type: 'geojson',
        data: { 'type': 'FeatureCollection', 'features': allPinFeatures },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50
      });
    }

    // Cluster Layers
    state.map.addLayer({
      id: 'clusters',
      type: 'circle',
      source: 'community-pins',
      filter: ['has', 'point_count'],
      paint: { 'circle-color': '#4A7C59', 'circle-radius': 20 }
    });
    state.map.addLayer({
      id: 'cluster-count',
      type: 'symbol',
      source: 'community-pins',
      filter: ['has', 'point_count'],
      layout: { 'text-field': '{point_count_abbreviated}', 'text-size': 12 },
      paint: { 'text-color': '#ffffff' }
    });
    state.map.addLayer({
      id: 'unclustered-point',
      type: 'circle',
      source: 'community-pins',
      filter: ['!', ['has', 'point_count']],
      paint: { 'circle-color': '#4A7C59', 'circle-radius': 8, 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' }
    });

    // Click Listener (GOD MODE)
    state.map.on('click', 'unclustered-point', async (e) => {
      const coordinates = e.features[0].geometry.coordinates.slice();
      const properties = e.features[0].properties;

      let isAdmin = false;
      if (state.currentUser) {
          try {
              const pSnap = await getDoc(doc(db, "publicProfiles", state.currentUser.uid));
              if (pSnap.exists() && pSnap.data().role === 'admin') isAdmin = true;
          } catch (err) { console.error(err); }
      }

      const isOwner = state.currentUser && (state.currentUser.uid == properties.userId);
      const canDelete = isOwner || isAdmin;

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

      // Listeners
      const profileLink = popup.getElement().querySelector('.profile-link');
      if (profileLink) {
          profileLink.addEventListener('click', (ev) => {
              ev.preventDefault();
              showPublicProfile(properties.userId);
          });
      }
      if (canDelete) {
          const delBtn = popup.getElement().querySelector('.delete-route-btn');
          if (delBtn) {
              delBtn.addEventListener('click', async () => {
                  if (confirm("⚠️ GOD MODE: Permanently delete this entire route?")) {
                      await deleteDoc(doc(db, "publishedRoutes", properties.routeId)); 
                      popup.remove();
                      alert("Route deleted.");
                      fetchAndDisplayCommunityRoutes(); 
                  }
              });
          }
      }
    });

  } catch (error) { console.error(error); }
}

export async function fetchAndDisplayAllEvents() {
    const eventsList = document.getElementById('eventsList');
    if (!eventsList) return;
    eventsList.innerHTML = '<li><div style="text-align:center; padding:20px;">📡 Locating events near you...</div></li>';

    let dbLimit = 25;       
    let visibleCount = 4;   
    let userPos = null;
    let isAdmin = false;

    try {
        const [posResult, profileSnap] = await Promise.all([
            new Promise((resolve) => navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { timeout: 5000 })),
            state.currentUser ? getDoc(doc(db, "publicProfiles", state.currentUser.uid)) : Promise.resolve(null)
        ]);

        if (posResult) userPos = { lat: posResult.coords.latitude, lng: posResult.coords.longitude };
        if (profileSnap && profileSnap.exists() && profileSnap.data().role === 'admin') isAdmin = true;
    } catch (err) { console.log(err); }

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
                eventsList.innerHTML = `<div style="text-align:center; padding:30px; color:#666;"><h3>No upcoming events.</h3></div>`;
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

            if (userPos) allEvents.sort((a, b) => (a.distance || 99999) - (b.distance || 99999));

            // Render
            eventsList.innerHTML = ''; 
            const eventsToShow = allEvents.slice(0, visibleCount);

            eventsToShow.forEach(event => {
                const dateObj = event.eventDate ? event.eventDate.toDate() : event.createdAt.toDate();
                const dateStr = dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                const timeStr = dateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                const isOwner = state.currentUser && state.currentUser.uid === event.organizerId;
                const canDelete = isOwner || isAdmin;
                
                let distanceBadge = event.distance ? `${event.distance.toFixed(1)} mi away` : "Global";

                const li = document.createElement('li');
                li.className = "event-card"; 
                li.style.borderBottom = "1px solid #eee";
                li.style.padding = "15px";
                li.style.marginBottom = "10px";
                li.style.background = "white";
                li.style.borderRadius = "8px";
                li.style.cursor = "pointer";

                li.innerHTML = `
                    <div style="display:flex; justify-content:space-between;">
                        <div style="width:100%;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <strong>${event.title}</strong>
                                <span style="font-size:0.8em; color:#666;">${distanceBadge}</span>
                            </div>
                            <div style="color: #4A7C59;">📅 ${dateStr} @ ${timeStr}</div>
                            <div style="font-size: 0.85em;">📍 ${event.poiName}</div>
                            ${canDelete ? `<button class="delete-event-btn" style="background:#ffebee; color:red; border:none; margin-top:5px; cursor:pointer;">🗑️ Delete</button>` : ''}
                        </div>
                    </div>
                `;

                li.addEventListener('click', () => {
                    if (event.coordinates) {
                        document.getElementById('eventsModal').style.display = 'none';
                        document.getElementById('hubModal').style.display = 'none';
                        state.map.flyTo({ center: [event.coordinates.lng, event.coordinates.lat], zoom: 16 });
                    }
                });

                if (canDelete) {
                    li.querySelector('.delete-event-btn').addEventListener('click', async (e) => {
                        e.stopPropagation(); 
                        if (confirm(`Delete "${event.title}"?`)) {
                            await deleteDoc(doc(db, "meetups", event.id));
                            loadAndRender(); 
                        }
                    });
                }
                eventsList.appendChild(li);
            });
            
            // Pagination Button
            if (visibleCount < allEvents.length || allEvents.length === dbLimit) {
                const btnContainer = document.createElement('div');
                btnContainer.id = "loadMoreEventsBtn";
                btnContainer.style.textAlign = "center";
                const btn = document.createElement('button');
                btn.className = "modal-button secondary"; 
                
                if (visibleCount < allEvents.length) {
                    btn.innerText = "Load More Nearby";
                    btn.onclick = () => { visibleCount += 4; loadAndRender(); };
                } else {
                    btn.innerText = "Search Wider 📡";
                    btn.onclick = () => { dbLimit += 25; visibleCount += 4; loadAndRender(); };
                }
                btnContainer.appendChild(btn);
                eventsList.appendChild(btnContainer);
            }

        } catch (error) { console.error(error); eventsList.innerHTML = '<li>Error loading events.</li>'; }
    };
    loadAndRender();
}

// ==========================================
// 3. CHALLENGE SYSTEM (Logic Helpers)
// ==========================================

export async function createNewChallenge(title, desc, type, goal, timeLimit, badge, expire) {
    await addDoc(collection(db, "activeChallenges"), {
        title: title,
        description: desc,
        type: type, // 'distance' or 'count'
        goal: parseInt(goal),
        goal_miles: parseInt(goal), // Legacy support
        time_limit: parseInt(timeLimit),
        badge_icon: badge,
        created_at: new Date(),
        expires_at: new Date(expire),
        startDate: new Date(),
        endDate: new Date(expire),
        participants: 0,
        status: 'active'
    });
}

export async function getAdminChallenges() {
    const q = query(collection(db, "activeChallenges"), where("status", "==", "active"));
    const snapshot = await getDocs(q);
    const challenges = [];
    snapshot.forEach(doc => challenges.push({ id: doc.id, ...doc.data() }));
    return challenges;
}

export async function deleteChallenge(id) {
    await deleteDoc(doc(db, "activeChallenges", id));
}

export async function joinChallenge(challengeId, title, userId) {
    // 1. Add to user's private subcollection
    await setDoc(doc(db, "users", userId, "quests", challengeId), {
        title: title,
        progress: 0,
        status: 'active',
        joined_at: new Date()
    });
    // 2. Increment participant count
    const chalRef = doc(db, "activeChallenges", challengeId);
    await updateDoc(chalRef, { participants: arrayUnion(userId) }); // Using arrayUnion as a simple counter marker
}

export async function getUserQuests(userId) {
    const q = query(collection(db, "users", userId, "quests"));
    const snapshot = await getDocs(q);
    const quests = {};
    snapshot.forEach(doc => quests[doc.id] = doc.data());
    return quests;
}

// Admin Panel for Challenges: Includes Clone and Delete logic.
export function openAdminChallengeModal() {
    const list = document.getElementById('adminChallengeList');
    if (!list) return;
    list.innerHTML = '<li>Loading...</li>';
    const modal = document.getElementById('adminChallengeModal');
    if (modal) modal.style.display = 'flex';

    // Clone Logic
    const fillFormWith = (data) => {
        document.getElementById('challengeTitleInput').value = data.title;
        document.getElementById('challengeDescInput').value = data.description;
        document.getElementById('challengeGoalInput').value = data.goal;
        document.getElementById('challengeTypeInput').value = data.type;
        document.getElementById('challengeStartInput').value = '';
        document.getElementById('challengeEndInput').value = '';
        document.getElementById('challengeTitleInput').focus();
        alert(`Cloned "${data.title}"! Set new dates to restart it.`);
    };

    const q = query(collection(db, "activeChallenges"), orderBy("endDate", "desc"));
    onSnapshot(q, (snapshot) => {
        list.innerHTML = '';
        if (snapshot.empty) { list.innerHTML = '<li>No challenges found.</li>'; return; }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const isActive = new Date() >= data.startDate.toDate() && new Date() <= data.endDate.toDate();

            const li = document.createElement('li');
            li.className = "hub-card";
            li.style.cursor = "default";
            li.innerHTML = `
                <div style="flex-grow:1;">
                    <div style="display:flex; justify-content:space-between;">
                        <h4 style="margin:0;">${data.title}</h4>
                        <span style="font-size:0.8em; color:${isActive ? "green" : "red"};">${isActive ? "ACTIVE" : "ENDED"}</span>
                    </div>
                    <p style="font-size:0.8em; color:#666;">${data.description}</p>
                    <div style="font-size:0.8em;">Goal: ${data.goal} ${data.type}</div>
                </div>
                <div style="display:flex; flex-direction:column; gap:5px;">
                    <button class="clone-btn modal-button secondary" style="padding:4px 8px; font-size:0.8em;">🔄 Clone</button>
                    <button class="del-btn modal-button" style="padding:4px 8px; font-size:0.8em; background:#ffebee; color:red; border:none;">🗑️</button>
                </div>
            `;
            li.querySelector('.clone-btn').addEventListener('click', () => fillFormWith(data));
            li.querySelector('.del-btn').addEventListener('click', async () => {
                if(confirm("Delete this challenge?")) await deleteDoc(doc(db, "activeChallenges", docSnap.id));
            });
            list.appendChild(li);
        });
    });
}


// ==========================================
// 4. STANDARD FEATURES (Profile, Publishing, Leaderboard)
// ==========================================

export async function publishRoute() {
    if (!state.currentUser) { alert("Please log in to publish your route."); return; }
    if (state.routeCoordinates.length === 0 && state.photoPins.length === 0) { alert("No route or pins to publish."); return; }

    const publishModal = document.getElementById('publishedRoutesModal'); // Reuse modal or create new one
    const sessionName = prompt("Give your cleanup a public title:");
    if (!sessionName) return;

    try {
        const docSnap = await getDoc(doc(db, "publicProfiles", state.currentUser.uid));
        const username = docSnap.exists() ? docSnap.data().username : "Anonymous";
        
        let cleanupPhotoURL = null;
        // (Assuming photo upload logic is handled elsewhere or passed in state, simplifying for restoration)
        
        const routeData = {
            userId: state.currentUser.uid,
            username: username,
            sessionName: sessionName,
            timestamp: new Date(),
            route: convertRouteForFirestore(state.routeCoordinates),
            pins: convertPinsForFirestore(state.photoPins),
            distanceMiles: (state.currentSession.distance / 1609.34).toFixed(2),
            likeCount: 0,
            likedBy: []
        };

        await addDoc(collection(db, "publishedRoutes"), routeData);
        alert("Cleanup published to the Community Map!");
    } catch (error) {
        console.error("Error publishing:", error);
        alert("Failed to publish.");
    }
}

export async function populatePublishedRoutesList() {
    const list = document.getElementById('publishedRoutesList');
    list.innerHTML = '<li>Loading...</li>';
    const q = query(collection(db, "publishedRoutes"), where("userId", "==", state.currentUser.uid), orderBy("timestamp", "desc"));
    const snapshot = await getDocs(q);
    list.innerHTML = '';
    if(snapshot.empty) { list.innerHTML = '<li>No published routes.</li>'; return; }
    
    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const li = document.createElement('li');
        li.innerHTML = `<span>${data.sessionName} (${data.distanceMiles} mi)</span> <button class="del-btn">Delete</button>`;
        li.querySelector('.del-btn').addEventListener('click', async () => {
            if(confirm("Delete published route?")) {
                await deleteDoc(doc(db, "publishedRoutes", docSnap.id));
                populatePublishedRoutesList();
            }
        });
        list.appendChild(li);
    });
}

export async function loadProfileForEditing() {
    try {
        const docSnap = await getDoc(doc(db, "publicProfiles", state.currentUser.uid));
        if (docSnap.exists()) {
            const data = docSnap.data();
            document.getElementById('editUsername').value = data.username || '';
            document.getElementById('editBio').value = data.bio || '';
        }
    } catch (e) { console.error(e); }
}

export async function saveProfile() {
    const username = document.getElementById('editUsername').value;
    const bio = document.getElementById('editBio').value;
    try {
        await updateDoc(doc(db, "publicProfiles", state.currentUser.uid), { username, bio });
        alert("Profile updated!");
        document.getElementById('profileModal').style.display = 'none';
        document.getElementById('menuModal').style.display = 'flex';
    } catch (e) { console.error(e); alert("Error saving profile."); }
}

export async function fetchAndDisplayLeaderboard(metric) {
    const list = document.getElementById('leaderboardList');
    list.innerHTML = '<li>Loading...</li>';
    // Simplified logic: In real app, you'd likely have a specific leaderboard collection or index
    // For now, querying publicProfiles
    const q = query(collection(db, "publicProfiles"), orderBy(metric === 'totalPins' ? 'totalPins' : 'totalDistance', 'desc'), limit(10));
    const snapshot = await getDocs(q);
    list.innerHTML = '';
    let rank = 1;
    snapshot.forEach(doc => {
        const data = doc.data();
        const val = metric === 'totalPins' ? (data.totalPins || 0) : (data.totalDistance || 0).toFixed(1);
        const li = document.createElement('li');
        li.dataset.userid = doc.id;
        li.innerHTML = `<span class="rank">#${rank++}</span> <span class="leaderboard-profile-link" style="cursor:pointer; font-weight:bold;">${data.username}</span> <span>${val}</span>`;
        list.appendChild(li);
    });
}

export async function fetchAndDisplayMyStats() {
    // Basic stub to prevent errors
    if(!state.currentUser) return;
    const docSnap = await getDoc(doc(db, "publicProfiles", state.currentUser.uid));
    if(docSnap.exists()) {
        const data = docSnap.data();
        document.getElementById('myTotalDistance').innerText = (data.totalDistance || 0).toFixed(2);
        document.getElementById('myTotalPins').innerText = data.totalPins || 0;
    }
}

export async function toggleRouteLike(routeId) {
    if (!state.currentUser) return null;
    const ref = doc(db, "publishedRoutes", routeId);
    try {
        const result = await runTransaction(db, async (transaction) => {
            const sfDoc = await transaction.get(ref);
            if (!sfDoc.exists()) throw "Document does not exist!";
            const data = sfDoc.data();
            const likedBy = data.likedBy || [];
            let newLikeCount = data.likeCount || 0;
            let isLiked = false;

            if (likedBy.includes(state.currentUser.uid)) {
                const index = likedBy.indexOf(state.currentUser.uid);
                likedBy.splice(index, 1);
                newLikeCount--;
                isLiked = false;
            } else {
                likedBy.push(state.currentUser.uid);
                newLikeCount++;
                isLiked = true;
            }
            transaction.update(ref, { likeCount: newLikeCount, likedBy: likedBy });
            return { likeCount: newLikeCount, isLiked: isLiked };
        });
        return result;
    } catch (e) { console.error("Like failed: ", e); return null; }
}

export function openAchievementsModal() {
    // Stub to prevent UI error
    // (Logic handled in UI listeners mostly)
}

export function openEventBadgesModal() {
    // Stub
}

// ==========================================
// 5. POI & MEETUPS
// ==========================================

export function setupPoiClickListeners() {
    const poiLayers = ['poi-label', 'transit-label', 'airport-label', 'natural-point-label', 'natural-line-label', 'water-point-label', 'water-line-label', 'waterway-label'];
    poiLayers.forEach(layerId => {
        if (state.map.getLayer(layerId)) {
            state.map.on('click', layerId, (e) => {
                const feature = e.features[0];
                const name = feature.properties.name || "Unknown Location";
                const coords = e.lngLat; 

                const popupHTML = `
                    <div>
                        <strong>${name}</strong>
                        <div class="poi-popup-buttons">
                            <button class="modal-button schedule-btn">Schedule Meetup</button>
                            <button class="modal-button view-btn">View Meetups</button>
                        </div>
                    </div>`;
                    
                const popup = new mapboxgl.Popup().setLngLat(coords).setHTML(popupHTML).addTo(state.map);
                
                popup.getElement().querySelector('.schedule-btn').addEventListener('click', () => {
                    openMeetupModal(name, coords.lat, coords.lng);
                    popup.remove();
                });

                popup.getElement().querySelector('.view-btn').addEventListener('click', () => {
                    openViewMeetupsModal(name);
                    popup.remove();
                });
            });
            state.map.on('mouseenter', layerId, () => { state.map.getCanvas().style.cursor = 'pointer'; });
            state.map.on('mouseleave', layerId, () => { state.map.getCanvas().style.cursor = ''; });
        }
    });
}

function openMeetupModal(poiName, lat, lng) {
    if (!state.currentUser) { alert("Please log in to schedule a meetup."); return; }
    document.getElementById('meetupLocationName').textContent = poiName;
    document.getElementById('poiNameInput').value = poiName;
    document.getElementById('meetupLat').value = lat;
    document.getElementById('meetupLng').value = lng;
    document.getElementById('meetupDateInput').value = '';
    document.getElementById('meetupModal').style.display = 'flex';
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
        const docSnap = await getDoc(doc(db, "publicProfiles", state.currentUser.uid));
        const username = docSnap.data().username;
        const meetupData = {
            organizerId: state.currentUser.uid,
            organizerName: username,
            poiName: poiName,
            title: title,
            description: description,
            eventDate: new Date(dateVal),
            createdAt: new Date(),
            coordinates: (latStr && lngStr) ? { lat: parseFloat(latStr), lng: parseFloat(lngStr) } : null 
        };
        await addDoc(collection(db, "meetups"), meetupData);
        alert("Meetup scheduled successfully!");
        document.getElementById('meetupModal').style.display = 'none';
    } catch (error) { console.error("Error scheduling meetup:", error); alert("Error scheduling meetup."); }
}

export async function openViewMeetupsModal(poiName) {
    document.getElementById('viewMeetupsLocationName').textContent = poiName;
    const meetupsList = document.getElementById('meetupsList');
    meetupsList.innerHTML = '<li>Loading meetups...</li>';
    document.getElementById('viewMeetupsModal').style.display = 'flex';

    let isAdmin = false;
    if (state.currentUser) {
        const pSnap = await getDoc(doc(db, "publicProfiles", state.currentUser.uid));
        if (pSnap.exists() && pSnap.data().role === 'admin') isAdmin = true;
    }

    const q = query(collection(db, "meetups"), where("poiName", "==", poiName), orderBy("createdAt", "desc"));
    onSnapshot(q, (querySnapshot) => {
        meetupsList.innerHTML = '';
        if(querySnapshot.empty) { meetupsList.innerHTML = '<li>No meetups scheduled here yet.</li>'; return; }
        
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const dateStr = data.eventDate.toDate().toLocaleDateString();
            const canDelete = (state.currentUser && state.currentUser.uid === data.organizerId) || isAdmin;

            const li = document.createElement('li');
            li.innerHTML = `
                <div style="display:flex; justify-content:space-between;">
                    <strong>${data.title}</strong>
                    ${canDelete ? `<button class="del-btn" style="color:red; border:none; background:none; cursor:pointer;">🗑️</button>` : ''}
                </div>
                <small>${dateStr}</small><br>${data.description}
            `;
            if (canDelete) {
                li.querySelector('.del-btn').addEventListener('click', async () => {
                    if (confirm("Delete this meetup?")) await deleteDoc(doc(db, "meetups", docSnap.id));
                });
            }
            meetupsList.appendChild(li);
        });
    });
}
export function validateMeetupForm() {}
