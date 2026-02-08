import { state, mapStyles, ZOOM_THRESHOLD } from './config.js';
import { fetchAndDisplayCommunityRoutes, setupPoiClickListeners, updateSwarmPulse } from './community.js';
import { pinCategories, RP_SECTORS } from './config.js';
import { showPublicProfile } from './ui.js';

/**
 * Initializes the Mapbox map, geocoder, and initial event listeners.
 */
export function initializeMap() {
    mapboxgl.accessToken = 'pk.eyJ1IjoicDFjcmVhdGlvbnMiLCJhIjoiY2p6ajZvejJmMDZhaTNkcWpiN294dm12eCJ9.8ckNT6kfuJry7K7GAeIuxw';
    
    // 1. Initialize the Map centered on Chicago
    state.map = new mapboxgl.Map({
        container: 'map',
        style: mapStyles[state.currentStyleIndex].url,
        center: [-87.6298, 41.8781], // Chicago Loop Center
        zoom: 10.5
    });

    // 2. Initialize the Geocoder
    const geocoder = new MapboxGeocoder({
        accessToken: mapboxgl.accessToken,
        mapboxgl: mapboxgl,
        types: 'country,region,place,postcode,locality,neighborhood,address,poi', 
        proximity: {
            longitude: -87.6298,
            latitude: 41.8781
        },
        placeholder: 'Search for mission sites (parks, landmarks)...',
        marker: false // We use our own custom tactical marker below
    });
    
    const geocoderContainer = document.getElementById('geocoder-container');
    if (geocoderContainer) {
        geocoderContainer.appendChild(geocoder.onAdd(state.map));
    }

    // 3. THE FLY-TO & TACTICAL POPUP LOGIC (REPAIRED)
    geocoder.on('result', (event) => {
        const coords = event.result.geometry.coordinates; // [lng, lat]
        const name = event.result.text; // This is the "rawName"

        // PHASE 3 FIX: Define the escaped name for the string-based onclick handler
        // This handles names like "St. John's Park" without breaking the JS string.
        const escapedName = name.replace(/'/g, "\\'");

        console.log(`🚀 Mission Site Identified: ${name}`, coords);

        state.map.flyTo({
            center: coords,
            zoom: 15.5,
            pitch: 45,
            bearing: 0,
            essential: true,
            duration: 3000
        });

        // Add a tactical "Target" marker at the searched POI
        new mapboxgl.Marker({ color: '#dc3545' }) 
            .setLngLat(coords)
            .setPopup(new mapboxgl.Popup({ offset: 25, closeButton: true })
                .setHTML(`
                    <div class="poi-briefing">
                        <div class="poi-header">
                            <h3>📍 MISSION SITE</h3>
                        </div>
                        <div class="poi-body">
                            <strong style="display:block; margin-bottom:10px; color:#333;">${name}</strong>
                            
                            <button class="modal-button" 
                                    style="width:100%; margin-bottom:8px; padding:10px; background:#f0f0f0; border:1px solid #ccc; border-radius:6px; cursor:pointer;"
                                    onclick="window.showMeetupsList('${escapedName}')">
                                🔍 VIEW MEETUPS
                            </button>

                            <button class="modal-button primary" 
                                    style="width:100%; padding:10px; background:#4A7C59; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:bold;"
                                    onclick="window.openMeetupForm('${escapedName}', ${coords[1]}, ${coords[0]})">
                                📅 SCHEDULE MEETUP
                            </button>
                        </div>
                    </div>
                `))
            .addTo(state.map);
    });
    
    // 4. Update geocoder proximity as user pans the map
    state.map.on('moveend', () => {
        const newCenter = state.map.getCenter();
        geocoder.setProximity({
            longitude: newCenter.lng,
            latitude: newCenter.lat
        });
    });

    // Mobile UX fix for search input
    const searchInput = document.querySelector('#geocoder-container .mapboxgl-ctrl-geocoder--input');
    if (searchInput) {
        searchInput.setAttribute('readonly', 'readonly');
        searchInput.onfocus = () => {
            searchInput.removeAttribute('readonly');
        };
    }

    state.map.on('load', () => {
        initializeMapLayers();
        setupPoiClickListeners(); // From community.js
        setupSectorVisuals();
    });

    state.map.on('zoom', toggleMarkerVisibility);
}

/**
 * Sets up the initial GeoJSON sources and layers for routes and live tracking.
 */
function initializeMapLayers() {
  if (!state.map.getSource('user-route')) {
    state.map.addSource('user-route', { 
        type: 'geojson', 
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } } 
    });
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

  // Live Location Pulsing Dot
  if (!state.map.getSource('user-location-point')) {
    state.map.addSource('user-location-point', { 
        type: 'geojson', 
        data: { type: 'Feature', geometry: { type: 'Point', coordinates: [] } } 
    });
  }
  if (!state.map.getLayer('user-location-pulse')) {
    state.map.addLayer({ 
        id: 'user-location-pulse', 
        type: 'circle', 
        source: 'user-location-point', 
        paint: { 'circle-radius': 15, 'circle-color': '#4A7C59', 'circle-opacity': 0.2 } 
    });
  }
  if (!state.map.getLayer('user-location-dot')) {
    state.map.addLayer({ 
        id: 'user-location-dot', 
        type: 'circle', 
        source: 'user-location-point', 
        paint: { 'circle-radius': 6, 'circle-color': '#fff', 'circle-stroke-width': 2, 'circle-stroke-color': '#4A7C59' } 
    });
  }
}

