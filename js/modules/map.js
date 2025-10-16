import { state, mapStyles, ZOOM_THRESHOLD } from './config.js';
import { fetchAndDisplayCommunityRoutes, setupPoiClickListeners, showPublicProfile } from './community.js';

/**
 * Initializes the Mapbox map, geocoder, and initial event listeners.
 */
export function initializeMap() {
    mapboxgl.accessToken = 'pk.eyJ1IjoicDFjcmVhdGlvbnMiLCJhIjoiY2p6ajZvejJmMDZhaTNkcWpiN294dm12eCJ9.8ckNT6kfuJry7K7GAeIuxw';
    state.map = new mapboxgl.Map({
        container: 'map',
        style: mapStyles[state.currentStyleIndex].url,
        center: [-87.6298, 41.8781], // Default center
        zoom: 10
    });

    const geocoder = new MapboxGeocoder({
        accessToken: mapboxgl.accessToken,
        mapboxgl: mapboxgl,
        marker: false,
        placeholder: 'Search for a place',
        autocomplete: false,
        proximity: 'ip', // Prioritize results near the user's IP address
        types: 'country,region,place,postcode,locality,neighborhood,address,poi' // Expand search to include POIs

        // for chicago search only if want to implement
        //bbox: [-87.9401, 41.6445, -87.5241, 42.0231], // Chicago Bounding Box
        //proximity: { // Proximity is now set to a point inside Chicago
        //    longitude: -87.6298,
        //    latitude: 41.8781
        //}
    });
    document.getElementById('geocoder-container').appendChild(geocoder.onAdd(state.map));

    state.map.on('load', () => {
        initializeMapLayers();
        setupPoiClickListeners(); // From community.js
    });

    state.map.on('zoom', toggleMarkerVisibility);
}

/**
 * Sets up the initial GeoJSON sources and layers for routes and pins.
 */
// In js/modules/map.js

