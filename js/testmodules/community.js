// js/testmodules/community.js

import { 
    db, collection, addDoc, getDocs, getDoc, query, where, orderBy, 
    updateDoc, doc, limit, deleteDoc, onSnapshot, setDoc, 
    arrayUnion, arrayRemove, runTransaction 
} from './firebase.js';

import { state } from './config.js';
import { 
    convertRouteFromFirestore, convertPinsFromFirestore, 
    convertRouteForFirestore, convertPinsForFirestore 
} from './utils.js';

// Import UI function to fix map click circular dependency
import { showPublicProfile } from './ui.js';

// --- HELPER: Distance Calculation ---
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
// 1. BADGES & ACHIEVEMENTS (Restored)
// ==========================================

export async function awardBadge(userId, badgeTitle, badgeDescription, icon = '🏆') {
    try {
        const badgesRef = collection(db, "publicProfiles", userId, "badges");
        const q = query(badgesRef, where("title", "==", badgeTitle));
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
            // Upgrade Logic
            const docSnap = snapshot.docs[0];
            const currentData = docSnap.data();
            const newCount = (currentData.count || 1) + 1;
            
            // Tier Logic
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
                icon: icon, // Update icon if tier changes
                lastEarned: new Date()
            });
            alert(`🔥 Badge Upgraded: ${badgeTitle} (${newCount}x)!`);
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
            alert(`🏆 New Badge: ${badgeTitle}!`);
        }
    } catch (e) { console.error("Badge Error:", e); }
}

export async function openAchievementsModal() {
    const list = document.getElementById('achievementsList');
    if (!list) return;
    list.innerHTML = '<li>Loading badges...</li>';
    
    if (!state.currentUser) {
        list.innerHTML = '<li>Please log in to see badges.</li>';
        return;
    }

    try {
        const q = query(collection(db, "publicProfiles", state.currentUser.uid, "badges"), orderBy("date", "desc"));
        const snapshot = await getDocs(q);
        
        list.innerHTML = '';
        if (snapshot.empty) {
            list.innerHTML = '<li style="text-align:center; padding:20px;">No badges yet. Start a challenge!</li>';
            return;
        }

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const dateStr = data.date ? data.date.toDate().toLocaleDateString() : 'Unknown';
            const li = document.createElement('li');
            li.className = "hub-card";
            li.style.display = "flex";
            li.style.gap = "15px";
            li.style.alignItems = "center";
            li.innerHTML = `
                <div style="font-size:2.5em;">${data.icon || '🏆'}</div>
                <div>
                    <strong>${data.title}</strong> <span style="font-size:0.8em; background:#eee; padding:2px 5px; border-radius:4px;">x${data.count || 1}</span>
                    <p style="margin:0; font-size:0.9em; color:#666;">${data.description}</p>
                    <small style="color:${data.color || '#666'}">${data.tier || 'Stone'} Tier • ${dateStr}</small>
                </div>
            `;
            list.appendChild(li);
        });
    } catch (e) {
        console.error(e);
        list.innerHTML = '<li>Error loading badges.</li>';
    }
}

export function openEventBadgesModal() {
    const title = document.getElementById('achievementsTitle');
    if (title) title.innerText = "Event Rewards";
    openAchievementsModal();
}

// ==========================================
// 2. CHALLENGE LOGIC (Restored)
// ==========================================

export async function createNewChallenge(title, desc, type, goal, timeLimit, badge, expire) {
    await addDoc(collection(db, "activeChallenges"), {
        title, description: desc, type, goal: parseInt(goal), goal_miles: parseInt(goal),
        time_limit: parseInt(timeLimit), badge_icon: badge,
        created_at: new Date(), expires_at: new Date(expire),
        startDate: new Date(), endDate: new Date(expire),
        participants: [], status: 'active'
    });
}