/**
 * Cycles to the next map style while preserving all data layers.
 */
export function changeMapStyle() {
    state.currentStyleIndex = (state.currentStyleIndex + 1) % mapStyles.length;
    state.map.setStyle(mapStyles[state.currentStyleIndex].url);
    
    state.map.once('style.load', () => {
        initializeMapLayers();
        
        // Re-add HTML Markers
        state.userMarkers.forEach(marker => marker.addTo(state.map));
        state.communityMarkers.forEach(marker => marker.addTo(state.map));
        
        toggleMarkerVisibility();
        
        if (state.isCommunityViewOn) {
            fetchAndDisplayCommunityRoutes();
        }
        updateUserPinsSource();

        setupSectorVisuals(); 
        updateSwarmPulse();   
        
        // Re-apply Sector Visibility if it was active
        const sectorBtn = document.getElementById('toggleSectorsBtn');
        const isSectorsActive = sectorBtn && sectorBtn.classList.contains('active');
        
        if (isSectorsActive) {
            ['RP-01', 'RP-02', 'RP-03', 'RP-04', 'RP-05'].forEach(id => {
                if (state.map.getLayer(`layer-${id}`)) state.map.setLayoutProperty(`layer-${id}`, 'visibility', 'visible');
                if (state.map.getLayer(`label-${id}`)) state.map.setLayoutProperty(`label-${id}`, 'visibility', 'visible');
            });
        }
    });
}

/**
 * Hides pins when zoomed out to prevent map clutter.
 */
function toggleMarkerVisibility() {
    const display = state.map.getZoom() >= ZOOM_THRESHOLD ? 'block' : 'none';
    state.userMarkers.forEach(marker => marker.getElement().style.display = display);
    state.communityMarkers.forEach(marker => marker.getElement().style.display = display);
}

/**
 * Creates a photo pin marker and injects it into the map.
 */
export function createAndAddMarker(pinInfo, type, routeInfo = {}) {
    const el = document.createElement('div');
    el.className = 'photo-marker';
    // Use thumbnail if available, fallback to full image
    el.style.backgroundImage = `url(${pinInfo.thumbnailURL || pinInfo.imageURL || pinInfo.image})`;

    const popup = createPinPopup(pinInfo, type, routeInfo);
    const marker = new mapboxgl.Marker(el).setLngLat(pinInfo.coords).setPopup(popup).addTo(state.map);

    if (type === 'user') {
        state.userMarkers.push(marker);
    } else {
        el.style.borderColor = '#28a745'; // Community pins get a distinct border
        state.communityMarkers.push(marker);
    }
    return marker;
}

/**
 * Generates the specific Popup HTML and Form Logic for a pin.
 */
