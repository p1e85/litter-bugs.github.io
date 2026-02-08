import { 
    db, serverTimestamp, increment, arrayRemove, arrayUnion, Timestamp, 
    collection, getDocs, query, orderBy, addDoc, doc, getDoc, where, setDoc, 
    deleteDoc, updateDoc, onSnapshot, limit, storage, ref, uploadBytes, 
    getDownloadURL, runTransaction 
} from './firebase.js';
import { state, allBadges, allTitles, profanityList, RP_SECTORS } from './config.js';

// PHASE 2 & 3 UPDATE: Importing unified math and converter utilities
// These are critical for the Phase 5 "Master Bin" standardization.
import { 
    convertRouteForFirestore, 
    convertPinsForFirestore, 
    convertRouteFromFirestore, 
    convertPinsFromFirestore,
    calculateRouteDistance,
    getDistanceInMiles 
} from './utils.js';

import { clearCurrentSession } from './data.js';
import { showPublicProfile } from './ui.js';

/* ==========================================================================
   1. UTILITIES & SECURITY (The Profanity Shield)
   ========================================================================== */

/**
 * Validates text against the master profanity list to protect community standards.
 * Every character and word check from your original file is preserved here.
 */
function containsProfanity(text) {
    if (!text) return false;
    const lowerText = text.toLowerCase();
    // Iterating through the master profanity list from config.js
    return profanityList.some(word => lowerText.includes(word.toLowerCase()));
}

/* ==========================================================================
   2. COMMUNITY MAP ENGINE (The Mapbox Cluster Logic)
   ========================================================================== */

/**
 * Fetches and displays community routes.
 * Standardized for Phase 5 to pull from 'publishedRoutes'.
 * Includes clustering, hover effects, and God Mode deletion.
 */
export async function fetchAndDisplayCommunityRoutes() {
  try {
    // Clear all existing layers and sources before fresh sync
    clearCommunityRoutes();
    
    // PHASE 5: Accessing the Master Bin 'publishedRoutes'
    // Pulling the most recent 50 missions for performance stability
    const q = query(collection(db, "publishedRoutes"), orderBy("timestamp", "desc"), limit(50));
    const querySnapshot = await getDocs(q);
    const allPinFeatures = [];

    querySnapshot.forEach(doc => {
      const routeData = doc.data();
      const routeId = doc.id;
      
      // Convert Firestore Geopoints back to Mapbox [lng, lat]
      const mapboxCoords = convertRouteFromFirestore(routeData.route);
      
      // --- Render The Mission Path (The Line) ---
      if (mapboxCoords && mapboxCoords.length > 0) {
        state.map.addSource(`community-route-${routeId}`, {
          'type': 'geojson',
          'data': { 
            'type': 'Feature', 
            'geometry': { 
                'type': 'LineString', 
                'coordinates': mapboxCoords 
            } 
          }
        });

        state.map.addLayer({
          'id': `community-route-${routeId}`,
          'type': 'line',
          'source': `community-route-${routeId}`,
          'layout': {
            'line-join': 'round',
            'line-cap': 'round'
          },
          'paint': { 
              'line-color': '#4A7C59', // Trooper Green
              'line-width': 4, 
              'line-opacity': 0.7 
          }
        });

        // Track layers for removal later
        state.communityLayers.push({ id: `community-route-${routeId}`, type: 'layer' });
      }
      
      // --- Process Pins for the Master Clustering Engine ---
      const mapboxPins = convertPinsFromFirestore(routeData.pins);
      if (mapboxPins) {
        mapboxPins.forEach(pin => {
          allPinFeatures.push({
            'type': 'Feature',
            'properties': {
              title: pin.title,
              category: pin.category || 'General',
              imageURL: pin.imageURL,
              thumbnailURL: pin.thumbnailURL,
              username: routeData.username || 'A Trooper',
              userId: routeData.userId,
              routeId: routeId 
            },
            'geometry': { 
                'type': 'Point', 
                'coordinates': pin.coords 
            }
          });
        });
      }
    });

    // --- Initialize Clustering Source ---
    // This allows the map to handle thousands of pins without lagging
    if (!state.map.getSource('community-pins')) {
      state.map.addSource('community-pins', {
        type: 'geojson',
        data: { 
            'type': 'FeatureCollection', 
            'features': allPinFeatures 
        },
        cluster: true,
        clusterMaxZoom: 14, // Max zoom to cluster points on
        clusterRadius: 50 // Radius of each cluster when clustering points
      });
    }

    // Add Cluster Circle Layer
    state.map.addLayer({
      id: 'clusters',
      type: 'circle',
      source: 'community-pins',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': [
          'step',
          ['get', 'point_count'],
          '#51bbd6', // Blue for small clusters
          100,
          '#f1f075', // Yellow for medium
          750,
          '#f28cb1'  // Pink for large
        ],
        'circle-radius': [
          'step',
          ['get', 'point_count'],
          20, 100, 30, 750, 40
        ]
      }
    });

    // Add Cluster Count Label Layer
    state.map.addLayer({
      id: 'cluster-count',
      type: 'symbol',
      source: 'community-pins',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': '{point_count_abbreviated}',
        'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
        'text-size': 12
      },
      paint: { 'text-color': '#ffffff' }
    });

    // Add Unclustered Point Layer (Individual Items)
    state.map.addLayer({
      id: 'unclustered-point',
      type: 'circle',
      source: 'community-pins',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': '#4A7C59',
        'circle-radius': 8,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff'
      }
    });

    // Interaction logic and the rest of the Map Engine follows in Part 2...

    // --- Interaction: Expand Clusters on Click ---
    state.map.on('click', 'clusters', (e) => {
      const features = state.map.queryRenderedFeatures(e.point, { 
          layers: ['clusters'] 
      });
      const clusterId = features[0].properties.cluster_id;
      
      state.map.getSource('community-pins').getClusterExpansionZoom(
          clusterId, 
          (err, zoom) => {
              if (err) return;
              state.map.easeTo({
                  center: features[0].geometry.coordinates,
                  zoom: zoom
              });
          }
      );
    });

    // --- Interaction: Item Popups & God Mode Deletion ---
    state.map.on('click', 'unclustered-point', async (e) => {
      const coordinates = e.features[0].geometry.coordinates.slice();
      const properties = e.features[0].properties;

      // Ensure coordinates are handled correctly if the map is zoomed out
      while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
        coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
      }

      // PHASE 5: Admin Permission Sync
      let isAdmin = false;
      if (state.currentUser) {
          try {
              const pSnap = await getDoc(doc(db, "publicProfiles", state.currentUser.uid));
              if (pSnap.exists() && pSnap.data().role === 'admin') {
                  isAdmin = true;
              }
          } catch (err) { console.error("Admin verification failed:", err); }
      }

      const isOwner = state.currentUser && (state.currentUser.uid == properties.userId);
      const canDelete = isOwner || isAdmin;

      // VERBOSE POPUP TEMPLATE: Restored full CSS-in-JS and HTML structure
      const popupHTML = `
        <div style="text-align:center; padding:5px; font-family: inherit;">
            <div style="width:100%; height:150px; overflow:hidden; border-radius:8px; margin-bottom:10px; background:#eee;">
                <img src="${properties.thumbnailURL || properties.imageURL}" 
                     alt="${properties.title}" 
                     style="width:100%; height:100%; object-fit:cover; display:block;"/>
            </div>
            <p style="margin: 8px 0 2px; font-size:1.1rem; line-height:1.2;"><strong>${properties.title}</strong></p>
            <p style="margin: 0 0 10px; font-style: italic; color: #666; font-size: 0.85rem;">
                Category: ${properties.category || 'Other'}
            </p>
            <div style="border-top:1px solid #eee; padding-top:10px; display:flex; flex-direction:column; gap:8px;">
                <small style="color:#888;">Reported By: 
                    <a href="#" class="profile-link" 
                       style="color:var(--color-primary-green); font-weight:bold; text-decoration:none;" 
                       data-userid="${properties.userId}">${properties.username || 'A user'}</a>
                </small>
                ${canDelete ? `
                    <button class="delete-route-btn" 
                            style="background:#d32f2f; color:white; border:none; padding:8px 12px; border-radius:6px; cursor:pointer; font-size:0.8em; font-weight:bold; width:100%; margin-top:5px;">
                        ⚠️ DELETE FROM SECTOR
                    </button>
                ` : ''}
            </div>
        </div>
      `;
      
      const popup = new mapboxgl.Popup({ offset: 15, closeButton: true })
        .setLngLat(coordinates)
        .setHTML(popupHTML)
        .addTo(state.map);
      
      const popupEl = popup.getElement();

      // Listener for Profile Links inside Popups
      const profileLink = popupEl.querySelector('.profile-link');
      if (profileLink) {
          profileLink.addEventListener('click', (ev) => {
            ev.preventDefault();
            showPublicProfile(properties.userId);
          });
      }

      // Listener for Delete Button (The God Mode Trigger)
      const delBtn = popupEl.querySelector('.delete-route-btn');
      if (delBtn) {
          delBtn.addEventListener('click', async () => {
              if (confirm("⚠️ PERMANENT OVERRIDE: Delete this mission record from the community map? This cannot be undone.")) {
                  await deletePublishedRoute(properties.routeId);
                  popup.remove();
              }
          });
      }
    });

    // Pointer changes for interactable map elements
    const interactiveLayers = ['clusters', 'unclustered-point'];
    interactiveLayers.forEach(layer => {
      state.map.on('mouseenter', layer, () => { state.map.getCanvas().style.cursor = 'pointer'; });
      state.map.on('mouseleave', layer, () => { state.map.getCanvas().style.cursor = ''; });
    });

  } catch (error) {
    console.error("Critical Error during community route render:", error);
    alert("Map Data Sync Failed. Sector signal weak.");
  }
}

