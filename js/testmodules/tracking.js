import { db, storage, ref, uploadBytes, getDownloadURL, collection, query, where, getDocs, updateDoc, doc } from './firebase.js';
import { state } from './config.js';
import { createAndAddMarker, updateUserPinsSource } from './map.js';
import { calculateRouteDistance } from './utils.js';
import { clearCurrentSession } from './data.js';

let locationWatcher = null;

export function findMe() {
    const btn = document.getElementById('findMeBtn');
    if (state.findMeState === 0) {
        navigator.geolocation.getCurrentPosition(position => {
            const coords = [position.coords.longitude, position.coords.latitude];
            state.map.flyTo({ center: coords, zoom: 16 });
            if (state.findMeMarker) state.findMeMarker.remove();
            state.findMeMarker = new mapboxgl.Marker().setLngLat(coords).addTo(state.map);
            btn.classList.add('active');
            state.findMeState = 1;
            locationWatcher = navigator.geolocation.watchPosition(pos => {
                state.findMeMarker.setLngLat([pos.coords.longitude, pos.coords.latitude]);
            }, null, { enableHighAccuracy: true });
        });
    } else {
        resetFindMeState();
    }
}

export function toggleTracking() {
    if (state.trackingWatcher) {
        navigator.geolocation.clearWatch(state.trackingWatcher);
        state.trackingWatcher = null;
        document.getElementById('trackBtn').textContent = '🛰️ Start Tracking';
        document.getElementById('pictureBtn').disabled = true;
        showCleanupSummary();
    } else {
        document.getElementById('safetyModal').style.display = 'flex';
    }
}

export function startTracking() {
    clearCurrentSession();
    state.trackingStartTime = new Date();
    state.trackingWatcher = navigator.geolocation.watchPosition(pos => {
        const coord = [pos.coords.longitude, pos.coords.latitude];
        state.routeCoordinates.push(coord);
        if (state.map.getSource('user-route')) state.map.getSource('user-route').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: state.routeCoordinates } });
    }, null, { enableHighAccuracy: true });
    document.getElementById('trackBtn').textContent = '🛑 Stop Tracking';
    document.getElementById('pictureBtn').disabled = false;
}

export async function handlePhoto(event) {
    if (!event.target.files[0]) return;
    const file = event.target.files[0];
    navigator.geolocation.getCurrentPosition(async (pos) => {
        const coords = [pos.coords.longitude, pos.coords.latitude];
        const timestamp = Date.now();
        let url = "";
        if (state.currentUser) {
            const sRef = ref(storage, `photos/${state.currentUser.uid}/${timestamp}.jpg`);
            await uploadBytes(sRef, file);
            url = await getDownloadURL(sRef);
        }
        const pin = { id: timestamp, coords, imageURL: url, title: `Pin ${state.photoPins.length + 1}`, category: 'Other' };
        state.photoPins.push(pin);
        createAndAddMarker(pin, 'user');
        updateUserPinsSource();
    });
}

function showCleanupSummary() {
    const dist = calculateRouteDistance(state.routeCoordinates);
    document.getElementById('summaryDistance').textContent = `${dist.toFixed(2)} mi`;
    document.getElementById('summaryPins').textContent = state.photoPins.length;
    document.getElementById('summaryModal').style.display = 'flex';
    
    if (state.currentUser) {
        updateUserChallenges(state.currentUser.uid, dist, state.photoPins.length);
    }
}

/**
 * Updates Mission Progress
 * Unified to use the profile 'active_quests' field.
 */
export async function updateUserChallenges(userId, milesCleaned, itemsPinned) {
    try {
        const userRef = doc(db, "publicProfiles", userId);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) return;

        const data = userSnap.data();
        const quests = data.active_quests || {};
        let changed = false;

        for (const [id, quest] of Object.entries(quests)) {
            if (quest.status !== 'active') continue;
            
            // Fetch challenge rules
            const chalSnap = await getDoc(doc(db, "challenges", id));
            if (!chalSnap.exists()) continue;
            const rules = chalSnap.data();

            const oldProg = quest.progress || 0;
            const added = (rules.challengeType === 'count') ? itemsPinned : milesCleaned;
            quest.progress = parseFloat((oldProg + added).toFixed(2));
            
            const goal = rules.goalValue || rules.goal_miles;
            if (quest.progress >= goal) {
                quest.status = 'completed';
                const comm = await import('./community.js');
                comm.awardBadge(userId, rules.title, "Mission Accomplished!", rules.badge_icon || "🏆");
            }
            changed = true;
        }

        if (changed) await updateDoc(userRef, { active_quests: quests });
        
    } catch (e) { console.error("Quest Update Failed:", e); }
}

export function resetFindMeState() {
    if (locationWatcher) navigator.geolocation.clearWatch(locationWatcher);
    if (state.findMeMarker) state.findMeMarker.remove();
    state.findMeMarker = null;
    state.findMeState = 0;
    document.getElementById('findMeBtn').classList.remove('active');
}
