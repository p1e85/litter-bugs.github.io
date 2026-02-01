import { state, mapStyles, ZOOM_THRESHOLD } from './config.js';
import { fetchAndDisplayCommunityRoutes, setupPoiClickListeners} from './community.js';
import { pinCategories, RP_SECTORS } from './config.js';
import { showPublicProfile } from './ui.js';

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

    });
    document.getElementById('geocoder-container').appendChild(geocoder.onAdd(state.map));

    const searchInput = document.querySelector('#geocoder-container .mapboxgl-ctrl-geocoder--input');

    // This code makes the input readonly initially, then removes that attribute
    // as soon as the user focuses on it (by clicking or tabbing).
    if (searchInput) {
        searchInput.setAttribute('readonly', 'readonly');
        searchInput.onfocus = () => {
            searchInput.removeAttribute('readonly');
        };
    }

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
    //el.style.display = state.map.getZoom() >= ZOOM_THRESHOLD ? 'block' : 'none';

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

    // --- HTML for User's Own Pin (Editable) ---
    if (type === 'user') {
        const mainCategories = Object.keys(pinCategories);
        let mainOptionsHTML = mainCategories.map(cat =>
            `<option value="${cat}" ${pinInfo.category === cat ? 'selected' : ''}>${cat}</option>`
        ).join('');

        // Determine initial sub-categories based on saved data or default
        const currentCategory = pinInfo.category && pinCategories[pinInfo.category] ? pinInfo.category : 'Other';
        let subOptionsHTML = pinCategories[currentCategory].map(subCat =>
            `<option value="${subCat}" ${pinInfo.subCategory === subCat ? 'selected' : ''}>${subCat}</option>`
        ).join('');

        popupHTML = `
            <div>
                <img src="${pinInfo.imageURL || pinInfo.image}" alt="User photo" style="width:100%; height:auto; border-radius: 4px;"/>
                <div class="pin-popup-form">
                    <input type="text" id="title-${pinInfo.id}" value="${pinInfo.title || ''}" placeholder="Enter a title">

                    <label for="category-${pinInfo.id}">Category:</label>
                    <select id="category-${pinInfo.id}">${mainOptionsHTML}</select>

                    <label for="subCategory-${pinInfo.id}">Sub-Category:</label>
                    <select id="subCategory-${pinInfo.id}">${subOptionsHTML}</select>

                    <label for="brand-${pinInfo.id}">Brand (Optional):</label>
                    <input type="text" id="brand-${pinInfo.id}" value="${pinInfo.brand || ''}" placeholder="e.g., Coca-Cola">

                    <div style="display: flex; justify-content: space-between; gap: 10px; margin-top: 10px;">
                        <button id="update-${pinInfo.id}" class="modal-button btn-primary">Update</button>
                        <button id="delete-${pinInfo.id}" class="modal-button btn-danger">Delete</button>
                    </div>
                </div>
            </div>`;

    // --- HTML for Community Pin (Read-only) ---
    } else {
        popupHTML = `
            <div>
                <img src="${pinInfo.thumbnailURL || pinInfo.imageURL}" alt="${pinInfo.title}" style="width:100%; border-radius: 4px;"/>
                <p style="margin: 5px 0 0;"><strong>${pinInfo.title || 'Untitled Pin'}</strong></p>
                <p style="margin: 5px 0 0; font-style: italic; color: #555;">
                    Category: ${pinInfo.category || 'N/A'} ${pinInfo.subCategory ? `(${pinInfo.subCategory})` : ''}
                </p>
                ${pinInfo.brand ? `<p style="margin: 5px 0 0; font-style: italic; color: #555;">Brand: ${pinInfo.brand}</p>` : ''}
                <small>By: <a href="#" class="profile-link" data-userid="${routeInfo.userId}">${routeInfo.username || 'A user'}</a></small>
            </div>
        `;
    }

    // --- Create Popup and Add Event Listeners ---
    const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(popupHTML);

    popup.on('open', () => {
        // --- Logic for User's Own Pin ---
        if (type === 'user') {
            const categorySelect = document.getElementById(`category-${pinInfo.id}`);
            const subCategorySelect = document.getElementById(`subCategory-${pinInfo.id}`);

            // Update sub-category dropdown when main category changes
            categorySelect?.addEventListener('change', (e) => {
                const selectedCategory = e.target.value;
                const subCategories = pinCategories[selectedCategory] || [];
                subCategorySelect.innerHTML = subCategories.map(subCat =>
                    `<option value="${subCat}">${subCat}</option>`
                ).join('');
            });

            // "Update" button listener
            document.getElementById(`update-${pinInfo.id}`)?.addEventListener('click', () => {
                const pin = state.photoPins.find(p => p.id === pinInfo.id);
                if (pin) {
                    pin.title = document.getElementById(`title-${pinInfo.id}`).value;
                    pin.category = categorySelect.value;
                    pin.subCategory = subCategorySelect.value;
                    pin.brand = document.getElementById(`brand-${pinInfo.id}`).value;
                }
                popup.remove();
                alert("Pin updated! Remember to save your session.");
            });

            // "Delete" button listener
            document.getElementById(`delete-${pinInfo.id}`)?.addEventListener('click', () => {
                if (confirm("Are you sure?")) {
                    // Filter out the deleted pin from the state
                    state.photoPins = state.photoPins.filter(p => p.id !== pinInfo.id);
                    // Find and remove the corresponding marker from the map and state
                    const markerToRemove = state.userMarkers.find(m => {
                        const lngLat = m.getLngLat();
                        const markerCoords = [lngLat.lng, lngLat.lat];
                        const pinCoords = Array.isArray(pinInfo.coords) ? pinInfo.coords : [pinInfo.coords.lng, pinInfo.coords.lat];
                        return markerCoords[0] === pinCoords[0] && markerCoords[1] === pinCoords[1];
                    });
                    if (markerToRemove) {
                        markerToRemove.remove();
                        state.userMarkers = state.userMarkers.filter(m => m !== markerToRemove);
                    }
                    // Update the underlying map source if it exists
                    if (typeof updateUserPinsSource === 'function') { updateUserPinsSource(); }
                    popup.remove();
                }
            });

            // Blur the first input to prevent auto keyboard on mobile
            document.getElementById(`title-${pinInfo.id}`)?.blur();

        // --- Logic for Community Pin ---
        } else {
            // Add click listener for the profile link
            popup.getElement().querySelector(`.profile-link[data-userid="${routeInfo.userId}"]`)?.addEventListener('click', (e) => {
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

export function addSectorLayers() {
    Object.entries(RP_SECTORS).forEach(([id, bounds]) => {
        const sourceId = `source-${id}`;
        
        state.map.addSource(sourceId, {
            'type': 'geojson',
            'data': {
                'type': 'Feature',
                'geometry': {
                    'type': 'Polygon',
                    'coordinates': [[
                        [bounds.minLon, bounds.minLat],
                        [bounds.maxLon, bounds.minLat],
                        [bounds.maxLon, bounds.maxLat],
                        [bounds.minLon, bounds.maxLat],
                        [bounds.minLon, bounds.minLat]
                    ]]
                }
            }
        });

        state.map.addLayer({
            'id': `layer-${id}`,
            'type': 'fill',
            'source': sourceId,
            'layout': { 'visibility': 'none' }, // Start hidden
            'paint': {
                'fill-color': id === 'RP-01' ? '#ff0000' : id === 'RP-02' ? '#00ff00' : '#0000ff', // Different colors per sector
                'fill-opacity': 0.1,
                'fill-outline-color': '#000'
            }
        });
    });
}

export function setupSectorVisuals() {
    if (!state.map) return;

    Object.entries(RP_SECTORS).forEach(([id, sector]) => {
        const sourceId = `source-${id}`;
        const layerId = `layer-${id}`;

        let polygonCoords;

        if (sector.isPolygon) {
            // Use the custom diagonal path defined in config.js
            polygonCoords = [sector.path];
        } else {
            // Build the standard rectangular box path
            polygonCoords = [[
                [sector.minLon, sector.minLat],
                [sector.maxLon, sector.minLat],
                [sector.maxLon, sector.maxLat],
                [sector.minLon, sector.maxLat],
                [sector.minLon, sector.minLat]
            ]];
        }

        // 1. Add the Source (the geometry data)
        state.map.addSource(sourceId, {
            'type': 'geojson',
            'data': {
                'type': 'Feature',
                'geometry': {
                    'type': 'Polygon',
                    'coordinates': polygonCoords
                }
            }
        });

        // 2. Add the Fill Layer (the colored shape)
        state.map.addLayer({
            'id': layerId,
            'type': 'fill',
            'source': sourceId,
            'layout': { 'visibility': 'none' }, // Toggleable via UI
            'paint': {
                'fill-color': sector.color,
                'fill-opacity': 0.15,
                'fill-outline-color': sector.color
            }
        });

        // 3. Add a Label Layer (optional: shows the sector name)
        state.map.addLayer({
            'id': `label-${id}`,
            'type': 'symbol',
            'source': sourceId,
            'layout': {
                'text-field': id, // Displays "RP-01", "RP-05", etc.
                'text-size': 14,
                'visibility': 'none'
            },
            'paint': {
                'text-color': sector.color,
                'text-halo-color': '#ffffff',
                'text-halo-width': 2
            }
        });
    });
}