/**
 * Toggles the visibility of all community-published content.
 */
export function toggleCommunityView() {
    state.isCommunityViewOn = !state.isCommunityViewOn;
    const communityBtn = document.getElementById('communityBtn');
    if (!communityBtn) return;

    if (state.isCommunityViewOn) {
        communityBtn.textContent = '🌎 Community View: ON';
        communityBtn.classList.remove('off');
        fetchAndDisplayCommunityRoutes();
    } else {
        communityBtn.textContent = '🌎 Community View: OFF';
        communityBtn.classList.add('off');
        clearCommunityRoutes();
    }
}

/**
 * Sweeps the map clean of community layers and sources.
 */
function clearCommunityRoutes() {
  if (!state.map || !state.map.isStyleLoaded()) return;
  
  // Remove fixed cluster layers
  const standardLayers = ['clusters', 'cluster-count', 'unclustered-point'];
  standardLayers.forEach(layerId => {
      if (state.map.getLayer(layerId)) state.map.removeLayer(layerId);
  });

  // Remove individual mission path layers
  state.communityLayers.forEach(layer => {
    if (state.map.getLayer(layer.id)) state.map.removeLayer(layer.id);
    if (state.map.getSource(layer.id)) state.map.removeSource(layer.id);
  });

  // Remove main cluster source
  if (state.map.getSource('community-pins')) state.map.removeSource('community-pins');
  
  state.communityLayers = [];
}

/* ==========================================================================
   3. MISSION PUBLISHING & DATA ARCHIVING
   ========================================================================== */

/**
 * Formats, uploads, and broadcasts the current user session.
 * PHASE 2 Math Fix: Saves distance to Firestore in Miles.
 * PHASE 5 Dossier Fix: Links directly to publicProfiles.
 */