export async function getAdminChallenges() {
    const q = query(collection(db, "activeChallenges"), where("status", "==", "active"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function deleteChallenge(id) {
    await deleteDoc(doc(db, "activeChallenges", id));
}

export async function joinChallenge(challengeId, title, userId) {
    // 1. Add to user's private list
    await setDoc(doc(db, "users", userId, "quests", challengeId), {
        title: title, progress: 0, status: 'active', joined_at: new Date()
    });
    // 2. Update global participant count
    await updateDoc(doc(db, "activeChallenges", challengeId), {
        participants: arrayUnion(userId)
    });
}

export async function getUserQuests(userId) {
    const q = query(collection(db, "users", userId, "quests"));
    const snapshot = await getDocs(q);
    const quests = {};
    snapshot.forEach(doc => quests[doc.id] = doc.data());
    return quests;
}

// ==========================================
// 3. ADMIN PANEL (Challenge Management)
// ==========================================

export function openAdminChallengeModal() {
    const list = document.getElementById('adminChallengeList');
    if (!list) return;
    list.innerHTML = '<li>Loading...</li>';
    const modal = document.getElementById('adminChallengeModal');
    if (modal) modal.style.display = 'flex';

    const fillFormWith = (data) => {
        document.getElementById('challengeTitleInput').value = data.title;
        document.getElementById('challengeDescInput').value = data.description;
        document.getElementById('challengeGoalInput').value = data.goal;
        document.getElementById('challengeTypeInput').value = data.type || 'distance';
        document.getElementById('challengeStartInput').value = '';
        document.getElementById('challengeEndInput').value = '';
        alert(`Cloned "${data.title}"!`);
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
            li.innerHTML = `
                <div style="flex-grow:1;">
                    <strong>${data.title}</strong> <span style="font-size:0.8em; color:${isActive ? "green" : "red"};">${isActive ? "ACTIVE" : "ENDED"}</span>
                    <br><small>${data.goal} ${data.type}</small>
                </div>
                <div>
                    <button class="clone-btn" style="cursor:pointer;">🔄</button>
                    <button class="del-btn" style="color:red; cursor:pointer;">🗑️</button>
                </div>
            `;
            li.querySelector('.clone-btn').addEventListener('click', () => fillFormWith(data));
            li.querySelector('.del-btn').addEventListener('click', async () => {
                if (confirm("Delete?")) await deleteDoc(doc(db, "activeChallenges", docSnap.id));
            });
            list.appendChild(li);
        });
    });
}

// ==========================================
// 4. MAP, ROUTES & EVENTS
// ==========================================

export function toggleCommunityView() {
    state.isCommunityView = !state.isCommunityView;
    const btn = document.getElementById('communityBtn');
    if (state.isCommunityView) {
        btn.innerHTML = 'Hide Community';
        btn.classList.add('active');
        fetchAndDisplayCommunityRoutes();
    } else {
        btn.innerHTML = 'Community Map';
        btn.classList.remove('active');
        if(state.map.getSource('community-pins')) state.map.removeSource('community-pins');
        if(state.map.getLayer('clusters')) state.map.removeLayer('clusters');
        if(state.map.getLayer('cluster-count')) state.map.removeLayer('cluster-count');
        if(state.map.getLayer('unclustered-point')) state.map.removeLayer('unclustered-point');
        state.communityLayers = [];
    }
}

export async function fetchAndDisplayCommunityRoutes() {
    // God Mode Route Display
    const q = query(collection(db, "publishedRoutes"), orderBy("timestamp", "desc"));
    const snapshot = await getDocs(q);
    const features = [];
    
    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const pins = convertPinsFromFirestore(data.pins);
        pins.forEach(pin => {
            features.push({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: pin.coords },
                properties: { 
                    title: pin.title, 
                    userId: data.userId, 
                    routeId: docSnap.id, // Needed for delete
                    username: data.username,
                    imageURL: pin.imageURL
                }
            });
        });
        
        // Draw Route Line
        const coords = convertRouteFromFirestore(data.route);
        if (coords.length > 0) {
            const id = `route-${docSnap.id}`;
            state.map.addSource(id, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } });
            state.map.addLayer({ id: id, type: 'line', source: id, paint: { 'line-color': '#4A7C59', 'line-width': 3 } });
            state.communityLayers.push({ id, type: 'layer' });
        }
    });

    if(!state.map.getSource('community-pins')) {
        state.map.addSource('community-pins', { type: 'geojson', data: { type: 'FeatureCollection', features }, cluster: true });
        state.map.addLayer({ id: 'clusters', type: 'circle', source: 'community-pins', filter: ['has', 'point_count'], paint: { 'circle-color': '#4A7C59', 'circle-radius': 15 }});
        state.map.addLayer({ id: 'cluster-count', type: 'symbol', source: 'community-pins', filter: ['has', 'point_count'], layout: { 'text-field': '{point_count_abbreviated}', 'text-size': 12 }});
        state.map.addLayer({ id: 'unclustered-point', type: 'circle', source: 'community-pins', filter: ['!', ['has', 'point_count']], paint: { 'circle-color': '#4A7C59', 'circle-radius': 8 }});
        
        state.map.on('click', 'unclustered-point', async (e) => {
            const props = e.features[0].properties;
            const coords = e.features[0].geometry.coordinates.slice();
            let isAdmin = false;
            if(state.currentUser) {
                const p = await getDoc(doc(db, "publicProfiles", state.currentUser.uid));
                if(p.exists() && p.data().role === 'admin') isAdmin = true;
            }
            const canDelete = isAdmin || (state.currentUser && state.currentUser.uid == props.userId);
            
            new mapboxgl.Popup().setLngLat(coords)
                .setHTML(`
                    <div style="text-align:center;">
                        ${props.imageURL ? `<img src="${props.imageURL}" style="width:100px; border-radius:4px;">` : ''}
                        <p><strong>${props.title}</strong><br>By: ${props.username}</p>
                        ${canDelete ? `<button id="del-route-btn" style="color:red;">Delete Route</button>` : ''}
                    </div>
                `)
                .addTo(state.map);
                
            setTimeout(() => {
                const btn = document.getElementById('del-route-btn');
                if(btn) btn.onclick = async () => {
                    if(confirm("God Mode: Delete Route?")) {
                        await deleteDoc(doc(db, "publishedRoutes", props.routeId));
                        alert("Deleted.");
                        toggleCommunityView(); 
                        toggleCommunityView(); // Toggle off/on to refresh
                    }
                };
            }, 100);
        });
    }
}