function createPinPopup(pinInfo, type, routeInfo = {}) {
    let popupHTML;

    if (type === 'user') {
        const mainCategories = Object.keys(pinCategories);
        let mainOptionsHTML = mainCategories.map(cat =>
            `<option value="${cat}" ${pinInfo.category === cat ? 'selected' : ''}>${cat}</option>`
        ).join('');

        const currentCategory = pinInfo.category && pinCategories[pinInfo.category] ? pinInfo.category : 'Other';
        let subOptionsHTML = pinCategories[currentCategory].map(subCat =>
            `<option value="${subCat}" ${pinInfo.subCategory === subCat ? 'selected' : ''}>${subCat}</option>`
        ).join('');

        popupHTML = `
            <div class="pin-edit-container" style="min-width: 200px;">
                <img src="${pinInfo.imageURL || pinInfo.image}" alt="Item" style="width:100%; border-radius: 6px; margin-bottom: 10px;"/>
                <div class="pin-popup-form">
                    <input type="text" id="title-${pinInfo.id}" value="${pinInfo.title || ''}" placeholder="Identify this item..." style="font-weight:bold;">
                    
                    <label>Category</label>
                    <select id="category-${pinInfo.id}">${mainOptionsHTML}</select>
                    
                    <label>Sub-Category</label>
                    <select id="subCategory-${pinInfo.id}">${subOptionsHTML}</select>
                    
                    <label>Brand (Optional)</label>
                    <input type="text" id="brand-${pinInfo.id}" value="${pinInfo.brand || ''}" placeholder="e.g. Coca-Cola">
                    
                    <div style="display: flex; gap: 10px; margin-top: 15px;">
                        <button id="update-${pinInfo.id}" class="modal-button btn-primary" style="margin:0; flex:1;">SAVE</button>
                        <button id="delete-${pinInfo.id}" class="modal-button btn-danger" style="margin:0; flex:1;">PURGE</button>
                    </div>
                </div>
            </div>`;
    } else {
        // Community Pin View
        popupHTML = `
            <div class="community-pin-brief">
                <img src="${pinInfo.thumbnailURL || pinInfo.imageURL}" alt="${pinInfo.title}" style="width:100%; border-radius: 6px;"/>
                <p style="margin: 8px 0 2px;"><strong>${pinInfo.title || 'Untitled Item'}</strong></p>
                <p style="margin: 0; font-size: 0.85em; color: #666;">
                    ${pinInfo.category || 'General'} ${pinInfo.subCategory ? `(${pinInfo.subCategory})` : ''}
                </p>
                <div style="margin-top:10px; border-top:1px solid #eee; padding-top:8px;">
                    <small>Detected by: <a href="#" class="profile-link" data-userid="${routeInfo.userId}">${routeInfo.username || 'Trooper'}</a></small>
                </div>
            </div>
        `;
    }

    const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(popupHTML);

    popup.on('open', () => {
        if (type === 'user') {
            const categorySelect = document.getElementById(`category-${pinInfo.id}`);
            const subCategorySelect = document.getElementById(`subCategory-${pinInfo.id}`);

            categorySelect?.addEventListener('change', (e) => {
                const selectedCategory = e.target.value;
                const subCategories = pinCategories[selectedCategory] || [];
                subCategorySelect.innerHTML = subCategories.map(subCat =>
                    `<option value="${subCat}">${subCat}</option>`
                ).join('');
            });

            document.getElementById(`update-${pinInfo.id}`)?.addEventListener('click', () => {
                const pin = state.photoPins.find(p => p.id === pinInfo.id);
                if (pin) {
                    pin.title = document.getElementById(`title-${pinInfo.id}`).value;
                    pin.category = categorySelect.value;
                    pin.subCategory = subCategorySelect.value;
                    pin.brand = document.getElementById(`brand-${pinInfo.id}`).value;
                }
                popup.remove();
                console.log("Pin Metadata Updated Locally.");
            });

            document.getElementById(`delete-${pinInfo.id}`)?.addEventListener('click', () => {
                if (confirm("Confirm: Delete this pin from your current mission?")) {
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
            // Profile Link Bridge
            popup.getElement().querySelector('.profile-link')?.addEventListener('click', (e) => {
                e.preventDefault();
                showPublicProfile(routeInfo.userId);
            });
        }
    });
    return popup;
}

/**
 * Updates the Mapbox GeoJSON source for current pins.
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
 * Smoothly fits the map view to the user's current tracked route.
 */
export function centerOnRoute() {
    if (state.routeCoordinates.length < 1 && state.photoPins.length < 1) {
        alert("Sector Data Empty: No route coordinates or pins detected yet.");
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

/**
 * Draws the tactical sector overlays onto the map.
 */
export function setupSectorVisuals() {
    if (!state.map) return;

    Object.entries(RP_SECTORS).forEach(([id, sector]) => {
        const sourceId = `source-${id}`;
        const layerId = `layer-${id}`;

        let polygonCoords;
        if (sector.isPolygon) {
            polygonCoords = [sector.path];
        } else {
            polygonCoords = [[
                [sector.minLon, sector.minLat],
                [sector.maxLon, sector.minLat],
                [sector.maxLon, sector.maxLat],
                [sector.minLon, sector.maxLat],
                [sector.minLon, sector.minLat]
            ]];
        }

        if (!state.map.getSource(sourceId)) {
            state.map.addSource(sourceId, {
                'type': 'geojson',
                'data': {
                    'type': 'Feature',
                    'geometry': { 'type': 'Polygon', 'coordinates': polygonCoords }
                }
            });
        }

        // Fill Layer (The "Glow")
        if (!state.map.getLayer(layerId)) {
            state.map.addLayer({
                'id': layerId,
                'type': 'fill',
                'source': sourceId,
                'layout': { 'visibility': 'none' },
                'paint': {
                    'fill-color': sector.color,
                    'fill-opacity': 0.15,
                    'fill-outline-color': sector.color
                }
            });

            // Label Layer (The Sector ID)
            state.map.addLayer({
                'id': `label-${id}`,
                'type': 'symbol',
                'source': sourceId,
                'layout': {
                    'text-field': id,
                    'text-size': 14,
                    'visibility': 'none'
                },
                'paint': {
                    'text-color': sector.color,
                    'text-halo-color': '#ffffff',
                    'text-halo-width': 2
                }
            });
        }
    });
}
