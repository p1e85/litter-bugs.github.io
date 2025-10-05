import { storage, ref, uploadBytes, getDownloadURL } from './firebase.js';
import { state } from './config.js';
import { createAndAddMarker, updateUserPinsSource } from './map.js';
import { calculateRouteDistance } from './utils.js';
import { clearCurrentSession } from './data.js';


// NOTE: This imports the image-compression library from a CDN.
// For a production app, you might want to host this file yourself.
// This is a stable link from the unpkg CDN
//import imageCompression from  'https://cdn.jsdelivr.net/npm/browser-image-compression@2.0.2/dist/browser-image-compression.esm.js';
//import imageCompression from 'https://cdn.jsdelivr.net/npm/browser-image-compression@latest/dist/browser-image-compression.js';

/**
 * Finds the user's current location and places a one-time marker on the map.
 */
export function findMe() {
    if (state.findMeMarker) {
        state.findMeMarker.remove();
    }
    navigator.geolocation.getCurrentPosition(position => {
        const { latitude, longitude } = position.coords;
        state.findMeMarker = new mapboxgl.Marker().setLngLat([longitude, latitude]).addTo(state.map);
        state.map.flyTo({ center: [longitude, latitude], zoom: 15 });
    }, () => {
        alert("Could not get your location.");
    }, { enableHighAccuracy: true });
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

    // --- ADD THESE TWO LINES ---
    console.log('1. File object being sent to compressor:', file);
    console.log('2. The imported imageCompression library is:', imageCompression);
    // -------------------------
    
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

/**
 * Shares the cleanup results using the Web Share API or copies to clipboard.
 */
export async function shareCleanupResults() {
    const distance = document.getElementById('summaryDistance').textContent;
    const pins = document.getElementById('summaryPins').textContent;
    const shareText = `I just cleaned up ${distance} and pinned ${pins} items with the Litter Bugs app! Join the movement and help clean our planet. #LitterBugs #Cleanup`;
    const shareData = {
        title: 'My Litter Bugs Cleanup!',
        text: shareText,
        url: 'https://www.litter-bugs.com/' // Replace with your actual app URL
    };

    if (navigator.share) {
        try {
            await navigator.share(shareData);
            console.log('Cleanup shared successfully!');
        } catch (err) {
            console.error('Error sharing:', err);
        }
    } else {
        // Fallback for browsers that don't support Web Share API
        try {
            await navigator.clipboard.writeText(shareText + " " + shareData.url);
            alert('Cleanup stats copied to clipboard!');
        } catch (err) {
            console.error('Failed to copy: ', err);
            alert('Sharing is not supported on this browser.');
        }
    }
}