export async function fetchAndDisplayAllEvents() {
    const list = document.getElementById('eventsList');
    if(!list) return;
    list.innerHTML = '<li>Loading...</li>';
    
    // Simple fetch, no complex geolocation sorting to minimize bugs for now
    const q = query(collection(db, "meetups"), orderBy("eventDate", "asc"));
    const snapshot = await getDocs(q);
    list.innerHTML = '';
    
    if(snapshot.empty) { list.innerHTML = '<li>No events found.</li>'; return; }
    
    let isAdmin = false;
    if(state.currentUser) {
        const p = await getDoc(doc(db, "publicProfiles", state.currentUser.uid));
        if(p.exists() && p.data().role === 'admin') isAdmin = true;
    }

    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const isOwner = state.currentUser && state.currentUser.uid == data.organizerId;
        const canDelete = isAdmin || isOwner;
        
        const li = document.createElement('li');
        li.className = "event-card";
        li.style.padding = "10px";
        li.style.borderBottom = "1px solid #eee";
        li.innerHTML = `
            <strong>${data.title}</strong><br>
            ${new Date(data.eventDate.seconds*1000).toLocaleDateString()}<br>
            ${canDelete ? `<button class="del-evt" style="color:red; cursor:pointer;">Delete</button>` : ''}
        `;
        
        if(canDelete) {
            li.querySelector('.del-evt').addEventListener('click', async (e) => {
                e.stopPropagation();
                if(confirm("Delete Event?")) {
                    await deleteDoc(doc(db, "meetups", docSnap.id));
                    fetchAndDisplayAllEvents();
                }
            });
        }
        
        li.addEventListener('click', () => {
            if(data.coordinates) {
                document.getElementById('eventsModal').style.display = 'none';
                document.getElementById('hubModal').style.display = 'none';
                state.map.flyTo({ center: [data.coordinates.lng, data.coordinates.lat], zoom: 16 });
            }
        });
        list.appendChild(li);
    });
}

// ==========================================
// 5. STANDARD FEATURES (Publish, Profile, Leaderboard)
// ==========================================

export async function publishRoute() {
    if (!state.currentUser) { alert("Please log in to publish your route."); return; }
    if (state.routeCoordinates.length === 0 && state.photoPins.length === 0) { alert("No route or pins to publish."); return; }

    const sessionName = prompt("Give your cleanup a public title:");
    if (!sessionName) return;

    try {
        const docSnap = await getDoc(doc(db, "publicProfiles", state.currentUser.uid));
        const username = docSnap.exists() ? docSnap.data().username : "Anonymous";
        
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
    if(!list) return;
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
            const uname = document.getElementById('editUsername');
            const bio = document.getElementById('editBio');
            if(uname) uname.value = data.username || '';
            if(bio) bio.value = data.bio || '';
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
    if(!list) return;
    list.innerHTML = '<li>Loading...</li>';
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
    if(!state.currentUser) return;
    const docSnap = await getDoc(doc(db, "publicProfiles", state.currentUser.uid));
    if(docSnap.exists()) {
        const data = docSnap.data();
        const dist = document.getElementById('myTotalDistance');
        const pins = document.getElementById('myTotalPins');
        if(dist) dist.innerText = (data.totalDistance || 0).toFixed(2);
        if(pins) pins.innerText = data.totalPins || 0;
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

export function validateMeetupForm() {
    const title = document.getElementById('meetupTitleInput').value.trim();
    const desc = document.getElementById('meetupDescriptionInput').value.trim();
    const date = document.getElementById('meetupDateInput').value;
    const isSafe = document.getElementById('safetyCheckbox').checked;
    const btn = document.getElementById('createMeetupBtn');
    if(btn) btn.disabled = !(title && desc && date && isSafe);
}

// ==========================================
// 6. POI CLICK LISTENERS
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
    const nameEl = document.getElementById('meetupLocationName');
    const poiIn = document.getElementById('poiNameInput');
    const latIn = document.getElementById('meetupLat');
    const lngIn = document.getElementById('meetupLng');
    
    if(nameEl) nameEl.textContent = poiName;
    if(poiIn) poiIn.value = poiName;
    if(latIn) latIn.value = lat;
    if(lngIn) lngIn.value = lng;
    
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