export async function publishRoute() {
    if (!state.currentUser) {
        alert("Identity unverified. Please log in to publish missions.");
        return;
    }

    if (state.routeCoordinates.length < 2 || state.photoPins.length === 0) {
        alert("Mission Incomplete: Tracked route and at least one item pin required.");
        return;
    }
    
    const publishBtn = document.getElementById('publishBtn');
    const originalText = publishBtn.innerText;
    publishBtn.innerText = "UPLINKING...";
    publishBtn.disabled = true;
    document.getElementById('dataModal').style.display = 'none';

    try {
        const publicProfileRef = doc(db, "publicProfiles", state.currentUser.uid);
        const profileSnap = await getDoc(publicProfileRef);
        
        const badgesBefore = profileSnap.exists() ? Object.keys(profileSnap.data().badges || {}) : [];
        const username = profileSnap.exists() ? profileSnap.data().username : "Anonymous";

        // MATH SYNC: Pulling from the Phase 2 Miles logic
        const distanceVal = calculateRouteDistance(state.routeCoordinates);
        const distanceStr = `${distanceVal.toFixed(2)} mi`;

        let cleanupPhotoURL = null;
        if (state.cleanupPhoto) {
            try {
                const photoRef = ref(storage, `recap_photos/${state.currentUser.uid}/${Date.now()}.jpg`);
                const snapshot = await uploadBytes(photoRef, state.cleanupPhoto);
                cleanupPhotoURL = await getDownloadURL(snapshot.ref);
            } catch (uploadError) {
                console.error("Storage upload failure:", uploadError);
            }
        }

        // Final Master Doc Creation
        await addDoc(collection(db, "publishedRoutes"), {
            userId: state.currentUser.uid,
            username: username,
            timestamp: serverTimestamp(),
            route: convertRouteForFirestore(state.routeCoordinates),
            pins: convertPinsForFirestore(state.photoPins),
            distance: parseFloat(distanceVal.toFixed(2)),
            distanceMiles: distanceStr,
            cleanupPhotoURL: cleanupPhotoURL,
            likeCount: 0,
            likedBy: []
        });

        // Trigger Progression & Milestone Matrix (Continues in Part 3...)

    // --- Trigger Rank Progression & Milestone Matrix ---
        await checkForTitleMilestones(state.currentUser.uid, state.routeCoordinates);
        
        // Brief artificial delay to allow Firestore to index stats for a smoother UI update
        await new Promise(resolve => setTimeout(resolve, 1500));

        const afterSnap = await getDoc(publicProfileRef);
        const badgesAfter = afterSnap.exists() ? Object.keys(afterSnap.data().badges || {}) : [];
        const newBadges = badgesAfter.filter(badge => !badgesBefore.includes(badge));

        // Presentation: Alert user of new rank or simply mission success
        if (newBadges.length > 0) {
            showPopup(newBadges[0]);
        } else {
            alert("🚀 MISSION SECURED: Archive broadcasted to sector map.");
        }
        
        // Deep clean current view
        clearCurrentSession();
        if (state.isCommunityViewOn) {
            fetchAndDisplayCommunityRoutes();
        }

    } catch (error) {
        console.error("Critical Failure: Mission transmission lost.", error);
        alert("Transmission Error: Your mission data was not saved to the cloud.");
    } finally {
        publishBtn.innerText = originalText;
        publishBtn.disabled = false;
    }
}

/**
 * Retrieves the user's specific mission logs for management.
 */
export async function populatePublishedRoutesList() {
    const listEl = document.getElementById('publishedRoutesList');
    if (!listEl) return;

    listEl.innerHTML = '<li style="text-align:center; padding:15px; color:#666;">📡 Synchronizing local archives...</li>';

    try {
        const q = query(
            collection(db, "publishedRoutes"), 
            where("userId", "==", state.currentUser.uid), 
            orderBy("timestamp", "desc")
        );
        
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            listEl.innerHTML = '<li style="text-align:center; color:#999; padding:20px;">No mission records found in your archive.</li>';
            return;
        }

        listEl.innerHTML = '';
        querySnapshot.forEach(doc => {
            const data = doc.data();
            const timestamp = data.timestamp ? new Date(data.timestamp.seconds * 1000) : new Date();
            const dateStr = timestamp.toLocaleDateString();
            const timeStr = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            const li = document.createElement('li');
            li.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:12px; border-bottom:1px solid #eee; background:#fff;";
            
            li.innerHTML = `
                <div style="text-align:left;">
                    <span style="font-weight:bold; color:#333;">Recap: ${dateStr}</span><br>
                    <small style="color:#888;">${timeStr} • ${data.distanceMiles || '0.00 mi'} • ${data.pins?.length || 0} items</small>
                </div>
                <button class="purge-session-btn" 
                        style="background:#fff1f0; color:#cf1322; border:1px solid #ffa39e; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:0.75rem; font-weight:bold;">
                    PURGE
                </button>
            `;

            li.querySelector('button').addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm(`🚨 WARNING: Are you sure you want to permanently delete the mission record from ${dateStr}?`)) {
                    deletePublishedRoute(doc.id);
                }
            });
            listEl.appendChild(li);
        });
    } catch (error) {
        console.error("Archive retrieval failed:", error);
        listEl.innerHTML = '<li style="color:red; padding:10px;">Archive Access Denied.</li>';
    }
}

/**
 * Removes a specific mission from the community map and user archives.
 */
async function deletePublishedRoute(routeId) {
    try {
        await deleteDoc(doc(db, "publishedRoutes", routeId));
        alert("Mission record successfully purged from sector history.");
        
        // Refresh local list
        populatePublishedRoutesList();
        
        // Refresh global map if viewing
        if (state.isCommunityViewOn) {
            fetchAndDisplayCommunityRoutes();
        }
    } catch (error) {
        console.error("Purge failure:", error);
        alert("Command Denied: Archive record is locked or unreachable.");
    }
}

/* ==========================================================================
   4. DOSSIER (PROFILE) MANAGEMENT
   ========================================================================== */

/**
 * Populates the Profile UI with current dossier data from Phase 5 Master Bin.
 */
