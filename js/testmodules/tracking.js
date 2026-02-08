import { 
    db, storage, ref, uploadBytes, getDownloadURL, collection, 
    query, where, getDocs, updateDoc, doc, getDoc, serverTimestamp, increment 
} from './firebase.js';
import { state } from './config.js';
import { createAndAddMarker, updateUserPinsSource } from './map.js';
// PHASE 2 FIX: Importing the unified Miles formula
import { calculateRouteDistance } from './utils.js';
import { clearCurrentSession } from './data.js';

let locationWatcher = null;

/* ==========================================================================
   1. LOCATION & ORIENTATION (Find Me Logic)
   ========================================================================== */

/**
 * Handles the 3-state "Find Me" button:
 * State 0: Locate and Center
 * State 1: 3D Tactical Tilt
 * State 2: Reset to North-Up
 */
export function findMe() {
    const findMeBtn = document.getElementById('findMeBtn');
    if (!state.map) return;

    // --- State 0: First click -> Center the user ---
    if (state.findMeState === 0) {
        navigator.geolocation.getCurrentPosition(position => {
            const coords = [position.coords.longitude, position.coords.latitude];
            
            // Move camera to user
            state.map.flyTo({ 
                center: coords, 
                zoom: 16, 
                bearing: 0, 
                pitch: 0,
                essential: true 
            });

            // Add or move the blue pulse marker
            if (state.findMeMarker) state.findMeMarker.remove();
            state.findMeMarker = new mapboxgl.Marker({ color: '#007cbf' })
                .setLngLat(coords)
                .addTo(state.map);

            findMeBtn.classList.add('active');
            state.findMeState = 1;

            // Start active watching for centering
            if (locationWatcher) navigator.geolocation.clearWatch(locationWatcher);
            locationWatcher = navigator.geolocation.watchPosition(pos => {
                const newCoords = [pos.coords.longitude, pos.coords.latitude];
                if (state.findMeMarker) state.findMeMarker.setLngLat(newCoords);

                // If in State 2 (Compass Mode), rotate map with heading
                if (state.findMeState === 2 && typeof pos.coords.heading === 'number' && pos.coords.heading !== null) {
                    state.map.easeTo({ bearing: pos.coords.heading, duration: 1000 });
                }
            }, (err) => console.warn("Watch error:", err), { enableHighAccuracy: true });

        }, () => alert("Uplink failed. Please enable location services."), { enableHighAccuracy: true });
    }
    // --- State 1: Second click -> Tactical Tilt ---
    else if (state.findMeState === 1) {
        state.map.easeTo({ pitch: 60, zoom: 18, duration: 1000 });
        findMeBtn.innerHTML = '🧭'; // Swap to compass icon
        state.findMeState = 2;
    }
    // --- State 2: Third click -> Reset View ---
    else if (state.findMeState === 2) {
        state.map.easeTo({ pitch: 0, bearing: 0, zoom: 16, duration: 1000 });
        findMeBtn.innerHTML = '📍'; // Swap back to pin
        state.findMeState = 1;
    }
}

/**
 * Resets the location tracking and UI state.
 */
export function resetFindMeState() {
    if (locationWatcher) {
        navigator.geolocation.clearWatch(locationWatcher);
        locationWatcher = null;
    }
    if (state.findMeMarker) {
        state.findMeMarker.remove();
        state.findMeMarker = null;
    }
    const btn = document.getElementById('findMeBtn');
    if (btn) {
        btn.classList.remove('active');
        btn.innerHTML = '📍';
    }
    state.findMeState = 0;
}

/* ==========================================================================
   2. MISSION TRACKING (Route & GPS)
   ========================================================================== */

/**
 * Toggles the tracking engine on or off.
 */
export function toggleTracking() {
    const trackBtn = document.getElementById('trackBtn');
    
    if (state.trackingWatcher) {
        // --- STOP TRACKING ---
        navigator.geolocation.clearWatch(state.trackingWatcher);
        state.trackingWatcher = null;
        
        trackBtn.textContent = '🛰️ Start Tracking';
        trackBtn.classList.remove('tracking');
        
        // Lock the camera trigger
        const pictureBtn = document.getElementById('pictureBtn');
        if (pictureBtn) pictureBtn.disabled = true;

        // Clear the pulsing current-position dot from map
        if (state.map.getSource('user-location-point')) {
            state.map.getSource('user-location-point').setData({ 
                type: 'Feature', 
                geometry: { type: 'Point', coordinates: [] } 
            });
        }

        // Finalize results
        showCleanupSummary();
    } else {
        // --- START TRACKING (Safety Check) ---
        const safetyModal = document.getElementById('safetyModal');
        if (safetyModal) safetyModal.style.display = 'flex';
    }
}

