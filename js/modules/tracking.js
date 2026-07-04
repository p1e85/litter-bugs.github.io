import { db, storage, ref, uploadBytes, getDownloadURL, collection, addDoc, serverTimestamp, doc, getDoc } from './firebase.js';
import { state, pinCategories } from './config.js';
import { createAndAddMarker, updateUserPinsSource } from './map.js';
import { calculateRouteDistance } from './utils.js';
import { clearCurrentSession } from './data.js';

let locationWatcher = null;

// NOTE: imageCompression is loaded as a global from a CDN <script> tag in the HTML,
// not as an ES module import. Reference it directly as `imageCompression(...)`.

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
    // State 2: Third click -> Fully turn off Find Me
    else if (state.findMeState === 2) {
        state.map.easeTo({ pitch: 0, bearing: 0 });
        resetFindMeState();
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
            newMarker.togglePopup(); // Open popup immediately
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

    state.trackingStartTime = null; // Reset for next session
}

// --- SHARE FUNCTION (Text Only) ---
export async function shareCleanupResults() {
    // 1. Gather the real stats from current session state
    const pinCount = state.photoPins ? state.photoPins.length : 0;
    const distanceMeters = state.routeCoordinates ? calculateRouteDistance(state.routeCoordinates) : 0;
    const dist = (distanceMeters * 0.000621371).toFixed(2); // meters -> miles

    // 2. Create the message
    const shareData = {
        title: 'Litter Troopers Cleanup',
        text: `I just cleaned up ${pinCount} pieces of litter over ${dist} miles with Litter Troopers! 🌍💪 #LitterTroopers`,
        url: 'https://www.littertroopers.com'
    };

    // 3. Trigger the Native Share Sheet
    try {
        if (navigator.share) {
            await navigator.share(shareData);
        } else {
            // Fallback for desktop or unsupported browsers
            await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
            alert('Share text copied to clipboard!');
        }
    } catch (err) {
        // AbortError fires when user cancels native share sheet - ignore it
        if (err.name !== 'AbortError') {
            console.error('Error sharing:', err);
        }
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

// =============================================================================
// QUICK PIN FEATURE (production / modules version — uses alert instead of toast)
// =============================================================================

let _qp = null;

function getGPSWithTimeout(ms) {
    return new Promise((resolve) => {
        let done = false;
        const timer = setTimeout(() => {
            if (!done) { done = true; resolve(null); }
        }, ms);
        navigator.geolocation.getCurrentPosition(
            (pos) => { if (!done) { done = true; clearTimeout(timer); resolve(pos.coords); } },
            ()     => { if (!done) { done = true; clearTimeout(timer); resolve(null); } },
            { timeout: ms, maximumAge: 10000, enableHighAccuracy: true }
        );
    });
}

async function uploadQuickPinPhoto(file) {
    const timestamp = Date.now();
    const uid = state.currentUser.uid;
    const fullOpts = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true };
    const compressed = await imageCompression(file, fullOpts);
    const fullRef = ref(storage, `photos/${uid}/${timestamp}-full.jpg`);
    const fullSnap = await uploadBytes(fullRef, compressed);
    const imageURL = await getDownloadURL(fullSnap.ref);
    const thumbOpts = { maxSizeMB: 0.05, maxWidthOrHeight: 100, useWebWorker: true };
    const thumb = await imageCompression(file, thumbOpts);
    const thumbRef = ref(storage, `photos/${uid}/${timestamp}-thumb.jpg`);
    const thumbSnap = await uploadBytes(thumbRef, thumb);
    const thumbnailURL = await getDownloadURL(thumbSnap.ref);
    return { imageURL, thumbnailURL };
}

function populateQuickPinCategories() {
    const catSelect = document.getElementById('quickPinCategory');
    const subWrap   = document.getElementById('quickPinSubcategoryWrap');
    const subSelect = document.getElementById('quickPinSubcategory');
    if (!catSelect) return;
    catSelect.innerHTML = '';
    for (const cat in pinCategories) {
        const opt = document.createElement('option');
        opt.value = cat; opt.textContent = cat;
        catSelect.appendChild(opt);
    }
    const syncSubs = () => {
        const subs = pinCategories[catSelect.value] || [];
        if (subs.length > 0) {
            subSelect.innerHTML = subs.map(s => `<option value="${s}">${s}</option>`).join('');
            subWrap.style.display = 'block';
        } else { subWrap.style.display = 'none'; }
    };
    catSelect.addEventListener('change', syncSubs);
    syncSubs();
}

function openQuickPinModal(previewURL) {
    const modal = document.getElementById('quickPinModal');
    if (!modal) return;
    document.getElementById('quickPinPreview').src = previewURL;
    document.getElementById('quickPinTitle').value = '';
    document.getElementById('quickPinUploadStatus').style.display = 'block';
    document.getElementById('quickPinSaveBtn').disabled = true;
    populateQuickPinCategories();
    modal.style.display = 'flex';
}

function quickPinUploadReady() {
    document.getElementById('quickPinUploadStatus').style.display = 'none';
    document.getElementById('quickPinSaveBtn').disabled = false;
}

export async function handleQuickPinPhoto(event) {
    const file = event.target.files && event.target.files[0];
    if (!file || !state.currentUser) { if (event.target) event.target.value = ''; return; }
    event.target.value = '';
    const pictureBtn = document.getElementById('pictureBtn');
    pictureBtn.innerHTML = '⏳';
    pictureBtn.disabled = true;
    const gpsPromise = getGPSWithTimeout(3000);
    const previewURL = URL.createObjectURL(file);
    const coords = await gpsPromise;
    if (!coords) {
        URL.revokeObjectURL(previewURL);
        pictureBtn.innerHTML = '📸';
        pictureBtn.disabled = false;
        return; // fail silently per spec
    }
    _qp = { previewURL, coords, file, imageURL: null, thumbnailURL: null };
    openQuickPinModal(previewURL);
    pictureBtn.innerHTML = '📸';
    pictureBtn.disabled = false;
    try {
        const { imageURL, thumbnailURL } = await uploadQuickPinPhoto(file);
        _qp.imageURL = imageURL;
        _qp.thumbnailURL = thumbnailURL;
        quickPinUploadReady();
    } catch (err) {
        console.error('Quick pin upload failed:', err);
        cancelQuickPin();
        alert('Upload failed. Please try again.');
    }
}

export async function saveQuickPin() {
    if (!_qp || !_qp.imageURL || !state.currentUser) return;
    const saveBtn = document.getElementById('quickPinSaveBtn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳ Saving…'; }
    try {
        const profileSnap = await getDoc(doc(db, 'publicProfiles', state.currentUser.uid));
        const username = profileSnap.exists() ? (profileSnap.data().username || 'Anonymous') : 'Anonymous';
        const title    = (document.getElementById('quickPinTitle')?.value || '').trim() || 'Quick Pin';
        const category = document.getElementById('quickPinCategory')?.value || 'Other';
        const subCat   = document.getElementById('quickPinSubcategory')?.value || null;
        await addDoc(collection(db, 'publishedRoutes'), {
            userId:    state.currentUser.uid,
            username,
            timestamp: serverTimestamp(),
            route:     [],
            isQuickPin: true,
            pins: [{
                id:           'pin-' + Date.now(),
                lat:          _qp.coords.latitude,
                lng:          _qp.coords.longitude,
                imageURL:     _qp.imageURL,
                thumbnailURL: _qp.thumbnailURL,
                title,
                category,
                ...(subCat ? { subCategory: subCat } : {})
            }]
        });
        alert('⚡ Quick pin saved!');
        cancelQuickPin();
    } catch (err) {
        console.error('saveQuickPin failed:', err);
        alert('Could not save pin: ' + (err.message || err));
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Pin'; }
    }
}

export function cancelQuickPin() {
    const modal = document.getElementById('quickPinModal');
    if (modal) modal.style.display = 'none';
    if (_qp && _qp.previewURL) URL.revokeObjectURL(_qp.previewURL);
    _qp = null;
}