export async function loadProfileForEditing() {
    if (!state.currentUser) return;
    
    try {
        const docSnap = await getDoc(doc(db, "publicProfiles", state.currentUser.uid));
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            // Standard inputs
            document.getElementById('bioInput').value = data.bio || '';
            document.getElementById('locationInput').value = data.location || '';
            document.getElementById('coffeeLinkInput').value = data.buyMeACoffeeLink || '';

            // Title Selection: Logic to ensure the dropdown matches unlocked ranks
            const titleSelect = document.getElementById('titleSelect');
            if (titleSelect) {
                // Clear existing and rebuild to match Master Dossier
                titleSelect.innerHTML = '<option value="">Select Active Rank</option>';
                const unlocked = data.unlockedTitles || ['recruit'];
                
                unlocked.forEach(titleKey => {
                    if (allTitles[titleKey]) {
                        const opt = document.createElement('option');
                        opt.value = titleKey;
                        opt.textContent = allTitles[titleKey].name;
                        titleSelect.appendChild(opt);
                    }
                });

                titleSelect.value = data.selectedTitle || '';
                titleSelect.dispatchEvent(new Event('change'));
            }
        }
    } catch (error) {
        console.error("Dossier load failure:", error);
    }
}

/**
 * Saves profile updates to the Master publicProfiles collection.
 */
export async function saveProfile() {
    if (!state.currentUser) return;

    const bioValue = document.getElementById('bioInput').value.trim();
    const locValue = document.getElementById('locationInput').value.trim();
    const coffeeValue = document.getElementById('coffeeLinkInput').value.trim();
    const titleValue = document.getElementById('titleSelect').value;

    if (containsProfanity(bioValue) || containsProfanity(locValue)) {
        alert("Dossier content rejected: Restricted language detected.");
        return;
    }

    try {
        const publicProfileRef = doc(db, "publicProfiles", state.currentUser.uid);
        
        await updateDoc(publicProfileRef, { 
            bio: bioValue, 
            location: locValue, 
            buyMeACoffeeLink: coffeeValue,
            selectedTitle: titleValue 
        });

        alert("Dossier synchronization successful.");
        document.getElementById('profileModal').style.display = 'none';
        
        // Refresh stats view to show new title/bio
        fetchAndDisplayMyStats();
    } catch (error) {
        console.error("Dossier sync failure:", error);
        alert("Error saving dossier: Uplink unstable.");
    }
}

/* ==========================================================================
   5. SECTOR LEADERBOARD & ANALYTICS
   ========================================================================== */

/**
 * Renders the High-Resolution Leaderboard.
 * PHASE 5 Fix: Strict retrieval from publicProfiles.
 */
export async function fetchAndDisplayLeaderboard(metric) {
    const leaderboardList = document.getElementById('leaderboardList');
    if (!leaderboardList) return;

    leaderboardList.innerHTML = '<li style="text-align:center; padding:30px; color:#888;">📡 Synchronizing sector ranks...</li>';
    
    try {
        const profilesRef = collection(db, "publicProfiles");
        const q = query(
            profilesRef, 
            where(metric, ">", 0), 
            orderBy(metric, "desc"), 
            limit(10)
        );

        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            leaderboardList.innerHTML = '<li style="text-align:center; padding:20px; color:#aaa;">No active signals detected. Be the first to secure this sector!</li>';
            return;
        }

        leaderboardList.innerHTML = '';
        let rank = 1;

        querySnapshot.forEach(doc => {
            const data = doc.data();
            const li = document.createElement('li');
            li.dataset.userid = doc.id;
            
            // Highlight current Trooper
            li.classList.toggle('current-user-entry', state.currentUser && doc.id === state.currentUser.uid);
            
            // PHASE 2/5 MATH Fix: Numbers are pulled raw from Firestore in Miles
            const scoreDisplay = metric === 'totalDistance' 
                ? `${(data.totalDistance || 0).toFixed(2)} mi` 
                : (data.totalPins || 0);

            // VERBOSE ITEM TEMPLATE: Restored full fidelity
            li.innerHTML = `
                <span class="leaderboard-rank" style="font-weight:900; color:#bbb; min-width:30px;">#${rank}</span>
                <span class="leaderboard-name" style="flex-grow:1; padding:0 15px; font-weight:700;">
                    <a href="#" class="leaderboard-profile-link" 
                       style="color:var(--color-primary-green); text-decoration:none;"
                       onclick="event.preventDefault(); showPublicProfile('${doc.id}')">${data.username}</a>
                </span>
                <span class="leaderboard-score" style="font-weight:800; color:#333; font-family:monospace; font-size:1.1rem;">
                    ${scoreDisplay}
                </span>
            `;
            leaderboardList.appendChild(li);
            rank++;
        });

    } catch (error) {
        console.error("Leaderboard retrieval failure:", error);
        leaderboardList.innerHTML = '<li style="color:red; text-align:center; padding:10px;">Sector uplink failure.</li>';
    }
}

/* ==========================================================================
   6. BIOMETRIC STATS & ACHIEVEMENT PRESENTATION
   ========================================================================== */

/**
 * PHASE 1 & 5 FIX: Linked to static HTML ID 'achievementModal'.
 * Triggers the high-fidelity medal presentation when a new rank is secured.
 */
function showPopup(badgeKey) {
    const badge = allBadges[badgeKey];
    if (!badge) return;

    const modal = document.getElementById('achievementModal');
    if (modal) {
        // Populating the verbose template from config.js
        const iconEl = modal.querySelector('.achievement-icon');
        if (iconEl) iconEl.textContent = badge.icon;
        
        const nameEl = document.getElementById('achievementName');
        if (nameEl) nameEl.textContent = badge.name;
        
        const descEl = document.getElementById('achievementDescription');
        if (descEl) descEl.textContent = badge.description;
        
        modal.style.display = 'flex';
        
        // Console log for telemetry
        console.log(`Medal Presentation Triggered: ${badge.name}`);
    }
}

/**
 * Standardized Map click listener for existing POI labels.
 * PHASE 3 REPAIR: Explicitly defines naming variables to prevent ReferenceErrors.
 */