/**
 * Initiates the GPS watcher and recording session.
 */
export function startTracking() {
    clearCurrentSession(); // Wipe any old data from current view
    
    const trackBtn = document.getElementById('trackBtn');
    const pictureBtn = document.getElementById('pictureBtn');
    
    state.trackingStartTime = new Date();
    state.cleanupPhoto = null; 

    // Initial center on start
    navigator.geolocation.getCurrentPosition(pos => {
        state.map.flyTo({ 
            center: [pos.coords.longitude, pos.coords.latitude], 
            zoom: 17,
            pitch: 45
        });
    });

    // Start high-accuracy watch
    state.trackingWatcher = navigator.geolocation.watchPosition(pos => {
        const newCoord = [pos.coords.longitude, pos.coords.latitude];
        
        // Only record if the position has meaningful accuracy
        if (pos.coords.accuracy > 30) return; 

        state.routeCoordinates.push(newCoord);

        // Update the visual route line
        const routeSource = state.map.getSource('user-route');
        if (routeSource) {
            routeSource.setData({
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: state.routeCoordinates }
            });
        }

        // Update the live location dot
        const dotSource = state.map.getSource('user-location-point');
        if (dotSource) {
            dotSource.setData({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: newCoord }
            });
        }
    }, (err) => {
        console.error("GPS Watch Error:", err);
        alert("Signal lost. Check location settings.");
    }, { 
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
    });

    trackBtn.textContent = '🛑 Stop Tracking';
    trackBtn.classList.add('tracking');
    if (pictureBtn) pictureBtn.disabled = false;
}

/* ==========================================================================
   3. ITEM LOGGING (Camera & Markers)
   ========================================================================== */

/**
 * Handles photo selection, compression, and pinning.
 */
export async function handlePhoto(event) {
    const pictureBtn = document.getElementById('pictureBtn');
    const originalContent = pictureBtn.innerHTML;
    
    if (!event.target.files || event.target.files.length === 0) {
        event.target.value = '';
        return;
    }

    const file = event.target.files[0];
    pictureBtn.innerHTML = '...';
    pictureBtn.disabled = true;

    // Image Compression (Browser-side)
    const options = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true };
    let processedFile;
    
    try {
        // 'imageCompression' is loaded via CDN in maptest.html
        processedFile = await imageCompression(file, options);
    } catch (error) {
        console.error("Compression Failure:", error);
        processedFile = file; // Fallback to raw if library fails
    }

    // Tag current location to the photo
    navigator.geolocation.getCurrentPosition(async (position) => {
        const coords = [position.coords.longitude, position.coords.latitude];
        const timestamp = Date.now();
        const pinId = `pin-${timestamp}`;
        let pinInfo;

        if (state.currentUser) {
            // LOGGED IN: Upload to Firebase Storage
            try {
                const storagePath = `pins/${state.currentUser.uid}/${timestamp}-${processedFile.name}`;
                const storageRef = ref(storage, storagePath);
                const snapshot = await uploadBytes(storageRef, processedFile);
                const downloadURL = await getDownloadURL(snapshot.ref);

                pinInfo = { 
                    id: pinId, 
                    coords: coords, 
                    imageURL: downloadURL, 
                    title: `Item #${state.photoPins.length + 1}`, 
                    category: 'Other',
                    timestamp: timestamp
                };
            } catch (err) {
                console.error("Storage Error:", err);
                alert("Cloud sync failed. Photo not saved.");
            }
        } else {
            // GUEST: Local Base64 storage
            pinInfo = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.readAsDataURL(processedFile);
                reader.onload = e => resolve({ 
                    id: pinId, 
                    coords: coords, 
                    image: e.target.result, 
                    title: `Guest Pin #${state.photoPins.length + 1}`, 
                    category: 'Other' 
                });
            });
        }

        if (pinInfo) {
            state.photoPins.push(pinInfo);
            const marker = createAndAddMarker(pinInfo, 'user');
            marker.togglePopup(); // Auto-open for editing title/category
            updateUserPinsSource();
        }

        // Reset Button UI
        pictureBtn.innerHTML = originalContent;
        pictureBtn.disabled = false;
        event.target.value = '';

    }, () => {
        alert("Location required to pin items.");
        pictureBtn.innerHTML = originalContent;
        pictureBtn.disabled = false;
        event.target.value = '';
    }, { enableHighAccuracy: true });
}

