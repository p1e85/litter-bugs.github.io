/**
 * A collection of reusable utility functions for data conversion and calculations.
 */

// --- DATA CONVERSION UTILITIES ---
// Translates [lng, lat] (Mapbox) to {lng: val, lat: val} (Firestore)

export function convertRouteForFirestore(coordsArray) {
    if (!coordsArray) return [];
    return coordsArray.map(coord => ({ lng: coord[0], lat: coord[1] }));
}

export function convertRouteFromFirestore(coordsData) {
    if (!coordsData || coordsData.length === 0) return [];
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

export function checkAndClearOldData() {
    const guestSessionsJSON = localStorage.getItem('guestSessions');
    if (guestSessionsJSON) {
        try {
            const guestSessions = JSON.parse(guestSessionsJSON);
            if (guestSessions.length > 0 && guestSessions[0].route && Array.isArray(guestSessions[0].route[0])) {
                alert("The app has been updated. Old local sessions cleared for compatibility.");
                localStorage.removeItem('guestSessions');
            }
        } catch (error) {
            localStorage.removeItem('guestSessions');
        }
    }
}

// --- CALCULATION UTILITIES ---

/**
 * Unified Haversine Formula
 * Calculates distance between coordinates in MILES.
 * @param {Array<Array<number>>} coordinates - [[lng, lat], [lng, lat]]
 * @returns {number} Distance in miles.
 */
export function calculateRouteDistance(coordinates) {
    if (!coordinates || coordinates.length < 2) return 0;
    
    const R = 3958.8; // Earth's radius in MILES
    let totalDistance = 0;

    for (let i = 0; i < coordinates.length - 1; i++) {
        const [lon1, lat1] = coordinates[i];
        const [lon2, lat2] = coordinates[i + 1];

        const dLat = (lat2 - lat1) * (Math.PI / 180);
        const dLon = (lon2 - lon1) * (Math.PI / 180);
        
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
                  
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        totalDistance += R * c;
    }
    return totalDistance;
}

/**
 * Gets distance between two points in MILES. Used for event proximity.
 */
export function getDistanceInMiles(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;
    const R = 3958.8; 
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
    return R * c;
}