function initializeMapLayers() {
  // --- User-Specific Layers ---

  // User's route line
  if (!state.map.getSource('user-route')) {
    state.map.addSource('user-route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } } });
  }
  if (!state.map.getLayer('user-route')) {
    state.map.addLayer({
      id: 'user-route',
      type: 'line',
      source: 'user-route',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#4A7C59', 'line-width': 5 }
    });
  }

  // User's current location dot
  if (!state.map.getSource('user-location-point')) {
    state.map.addSource('user-location-point', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Point', 'coordinates': [] } } });
  }
  if (!state.map.getLayer('user-location-pulse')) {
    state.map.addLayer({ id: 'user-location-pulse', type: 'circle', source: 'user-location-point', paint: { 'circle-radius': 15, 'circle-color': '#4A7C59', 'circle-opacity': 0.2 } });
  }
  if (!state.map.getLayer('user-location-dot')) {
    state.map.addLayer({ id: 'user-location-dot', type: 'circle', source: 'user-location-point', paint: { 'circle-radius': 6, 'circle-color': '#fff', 'circle-stroke-width': 2, 'circle-stroke-color': '#4A7C59' } });
  }
}

/**
 * Cycles to the next map style and re-initializes layers and data.
 */
export function changeMapStyle() {
    state.currentStyleIndex = (state.currentStyleIndex + 1) % mapStyles.length;
    state.map.setStyle(mapStyles[state.currentStyleIndex].url);
    state.map.once('style.load', () => {
        initializeMapLayers();
        state.userMarkers.forEach(marker => marker.addTo(state.map));
        state.communityMarkers.forEach(marker => marker.addTo(state.map));
        toggleMarkerVisibility();
        if (state.isCommunityViewOn) {
            fetchAndDisplayCommunityRoutes();
        }
        updateUserPinsSource();
    });
}

/**
 * Shows or hides photo markers based on the map's zoom level.
 */
function toggleMarkerVisibility() {
    const display = state.map.getZoom() >= ZOOM_THRESHOLD ? 'block' : 'none';
    state.userMarkers.forEach(marker => marker.getElement().style.display = display);
    state.communityMarkers.forEach(marker => marker.getElement().style.display = display);
}

/**
 * Creates a photo marker with a popup and adds it to the map.
 * @param {object} pinInfo - The data for the pin.
 * @param {string} type - 'user' or 'community'.
 * @param {object} routeInfo - Additional data for community pins.
 * @returns {mapboxgl.Marker} The created marker instance.
 */
export function createAndAddMarker(pinInfo, type, routeInfo = {}) {
    const el = document.createElement('div');
    el.className = 'photo-marker';
    //el.style.backgroundImage = `url(${pinInfo.imageURL || pinInfo.image})`;
    el.style.backgroundImage = `url(${pinInfo.thumbnailURL || pinInfo.imageURL || pinInfo.image})`;
    el.style.display = state.map.getZoom() >= ZOOM_THRESHOLD ? 'block' : 'none';

    const popup = createPinPopup(pinInfo, type, routeInfo);
    const marker = new mapboxgl.Marker(el).setLngLat(pinInfo.coords).setPopup(popup).addTo(state.map);

    if (type === 'user') {
        state.userMarkers.push(marker);
    } else {
        el.style.borderColor = '#28a745'; // Community marker color
        state.communityMarkers.push(marker);
    }
    return marker;
}

/**
 * Creates a Mapbox popup with appropriate controls for a given pin.
 */
function createPinPopup(pinInfo, type, routeInfo = {}) {
    let popupHTML;
    if (type === 'user') {
        const categories = ['Plastic', 'Glass', 'Metal', 'Paper', 'Other'];
        const optionsHTML = categories.map(cat => `<option value="${cat}" ${pinInfo.category === cat ? 'selected' : ''}>${cat}</option>`).join('');
        popupHTML = `<div><img src="${pinInfo.imageURL || pinInfo.image}" alt="User photo" style="width:100%; height:auto; border-radius: 4px;"/><div class="pin-popup-form"><input type="text" id="title-${pinInfo.id}" value="${pinInfo.title}" placeholder="Enter a title"><select id="category-${pinInfo.id}">${optionsHTML}</select><div style="display: flex; justify-content: space-between; gap: 10px;"><button id="update-${pinInfo.id}" style="flex-grow: 1;">Update</button><button id="delete-${pinInfo.id}" style="background-color: #dc3545;">Delete</button></div></div></div>`;
    } else {
            popupHTML = `... <button id="update-${pinInfo.id}" class="modal-button">Update</button><button id="delete-${pinInfo.id}" class="modal-button delete-account-button">Delete</button> ...`;    }

    const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(popupHTML);

    popup.on('open', () => {
        if (type === 'user') {
            document.getElementById(`update-${pinInfo.id}`)?.addEventListener('click', () => {
                const pin = state.photoPins.find(p => p.id === pinInfo.id);
                if (pin) {
                    pin.title = document.getElementById(`title-${pinInfo.id}`).value;
                    pin.category = document.getElementById(`category-${pinInfo.id}`).value;
                }
                popup.remove();
                alert("Pin updated! Remember to save your session.");
            });
            document.getElementById(`delete-${pinInfo.id}`)?.addEventListener('click', () => {
                if (confirm("Are you sure?")) {
                    state.photoPins = state.photoPins.filter(p => p.id !== pinInfo.id);
                    const markerToRemove = state.userMarkers.find(m => {
                        const lngLat = m.getLngLat();
                        return lngLat.lng === pinInfo.coords[0] && lngLat.lat === pinInfo.coords[1];
                    });
                    if (markerToRemove) {
                        markerToRemove.remove();
                        state.userMarkers = state.userMarkers.filter(m => m !== markerToRemove);
                    }
                    updateUserPinsSource();
                    popup.remove();
                }
            });
        } else {
            document.querySelector(`.profile-link[data-userid="${routeInfo.userId}"]`)?.addEventListener('click', (e) => {
                e.preventDefault();
                showPublicProfile(routeInfo.userId);
            });
        }
    });
    return popup;
}

/**
 * Updates the 'user-pins-source' GeoJSON with the current pins.
 */
export function updateUserPinsSource() {
    const features = state.photoPins.map(pin => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: pin.coords },
        properties: {}
    }));
    if (state.map && state.map.getSource('user-pins-source')) {
        state.map.getSource('user-pins-source').setData({ type: 'FeatureCollection', features });
    }
}

/**
 * Fits the map view to the bounds of the current route and pins.
 */
export function centerOnRoute() {
    if (state.routeCoordinates.length < 1 && state.photoPins.length < 1) {
        alert("No route is currently loaded to center on.");
        return;
    }
    const bounds = new mapboxgl.LngLatBounds();
    state.routeCoordinates.forEach(coord => bounds.extend(coord));
    state.photoPins.forEach(pin => bounds.extend(pin.coords));

    state.map.fitBounds(bounds, {
        padding: { top: 150, bottom: 150, left: 60, right: 60 },
        maxZoom: 16
    });
}