/* ==========================================================================
   4. MISSION SUMMARY & SHARING
   ========================================================================== */

/**
 * Calculates final stats and triggers the summary modal.
 */
function showCleanupSummary() {
    if (!state.trackingStartTime) return;

    const durationMs = new Date() - state.trackingStartTime;
    const minutes = Math.floor(durationMs / 60000);
    const seconds = ((durationMs % 60000) / 1000).toFixed(0);

    // PHASE 2 FIX: Pull unified miles from utils.js
    const distanceMiles = calculateRouteDistance(state.routeCoordinates);
    const pinsCount = state.photoPins.length;

    // Populate static HTML IDs from Phase 1 Sync
    const distEl = document.getElementById('summaryDistance');
    const pinsEl = document.getElementById('summaryPins');
    const durEl = document.getElementById('summaryDuration');

    if (distEl) distEl.textContent = `${distanceMiles.toFixed(2)} mi`;
    if (pinsEl) pinsEl.textContent = pinsCount;
    if (durEl) durEl.textContent = `${minutes}m ${seconds}s`;

    // PHASE 5.2 SYNC: Trigger Challenge Logic using the consolidated collection
    if (state.currentUser) {
        updateUserChallenges(state.currentUser.uid, distanceMiles, pinsCount);
    }

    document.getElementById('summaryModal').style.display = 'flex';
    state.trackingStartTime = null; 
}

/**
 * Web Share API integration for mission results.
 */
export async function shareCleanupResults() {
    const distance = document.getElementById('summaryDistance')?.textContent || "0.00 mi";
    const pins = document.getElementById('summaryPins')?.textContent || "0";
    
    const shareText = `MISSION COMPLETE: I just cleaned up ${distance} and logged ${pins} items with Litter Troopers! #LitterTroopers`;

    const shareData = {
        title: 'Litter Troopers Mission Recap',
        text: shareText,
        url: 'https://littertroopers.github.io/app/' 
    };

    if (navigator.share) {
        try {
            await navigator.share(shareData);
        } catch (err) {
            console.warn('Sharing cancelled:', err);
        }
    } else {
        try {
            await navigator.clipboard.writeText(shareText);
            alert("Recap text copied to clipboard!");
        } catch (err) {
            alert("Sharing not supported on this device.");
        }
    }
}

/* ==========================================================================
   5. BACKEND UPDATES (Phase 5: Consolidated Collections)
   ========================================================================== */

/**
 * PHASE 5.2: Updates active quests in the MASTER dossier (publicProfiles).
 * Standardized to check distance (miles) or count (pins).
 */
export async function updateUserChallenges(userId, sessionMiles, sessionPins) {
    try {
        // Always point to publicProfiles for Phase 5 consistency
        const userRef = doc(db, "publicProfiles", userId);
        const userSnap = await getDoc(userRef);
        
        if (!userSnap.exists()) return;

        const data = userSnap.data();
        const activeQuests = data.active_quests || {};
        let updatesMade = false;

        // Atomic update of global stats using 'increment'
        await updateDoc(userRef, {
            totalDistance: increment(parseFloat(sessionMiles.toFixed(2))),
            totalPins: increment(sessionPins),
            totalRoutes: increment(1)
        });

        // Update specific mission progress
        for (const [chalId, quest] of Object.entries(activeQuests)) {
            if (quest.status !== 'active') continue;

            const chalRef = doc(db, "challenges", chalId);
            const chalSnap = await getDoc(chalRef);
            if (!chalSnap.exists()) continue;
            
            const rules = chalSnap.data();
            const type = rules.challengeType || 'distance';
            const goal = rules.goalValue || rules.goal_miles || 1.0;
            
            const addedProgress = (type === 'count') ? sessionPins : sessionMiles;
            const currentProgress = quest.progress || 0;
            const newProgress = parseFloat((currentProgress + addedProgress).toFixed(2));

            quest.progress = newProgress;
            updatesMade = true;

            if (newProgress >= goal) {
                quest.status = 'completed';
                quest.completed_at = serverTimestamp();
                
                // Award Badge via community logic
                const comm = await import('./community.js');
                comm.awardBadge(userId, rules.title, "Objective Secured!", rules.badge_icon || "🏆");
            }
        }

        if (updatesMade) {
            await updateDoc(userRef, { active_quests: activeQuests });
        }

    } catch (error) {
        console.error("Dossier Update Failure:", error);
    }
}
