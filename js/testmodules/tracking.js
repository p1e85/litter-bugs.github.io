
import { db, storage, ref, uploadBytes, getDownloadURL, collection, query, where, getDocs, updateDoc, doc } from './firebase.js';
import { state } from './config.js';
import { createAndAddMarker, updateUserPinsSource } from './map.js';
import { calculateRouteDistance } from './utils.js';
import { clearCurrentSession } from './data.js';

let locationWatcher = null;

/**
 * Finds the user's current location and places a one-time marker on the map.
 */
export function findMe() {
    const findMeBtn = document.getElementById('findMeBtn');

    // State 0: First click -> Center the user
    if (state.findMeState === 0) {
        navigator.geolocation.getCurrentPosition(position => {
            const coords = [position.coords.longitude, position.coords.latitude];
            state.map.flyTo({ center: coords, zoom: 16, bearing: 0, pitch: 0 });

            if (state.findMeMarker) state.findMeMarker.remove();
            state.findMeMarker = new mapboxgl.Marker().setLngLat(coords).addTo(state.map);

            findMeBtn.classList.add('active');
            state.findMeState = 1;

            if (locationWatcher) navigator.geolocation.clearWatch(locationWatcher);
            locationWatcher = navigator.geolocation.watchPosition(pos => {
                const newCoords = [pos.coords.longitude, pos.coords.latitude];
                state.findMeMarker.setLngLat(newCoords);

                if (state.findMeState === 2 && typeof pos.coords.heading === 'number' && pos.coords.heading !== null) {
                    state.map.easeTo({ bearing: pos.coords.heading });
                }
            }, null, { enableHighAccuracy: true });

        }, () => alert("Could not get your location."), { enableHighAccuracy: true });
    }
    // State 1: Second click -> Tilt and orient to heading
    else if (state.findMeState === 1) {
        state.map.easeTo({ pitch: 60, zoom: 17 });
        findMeBtn.innerHTML = '🧭'; // Change to a compass icon
        state.findMeState = 2;
    }
    // State 2: Third click -> Revert to North-up view
    else if (state.findMeState === 2) {
        state.map.easeTo({ pitch: 0, bearing: 0 });
        findMeBtn.innerHTML = '📍'; // Change back to pin icon
        state.findMeState = 1;
    }
}

/**
 * Toggles the location tracking state (on/off).
 */
export function toggleTracking() {
    const trackBtn = document.getElementById('trackBtn');
    if (state.trackingWatcher) {
        // --- Stop Tracking ---
        navigator.geolocation.clearWatch(state.trackingWatcher);
        state.trackingWatcher = null;
        trackBtn.textContent = '🛰️ Start Tracking';
        trackBtn.classList.remove('tracking');

        document.getElementById('pictureBtn').disabled = true;

        // Clear the pulsing user location dot
        if (state.map.getSource('user-location-point')) {
            state.map.getSource('user-location-point').setData({ type: 'Feature', geometry: { type: 'Point', coordinates: [] } });
        }
        showCleanupSummary();
    } else {
        // --- Start Tracking (show safety modal first) ---
        document.getElementById('safetyModal').style.display = 'flex';
    }
}

/**
 * Begins watching the user's position to draw a route.
 * This is called after the user agrees to the safety modal.
 */
export function startTracking() {
    clearCurrentSession();
    const trackBtn = document.getElementById('trackBtn');
    state.trackingStartTime = new Date();
    state.cleanupPhoto = null; 

    // Center map on user's starting location
    navigator.geolocation.getCurrentPosition(pos => {
        state.map.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 16 });
    });

    state.trackingWatcher = navigator.geolocation.watchPosition(pos => {
        const newCoord = [pos.coords.longitude, pos.coords.latitude];
        state.routeCoordinates.push(newCoord);

        // Update the route line on the map
        if (state.map.getSource('user-route')) {
            state.map.getSource('user-route').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: state.routeCoordinates } });
        }
        // Update the pulsing user location dot
        if (state.map.getSource('user-location-point')) {
            state.map.getSource('user-location-point').setData({ type: 'Feature', geometry: { type: 'Point', coordinates: newCoord } });
        }
    }, () => {
        alert("Error watching position. Please ensure location services are enabled.");
    }, { enableHighAccuracy: true });

    trackBtn.textContent = '🛑 Stop Tracking';
    trackBtn.classList.add('tracking');

    document.getElementById('pictureBtn').disabled = false;
}

/**
 * Handles the process of selecting, compressing, and pinning a photo.
 */
