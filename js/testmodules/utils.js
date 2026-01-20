/**
 * A collection of reusable utility functions for data conversion and calculations.
 */

// --- DATA CONVERSION UTILITIES ---
// These functions translate data structures between what Mapbox expects ([lng, lat])
// and what is more cleanly stored in Firestore ({lng: val, lat: val}).

export function convertRouteForFirestore(coordsArray) {
    if (!coordsArray) return [];
    return coordsArray.map(coord => ({ lng: coord[0], lat: coord[1] }));
}

export function convertRouteFromFirestore(coordsData) {
    if (!coordsData || coordsData.length === 0) return [];
    // Handles older data format for backward compatibility
    if (Array.isArray(coordsData[0])) {
        return coordsData;
    }
    return coordsData.map(coord => [coord.lng, coord.lat]);
}

export function convertPinsForFirestore(pinsArray) {
    if (!pinsArray) return [];
    return pinsArray.map(pin => {
        const newPin = { ...pin };
        if (Array.isArray(newPin.coords)) {
            newPin.coords = { lng: newPin.coords[0], lat: newPin.coords[1] };
        }
        return newPin;
    });
}

export function convertPinsFromFirestore(pinsData) {
    if (!pinsData || pinsData.length === 0) return [];
    return pinsData.map(pin => {
        const newPin = { ...pin };
        if (newPin.coords && typeof newPin.coords === 'object' && !Array.isArray(newPin.coords)) {
            newPin.coords = [newPin.coords.lng, newPin.coords.lat];
        }
        return newPin;
    });
}

// --- DATA MIGRATION ---

/**
 * Checks for an old, incompatible data format in local storage and clears it.
 */
export function checkAndClearOldData() {
    const guestSessionsJSON = localStorage.getItem('guestSessions');
    if (guestSessionsJSON) {
        try {
            const guestSessions = JSON.parse(guestSessionsJSON);
            if (guestSessions.length > 0 && guestSessions[0].route && Array.isArray(guestSessions[0].route[0])) {
                alert("The app has been updated. Your old locally saved sessions are no longer compatible and will be cleared.");
                localStorage.removeItem('guestSessions');
            }
        } catch (error) {
            console.error("Error parsing old guest sessions, clearing data.", error);
            localStorage.removeItem('guestSessions');
        }
    }
}

// --- CALCULATION UTILITIES ---

/**
 * Calculates the total distance of a route in meters using the Haversine formula.
 * @param {Array<Array<number>>} coordinates - An array of [lng, lat] coordinates.
 * @returns {number} The total distance in meters.
 */
export function calculateRouteDistance(coordinates) {
    let totalDistance = 0;
    if (coordinates.length < 2) return 0;

    for (let i = 0; i < coordinates.length - 1; i++) {
        const p1 = { lat: coordinates[i][1], lng: coordinates[i][0] };
        const p2 = { lat: coordinates[i + 1][1], lng: coordinates[i + 1][0] };
        const R = 6371e3; // Earth's radius in meters
        const φ1 = p1.lat * Math.PI / 180;
        const φ2 = p2.lat * Math.PI / 180;
        const Δφ = (p2.lat - p1.lat) * Math.PI / 180;
        const Δλ = (p2.lng - p1.lng) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        totalDistance += R * c; // Distance in meters
    }
    return totalDistance;
}