export function setupPoiClickListeners() {
    if (!state.map) return;

    // Listen for clicks on the Mapbox 'poi-label' layer
    state.map.on('click', (e) => {
        const features = state.map.queryRenderedFeatures(e.point, {
            layers: ['poi-label'] 
        });

        if (!features.length) return;

        const feature = features[0];
        const name = feature.properties.name || "Designated Mission Site";
        const coords = feature.geometry.coordinates;

        // Ensure coords are in [lng, lat] format regardless of nesting
        const lngLat = Array.isArray(coords[0]) ? coords[0] : coords;

        // PHASE 3 REPAIR: Defining variables for the verbose template bridge
        const rawName = name;
        const escapedName = name.replace(/'/g, "\\'");

        // VERBOSE POI BRIEFING TEMPLATE: Restored full styling and logic
        new mapboxgl.Popup({ offset: 25, closeButton: true })
            .setLngLat(lngLat)
            .setHTML(`
                <div class="poi-briefing" style="min-width:240px; font-family: inherit;">
                    <div class="poi-header" style="background:var(--color-primary-green); padding:15px; border-radius:10px 10px 0 0; text-align:center;">
                        <h3 style="margin:0; color:white; font-size:0.9rem; letter-spacing:2px; text-transform:uppercase; font-weight:900;">📍 MISSION SITE</h3>
                    </div>
                    <div class="poi-body" style="padding:20px; text-align:center; background:white; border-radius:0 0 10px 10px; border:1px solid #eee; border-top:none;">
                        <strong style="display:block; margin-bottom:15px; color:#333; font-size:1.15rem; line-height:1.2;">${rawName}</strong>
                        
                        <div style="display:flex; flex-direction:column; gap:10px;">
                            <button class="modal-button" 
                                    style="width:100%; margin:0; padding:12px; background:#f8f9fa; border:1px solid #ddd; border-radius:8px; cursor:pointer; font-weight:700; font-size:0.85rem; display:flex; align-items:center; justify-content:center; gap:8px;"
                                    onclick="window.showMeetupsList('${escapedName}', ${lngLat[1]}, ${lngLat[0]})">
                                🔍 VIEW ACTIVE MISSIONS
                            </button>

                            <button class="modal-button primary" 
                                    style="width:100%; margin:0; padding:15px; background:#4A7C59; color:white; border:none; border-radius:8px; cursor:pointer; font-weight:800; letter-spacing:1px; font-size:0.9rem; display:flex; align-items:center; justify-content:center; gap:8px;"
                                    onclick="window.openMeetupForm('${escapedName}', ${lngLat[1]}, ${lngLat[0]})">
                                📅 SCHEDULE CLEANUP
                            </button>
                        </div>
                        
                        <div style="margin-top:15px; padding-top:12px; border-top:1px dashed #ccc;">
                            <small style="color:#aaa; font-style:italic;">GPS: ${lngLat[1].toFixed(4)}, ${lngLat[0].toFixed(4)}</small>
                        </div>
                    </div>
                </div>
            `)
            .addTo(state.map);
    });

    // Cursor feedback for POI labels
    state.map.on('mouseenter', 'poi-label', () => {
        state.map.getCanvas().style.cursor = 'pointer';
    });

    state.map.on('mouseleave', 'poi-label', () => {
        state.map.getCanvas().style.cursor = '';
    });
}

/* ==========================================================================
   7. MEETUP & COORDINATION FORMS
   ========================================================================== */

/**
 * Opens the meetup scheduling interface for a specific POI.
 */
function openMeetupModal(poiName, lat, lng) {
    if (!state.currentUser) {
        alert("Verification Required: Please log in to schedule a sector meetup.");
        return;
    }

    // Populate hidden inputs and labels
    const locLabel = document.getElementById('meetupLocationName');
    if (locLabel) locLabel.textContent = poiName;
    
    const poiInput = document.getElementById('poiNameInput');
    if (poiInput) poiInput.value = poiName;
    
    const latInput = document.getElementById('meetupLat');
    if (latInput) latInput.value = lat;
    
    const lngInput = document.getElementById('meetupLng');
    if (lngInput) lngInput.value = lng;

    // Reset date picker
    const dateInput = document.getElementById('meetupDateInput');
    if (dateInput) dateInput.value = '';

    const modal = document.getElementById('meetupModal');
    if (modal) modal.style.display = 'flex';
    
    validateMeetupForm();
}

/**
 * Client-side validation for the Mission Coordinator form.
 */
export function validateMeetupForm() {
    const title = document.getElementById('meetupTitleInput')?.value.trim();
    const description = document.getElementById('meetupDescriptionInput')?.value.trim();
    const dateVal = document.getElementById('meetupDateInput')?.value;
    const safetyChecked = document.getElementById('safetyCheckbox')?.checked;
    
    const createBtn = document.getElementById('createMeetupBtn');
    if (createBtn) {
        // All conditions must be met for tactical broadcast
        createBtn.disabled = !(title && description && dateVal && safetyChecked);
    }
}

/* ==========================================================================
   8. MISSION BROADCASTING (Meetup Finalization)
   ========================================================================== */

/**
 * Transmits the scheduled meetup to the global mission board.
 */
export async function handleMeetupSubmit() {
    if (!state.currentUser) return;

    const title = document.getElementById('meetupTitleInput').value.trim();
    const description = document.getElementById('meetupDescriptionInput').value.trim();
    const dateVal = document.getElementById('meetupDateInput').value;
    const poiName = document.getElementById('poiNameInput').value;
    const latStr = document.getElementById('meetupLat').value;
    const lngStr = document.getElementById('meetupLng').value;

    try {
        // PHASE 5: Pulling current handle from the Master Dossier
        const profileSnap = await getDoc(doc(db, "publicProfiles", state.currentUser.uid));
        const username = profileSnap.exists() ? profileSnap.data().username : "Trooper";
        
        await addDoc(collection(db, "meetups"), {
            organizerId: state.currentUser.uid,
            organizerName: username,
            poiName: poiName,
            title: title,
            description: description,
            eventDate: new Date(dateVal),
            createdAt: serverTimestamp(),
            coordinates: (latStr && lngStr) ? {
                lat: parseFloat(latStr),
                lng: parseFloat(lngStr)
            } : null
        });

        alert("📡 MISSION BROADCAST SUCCESSFUL: Check the community board for coordination.");
        document.getElementById('meetupModal').style.display = 'none';
        
        // Clear local form
        document.getElementById('meetupTitleInput').value = '';
        document.getElementById('meetupDescriptionInput').value = '';
        document.getElementById('meetupDateInput').value = '';
        document.getElementById('safetyCheckbox').checked = false;
        
    } catch (error) {
        console.error("Transmission Error:", error);
        alert("Broadcast Failure: Signal lost during uplink.");
    }
}

/* ==========================================================================
   9. SQUAD COMMAND (The Tactical Units & Rosters)
   ========================================================================== */

/**
 * Initializes a new tactical squad and assigns leadership rank.
 */
export async function initializeSquad() {
    const btn = document.getElementById('btnFinalizeSquad');
    if (btn && btn.disabled) return; 

    const name = document.getElementById('newSquadName').value.trim();
    const callsign = document.getElementById('newSquadCallsign').value.trim().toUpperCase();
    const sector = document.getElementById('newSquadHomeSector').value;
    const bio = document.getElementById('newSquadBio').value.trim();

    if (!name || callsign.length < 3) {
        alert("Initialization Failed: Squad Name and a 3-character Callsign required.");
        return;
    }

    if (containsProfanity(name) || containsProfanity(callsign)) {
        alert("DESIGNATION REJECTED: Profanity detected. Choose a compliant callsign.");
        return;
    }

    if (btn) btn.disabled = true;

    try {
        await addDoc(collection(db, "squads"), {
            squadName: name,
            callsign: callsign,
            homeSector: sector,
            bio: bio,
            leaderId: state.currentUser ? state.currentUser.uid : 'anonymous', 
            members: state.currentUser ? [state.currentUser.uid] : [],
            memberCount: 1,
            totalPins: 0,
            status: "active",
            createdAt: serverTimestamp() 
        });

        // Award 'Event Host' rank title automatically to squad leaders
        await grantTitle(state.currentUser.uid, 'event_host');

        alert(`Unit [${callsign}] ${name} Deployed.`);
        window.showSquadRegistry();
        fetchLocalSquads();
    } catch (error) {
        console.error("Registry error:", error);
        if (btn) btn.disabled = false;
    }
}

/**
 * Renders the detailed Intel Dossier for a squad.
 * VERBOSE TEMPLATE: Preserving full 100+ line UI structure.
 */
export async function fetchSquadDetails(squadId) {
    const intelView = document.getElementById('squadIntelView');
    if (!intelView) return;
    intelView.innerHTML = '<div style="text-align:center; padding:50px;">🛰️ Downloading dossier...</div>';

    try {
        const squadSnap = await getDoc(doc(db, "squads", squadId));
        if (squadSnap.exists()) {
            const squad = squadSnap.data();
            const currentUid = state.currentUser?.uid;
            const isLeader = currentUid === squad.leaderId;
            const isMember = squad.members && squad.members.includes(currentUid);

            // Reconstructing the Tactical Dossier View
            intelView.innerHTML = `
                <div style="display:flex; justify-content:flex-start; margin-bottom:25px;">
                    <button class="modal-button secondary" onclick="window.showSquadRegistry()" 
                            style="width: auto; padding: 10px 20px; font-size: 0.85rem; font-weight:800;">
                        ← REGISTRY
                    </button>
                </div>
                
                <div style="text-align:left; background:linear-gradient(135deg, #f8f9fa, #fff); padding:30px; border-radius:20px; border:1px solid #eee; margin-bottom:30px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <h2 style="margin:0; font-size:2.1rem; color:#222; font-weight:900;">[${squad.callsign}] ${squad.squadName}</h2>
                        <span style="background:var(--color-primary-green); color:white; padding:5px 12px; border-radius:10px; font-size:0.75rem; font-weight:900;">ACTIVE</span>
                    </div>
                    <p style="text-align: left; color: var(--color-primary-green); font-weight: 800; margin-top: 15px; font-size: 1rem; text-transform: uppercase;">
                        Operations Sector: ${squad.homeSector}
                    </p>
                    <div style="background: #fff; border-left: 6px solid var(--color-primary-green); padding: 20px; border-radius: 10px; margin: 25px 0; box-shadow:0 3px 10px rgba(0,0,0,0.04);">
                        <strong style="display:block; font-size:0.75rem; text-transform:uppercase; color:#bbb; letter-spacing:1px; margin-bottom:10px;">Mission Profile</strong>
                        <p style="margin: 0; font-size: 1.1rem; line-height: 1.6; color: #444; font-style: italic;">"${squad.bio || "No mission profile provided."}"</p>
                    </div>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding: 0 10px;">
                    <h4 style="margin: 0; font-size:0.9rem; font-weight:900; color:#aaa; text-transform:uppercase; letter-spacing:1.5px;">Unit Roster</h4>
                    <span style="background: #f0f0f0; padding: 5px 12px; border-radius: 20px; font-size: 0.8rem; font-weight:800; color:#666;">${squad.memberCount || 1} Troopers Attached</span>
                </div>
                
                <div id="squadRosterList" style="display:flex; flex-direction:column; gap:12px; min-height: 100px;"></div>

                <div style="margin-top: 50px; border-top: 2px solid #f5f5f5; padding-top: 35px;">
                    ${isLeader ? `
                        <div style="background:rgba(220,53,69,0.03); padding:25px; border-radius:20px; border:2px dashed #dc3545; text-align:center;">
                            <button class="modal-button btn-danger" style="margin:0; padding:18px; font-weight:900;" 
                                    onclick="window.handleDisband('${squadId}', '${squad.squadName}')">
                                ☢️ DISBAND TACTICAL UNIT
                            </button>
                        </div>
                    ` : isMember ? `
                        <button class="modal-button btn-secondary" style="margin:0; padding:18px; font-weight:900;" 
                                onclick="window.handleLeave('${squadId}', '${squad.squadName}')">
                            🚶 ABANDON ASSIGNMENT
                        </button>
                    ` : `
                        <button class="launch-btn" style="width: 100%; padding:22px; font-size:1.2rem;" 
                                onclick="window.requestToJoinSquad('${squadId}')">
                            ⚡ REQUEST UNIT ENTRY
                        </button>
                    `}
                </div>`;
            
            if (squad.members) renderRoster(squad.members, squad.leaderId);
        }
    } catch (error) { intelView.innerHTML = '<p>⚠️ UPLINK ERROR: Sector dossiers unreachable.</p>'; }
}

/**
 * Verbose roster rendering sub-function.
 * PHASE 5: Pulling real-time rank data from master publicProfiles.
 */
async function renderRoster(memberIds, leaderId) {
    const container = document.getElementById('squadRosterList');
    if (!container) return;
    try {
        let rosterHTML = '';
        for (const uid of memberIds) {
            const userSnap = await getDoc(doc(db, "publicProfiles", uid));
            if (userSnap.exists()) {
                const userData = userSnap.data();
                const isLeader = uid === leaderId;
                const activeTitle = userData.selectedTitle ? (allTitles[userData.selectedTitle]?.name || 'Trooper') : 'New Recruit';
                
                rosterHTML += `
                    <div class="roster-card" style="display: flex; align-items: center; gap: 15px; padding: 18px; background: #fff; border-radius: 15px; border: 1px solid ${isLeader ? 'var(--color-support-gold)' : '#eee'}; box-shadow:0 4px 12px rgba(0,0,0,0.03);">
                        <div class="rank-orb" style="font-size: 1.8rem; background: #f8f9fa; width: 55px; height: 55px; display: flex; align-items: center; justify-content: center; border-radius: 50%; border: 3px solid ${isLeader ? 'gold' : 'var(--color-primary-green)'}; cursor: pointer;" 
                             onclick="window.handleViewProfile('${uid}')">
                            ${isLeader ? '⭐' : '👤'}
                        </div>
                        <div style="flex-grow: 1; text-align:left;">
                            <h5 style="margin: 0; font-size:1.2rem; font-weight:800; color:#222;">${userData.username} ${isLeader ? '<small style="color:var(--color-support-gold); font-weight:900; margin-left:5px;">[HQ]</small>' : ''}</h5>
                            <p style="margin: 3px 0 0 0; font-size: 0.75rem; color: #777; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">${activeTitle}</p>
                        </div>
                        <div style="text-align: right; min-width:60px;">
                            <small style="display:block; font-size:0.6rem; color:#bbb; font-weight:800; text-transform:uppercase;">Pins</small>
                            <span style="font-weight: 900; color: var(--color-primary-green); font-size:1.3rem;">${userData.totalPins || 0}</span>
                        </div>
                    </div>`;
            }
        }
        container.innerHTML = rosterHTML || '<p style="text-align:center; padding:30px; color:#bbb;">Biometric signal lost...</p>';
    } catch (err) { console.error("Roster failure:", err); }
}

/* ==========================================================================
   10. PROGRESSION & RANKS (The Milestone Matrix)
   ========================================================================== */

/**
 * Coordinate lookup with Rogers Park sloped boundary logic for West Side Sector.
 */
function getSectorFromCoords(lon, lat) {
    // West Side (RP-05) Custom Boundary Math: Slope intercept check for the ridge curb
    const ridgeLine = -87.6765 + ((lat - 41.9975) * ((-87.6833 - -87.6765) / (42.0190 - 41.9975)));
    if (lat >= 41.9975 && lat <= 42.0190 && lon >= ridgeLine && lon <= -87.6750) return 'RP-05';
    
    for (const [id, bounds] of Object.entries(RP_SECTORS)) {
        if (id === 'RP-05') continue;
        if (lat >= bounds.minLat && lat <= bounds.maxLat && lon >= bounds.minLon && lon <= bounds.maxLon) return id;
    }
    return null;
}

export async function grantTitle(userId, titleKey) {
    const profileRef = doc(db, "publicProfiles", userId);
    await runTransaction(db, async (t) => {
        const d = await t.get(profileRef);
        const unlocked = d.data().unlockedTitles || [];
        if (!unlocked.includes(titleKey)) {
            unlocked.push(titleKey);
            t.update(profileRef, { unlockedTitles: unlocked });
            // Notification bridge
            const name = allTitles[titleKey]?.name || 'Elite Rank';
            alert(`🏆 RANK ATTAINED: ${name}`);
        }
    });
}

/**
 * Evaluates dossier stats against the milestone matrix.
 * PHASE 2 MATH: Checks Miles and Count directly.
 */
export async function checkForTitleMilestones(userId, routeCoords) {
    try {
        const snap = await getDoc(doc(db, "publicProfiles", userId));
        if (!snap.exists()) return;
        const d = snap.data();
        
        // --- Rank Checks ---
        if (d.totalPins >= 10) await grantTitle(userId, 'scout');
        if (d.totalPins >= 50) await grantTitle(userId, 'trash_wizard');
        if (d.totalPins >= 100) await grantTitle(userId, 'eco_legend');
        
        if (d.totalRoutes >= 10) await grantTitle(userId, 'litter_warrior');
        if (d.totalRoutes >= 50) await grantTitle(userId, 'road_runner');
        
        // --- Sector Intelligence (Rogers Park Ridge) ---
        if (routeCoords && routeCoords.length > 0) {
            const sid = getSectorFromCoords(routeCoords[0][0], routeCoords[0][1]);
            if (sid === 'RP-05') {
                const count = (d.rpRoutesCount || 0) + 1;
                await updateDoc(doc(db, "publicProfiles", userId), { rpRoutesCount: count });
                if (count >= 5) await grantTitle(userId, 'rp_pioneer');
            }
        }
    } catch (e) { console.error("Milestone Error:", e); }
}

export async function leaveSquad(squadId, squadName) {
    if (!state.currentUser || !confirm(`Confirm Unit Extraction: ${squadName}?`)) return;
    try {
        await updateDoc(doc(db, "squads", squadId), {
            members: arrayRemove(state.currentUser.uid),
            memberCount: increment(-1)
        });
        alert("Extraction successful. You are now unassigned.");
        fetchSquadDetails(squadId);
        // Refresh registry view if user goes back
        fetchLocalSquads();
    } catch (error) { alert("Extraction failed."); }
}

/* ==========================================================================
   11. GLOBAL BRIDGE & ADMIN
   ========================================================================== */

/**
 * Triggers visual medal presentation modal.
 */
export async function awardBadge(userId, title, desc, icon) {
    const modal = document.getElementById('achievementModal');
    if (modal) {
        document.getElementById('achievementName').textContent = title;
        document.getElementById('achievementDescription').textContent = desc;
        const iconEl = modal.querySelector('.achievement-icon');
        if (iconEl) iconEl.textContent = icon;
        modal.style.display = 'flex';
    }
    const key = title.toLowerCase().replace(/ /g, '_');
    await updateDoc(doc(db, "publicProfiles", userId), { [`badges.${key}`]: true });
}

// Data Handling Export Bridges
export const getAdminChallenges = async () => (await getDocs(query(collection(db, "challenges"), orderBy("created_at", "desc")))).docs.map(d => ({ id: d.id, ...d.data() }));
export const getUserQuests = async (uid) => (await getDoc(doc(db, "publicProfiles", uid))).data()?.active_quests || {};
export const joinChallenge = async (id, title, uid) => await updateDoc(doc(db, "publicProfiles", uid), { [`active_quests.${id}`]: { title, progress: 0.1, status: 'active', joined_at: serverTimestamp() } });
export const deleteChallenge = async (id) => await deleteDoc(doc(db, "challenges", id));
export const createNewChallenge = async (t, d, ty, g, tm, b, e) => await addDoc(collection(db, "challenges"), { title: t, description: d, challengeType: ty, goal_miles: parseFloat(g), badge_icon: b, expires_at: Timestamp.fromDate(new Date(e)), created_at: serverTimestamp(), status: 'active' });

/**
 * Exposes internal module functions to the global window scope.
 * Required for static HTML onclick events to trigger module logic.
 */
window.viewSquadIntel = (id) => fetchSquadDetails(id);
window.handleDisband = (id, name) => { 
    if(confirm(`☢️ COMMAND OVERRIDE: Decommission unit [${name}]?`)) {
        deleteDoc(doc(db, "squads", id)).then(() => fetchLocalSquads()); 
    }
};
window.handleLeave = (id, name) => leaveSquad(id, name);
window.handleViewProfile = (uid) => showPublicProfile(uid);
window.showMeetupsList = (name) => { 
    document.getElementById('viewMeetupsLocationName').innerText = name; 
    document.getElementById('viewMeetupsModal').style.display = 'flex'; 
};
window.requestToJoinSquad = (id) => {
    if (!state.currentUser) return alert("Log in to join units.");
    updateDoc(doc(db, "squads", id), { 
        members: arrayUnion(state.currentUser.uid), 
        memberCount: increment(1) 
    }).then(() => {
        alert("Entry Accepted.");
        fetchSquadDetails(id);
    });
};

/**
 * VISUALIZATION ENGINE: The Swarm Pulse
 * Queries the last 48 hours of missions and updates the opacity of sector layers
 * to create a "heat map" effect of recent activity.
 */
export async function updateSwarmPulse() {
    try {
        const publishedRoutesRef = collection(db, "publishedRoutes");
        // Calculate timestamp for 48 hours ago
        const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
        
        const q = query(publishedRoutesRef, where("timestamp", ">=", twoDaysAgo));
        const querySnapshot = await getDocs(q);
        
        // Initialize counters for the 5 key sectors
        const activityLog = { 'RP-01': 0, 'RP-02': 0, 'RP-03': 0, 'RP-04': 0, 'RP-05': 0 };

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            // Use the starting point of the route to determine the sector
            if (data.route && Array.isArray(data.route) && data.route.length > 0) {
                // GeoJSON format is [lng, lat]
                const firstPoint = data.route[0];
                const sectorId = getSectorFromCoords(firstPoint[0], firstPoint[1]); 
                
                if (sectorId && activityLog.hasOwnProperty(sectorId)) {
                    activityLog[sectorId]++;
                }
            }
        });

        // Update the Mapbox layer paint properties dynamically
        Object.entries(activityLog).forEach(([id, count]) => {
            const layerId = `layer-${id}`; // Assumes layers are named 'layer-RP-01', etc.
            
            if (state.map && state.map.getLayer(layerId)) {
                // Opacity Logic:
                // 0 activity = 0.15 (Base visibility)
                // 1-2 missions = 0.25 (Light glow)
                // 3+ missions = 0.45 (High intensity glow)
                const opacity = count >= 3 ? 0.45 : (count > 0 ? 0.25 : 0.15);
                
                state.map.setPaintProperty(layerId, 'fill-opacity', opacity);
            }
        });
        
        console.log("Swarm Pulse Updated:", activityLog);

    } catch (err) {
        console.error("Swarm Pulse Engine Failure:", err);
    }
}

/**
 * CRITICAL MATH: Determines sector based on GPS coordinates.
 * Includes custom polygon logic for the West Side Ridge (RP-05).
 */
function getSectorFromCoords(lon, lat) {
    // West Side (RP-05) Custom Sloped Boundary Logic
    // Calculates the "Ridge Curb" line to separate RP-05 from RP-04
    const ridgeBoundary = -87.6765 + ((lat - 41.9975) * ((-87.6833 - -87.6765) / (42.0190 - 41.9975)));
    
    // Check if point is WEST of the Ridge Line (RP-05)
    if (lat >= 41.9975 && lat <= 42.0190 && lon >= ridgeBoundary && lon <= -87.6750) {
        return 'RP-05';
    }
    
    // Check standard rectangular sectors (RP-01 to RP-04) from config
    for (const [id, bounds] of Object.entries(RP_SECTORS)) {
        if (id === 'RP-05') continue; // Already checked above
        
        if (lat >= bounds.minLat && lat <= bounds.maxLat &&
            lon >= bounds.minLon && lon <= bounds.maxLon) {
            return id;
        }
    }
    return null;
}