export async function handlePhoto(event) {
    const pictureBtn = document.getElementById('pictureBtn');
    const originalButtonText = pictureBtn.innerHTML;
    if (!event.target.files || event.target.files.length === 0) {
        event.target.value = '';
        return;
    }
    const file = event.target.files[0];

    pictureBtn.innerHTML = '...';
    pictureBtn.disabled = true;

    // Compress the image before uploading
    const options = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true };
    let processedFile;
    try {
        processedFile = await imageCompression(file, options);
    } catch (error) {
        console.error("Image compression error:", error);
        alert("Error processing image.");
        pictureBtn.innerHTML = originalButtonText;
        pictureBtn.disabled = false;
        event.target.value = '';
        return;
    }

    // Get current location to tag the photo
    navigator.geolocation.getCurrentPosition(async (position) => {
        const coords = [position.coords.longitude, position.coords.latitude];
        const defaultTitle = `Pin ${state.photoPins.length + 1}`;
        const timestamp = Date.now();
        let pinInfo;

        // --- Handle photo based on login state ---
        if (state.currentUser) {
            // Logged-in user: Upload to Firebase Storage
            try {
                const storageRef = ref(storage, `photos/${state.currentUser.uid}/${timestamp}-${processedFile.name}`);
                const snapshot = await uploadBytes(storageRef, processedFile);
                const downloadURL = await getDownloadURL(snapshot.ref);
                pinInfo = { id: `pin-${timestamp}`, coords, imageURL: downloadURL, title: defaultTitle, category: 'Other' };
            } catch (error) {
                console.error("Error uploading photo:", error);
                alert("Photo upload failed.");
            }
        } else {
            // Guest user: Store image as Base64 data URL
            pinInfo = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.readAsDataURL(processedFile);
                reader.onload = e => resolve({ id: `pin-${timestamp}`, coords, image: e.target.result, title: defaultTitle, category: 'Other' });
            });
        }

        if (pinInfo) {
            state.photoPins.push(pinInfo);
            const newMarker = createAndAddMarker(pinInfo, 'user');
            newMarker.togglePopup(); 
            updateUserPinsSource();
        }

        pictureBtn.innerHTML = originalButtonText;
        pictureBtn.disabled = false;
        event.target.value = '';
    }, () => {
        alert("Could not get location. Photo was not pinned.");
        pictureBtn.innerHTML = originalButtonText;
        pictureBtn.disabled = false;
        event.target.value = '';
    }, { enableHighAccuracy: true });
}

/**
 * Calculates and displays the summary of the completed tracking session.
 */
function showCleanupSummary() {
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

    state.trackingStartTime = null; 
}

// --- SHARE FUNCTION (Fixed for Test File) ---
export async function shareCleanupResults() {
    // 1. Gather the stats from the current session
    // SAFETY FIX: Check if arrays exist before counting length
    const countA = state.pins ? state.pins.length : 0;
    const countB = state.photoPins ? state.photoPins.length : 0;
    
    const pinCount = countA + countB; // Total items
    const dist = (state.totalDistance || 0).toFixed(2);
    
    // 2. Create the message
    const shareData = {
        title: 'Litter Troopers Cleanup',
        text: `I just cleaned up ${pinCount} pieces of litter over ${dist} miles with Litter Troopers! 🌍💪 #LitterTroopers`,
        url: 'http://www.littertroopers.com/mapbeta.html' 
    };

    // 3. Trigger the Native Share Sheet
    try {
        if (navigator.share) {
            await navigator.share(shareData);
            console.log('Content shared successfully');
        } else {
            // Fallback for desktop or unsupported browsers
            await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
            alert('Share text copied to clipboard!');
        }
    } catch (err) {
        console.error('Error sharing:', err);
    }
}

export function resetFindMeState() {
    if (locationWatcher) {
        navigator.geolocation.clearWatch(locationWatcher);
        locationWatcher = null;
    }
    if (state.findMeMarker) {
        state.findMeMarker.remove();
        state.findMeMarker = null;
    }
    document.getElementById('findMeBtn').classList.remove('active');
    document.getElementById('findMeBtn').innerHTML = '📍';
    state.findMeState = 0;
}

/**
 * Updates the user's active challenges based on the session data.
 * NEW: Handles 'count' challenges and Badge Awarding
 */
export async function updateUserChallenges(userId, sessionDistance, itemsCollected) {
    try {
        // 1. Get all active challenges for this user
        const q = query(
            collection(db, "activeChallenges"), 
            where("userId", "==", userId),
            where("status", "==", "active")
        );
        
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) return;

        // 2. Loop through them and update progress
        const updates = [];
        
        // Dynamically import community to award badges (avoids circular dependency)
        let communityModule = null;

        for (const docSnap of querySnapshot.docs) {
            const data = docSnap.data();
            let newProgress = data.progress;
            
            // --- LOGIC SWITCH: Check Type ---
            if (data.type === 'distance') {
                newProgress += sessionDistance;
            } else if (data.type === 'count') {
                const itemsToAdd = itemsCollected || 0; 
                newProgress += itemsToAdd;
            }
            
            // 3. Check for Completion
            let newStatus = data.status;
            if (newProgress >= data.goal) {
                newStatus = 'completed';
                newProgress = data.goal; // Cap it
                
                // --- AWARD BADGE ---
                try {
                    if (!communityModule) communityModule = await import('./community.js');
                    const icon = data.type === 'distance' ? '🏃' : '🗑️';
                    
                    await communityModule.awardBadge(
                        userId, 
                        data.title, 
                        `Completed the ${data.title} challenge.`,
                        icon
                    );
                } catch (e) { console.error("Badge Error:", e); }
            }
            
            // Prepare the update
            updates.push(updateDoc(doc(db, "activeChallenges", docSnap.id), {
                progress: newProgress,
                status: newStatus,
                lastUpdated: new Date()
            }));
        }
        
        await Promise.all(updates);
        console.log("Challenges updated successfully.");
        
    } catch (error) {
        console.error("Error updating challenges:", error);
    }
}
