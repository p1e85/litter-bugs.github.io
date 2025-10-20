import { db, collection, addDoc, getDocs, query, orderBy, doc, getDoc, deleteDoc } from './firebase.js';
import { state } from './config.js';
import { convertPinsForFirestore, convertPinsFromFirestore, convertRouteForFirestore, convertRouteFromFirestore } from './utils.js';
import { createAndAddMarker, updateUserPinsSource, toggleMarkerVisibility } from './map.js'; // Ensure toggleMarkerVisibility is imported

export async function saveSession() {
  const dataModal = document.getElementById('dataModal');
  const sessionName = prompt("Name this Litter Bugs session:", `Cleanup on ${new Date().toLocaleDateString()}`);
  if (!sessionName) return;

  if (!state.currentUser) {
    const guestSessions = JSON.parse(localStorage.getItem('guestSessions')) || [];
    guestSessions.push({
      sessionName,
      timestamp: new Date().toISOString(),
      pins: convertPinsForFirestore(state.photoPins),
      route: convertRouteForFirestore(state.routeCoordinates)
    });
    localStorage.setItem('guestSessions', JSON.stringify(guestSessions));
    alert(`Session "${sessionName}" saved locally.`);
    dataModal.style.display = 'none';
    return;
  }

  try {
    await addDoc(collection(db, "users", state.currentUser.uid, "privateSessions"), {
      sessionName,
      timestamp: new Date(),
      pins: convertPinsForFirestore(state.photoPins),
      route: convertRouteForFirestore(state.routeCoordinates)
    });
    alert(`Session "${sessionName}" saved to your account!`);
    dataModal.style.display = 'none';
  } catch (error) {
    console.error("Error saving session:", error);
    alert("Could not save session.");
  }
}

export async function loadSession() {
  if (!state.currentUser) {
    populateLocalSessionList();
    document.getElementById('localSessionsModal').style.display = 'flex';
  } else {
    await populateSessionList();
    document.getElementById('sessionsModal').style.display = 'flex';
  }
}

function populateLocalSessionList() {
  const localSessionList = document.getElementById('localSessionList');
  const guestSessions = JSON.parse(localStorage.getItem('guestSessions')) || [];
  localSessionList.innerHTML = '';

  if (guestSessions.length === 0) {
    localSessionList.innerHTML = '<li>No locally saved sessions found.</li>';
    return;
  }

  guestSessions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).forEach((sessionData, index) => {
    const li = document.createElement('li');
    li.innerHTML = `<div><span>${sessionData.sessionName}</span><br><small class="session-date">${new Date(sessionData.timestamp).toLocaleDateString()}</small></div><button class="delete-session-btn">Delete</button>`;
    li.querySelector('div').addEventListener('click', () => loadSpecificLocalSession(index));
    li.querySelector('button').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteLocalSession(index, sessionData.sessionName);
    });
    localSessionList.appendChild(li);
  });
}

function deleteLocalSession(sessionIndex, sessionName) {
  if (confirm(`Are you sure you want to delete "${sessionName}"?`)) {
    let guestSessions = JSON.parse(localStorage.getItem('guestSessions')) || [];
    guestSessions.splice(sessionIndex, 1);
    localStorage.setItem('guestSessions', JSON.stringify(guestSessions));
    alert("Session deleted.");
    populateLocalSessionList();
  }
}

function loadSpecificLocalSession(sessionIndex) {
  const guestSessions = JSON.parse(localStorage.getItem('guestSessions')) || [];
  const sessionData = guestSessions[sessionIndex];
  if (sessionData) {
    clearCurrentSession();
    const convertedData = {
      ...sessionData,
      pins: convertPinsFromFirestore(sessionData.pins),
      route: convertRouteFromFirestore(sessionData.route)
    };
    displaySessionData(convertedData);
    alert(`Session "${sessionData.sessionName}" loaded!`);
    document.getElementById('localSessionsModal').style.display = 'none';
    document.getElementById('centerOnRouteBtn').classList.remove('disabled');
    document.getElementById('dataModal').style.display = 'flex';
  }
}

async function populateSessionList() {
  const sessionList = document.getElementById('sessionList');
  sessionList.innerHTML = '<li>Loading...</li>';
  try {
    const q = query(collection(db, "users", state.currentUser.uid, "privateSessions"), orderBy("timestamp", "desc"));
    const querySnapshot = await getDocs(q);
    sessionList.innerHTML = '';
    if (querySnapshot.empty) {
      sessionList.innerHTML = '<li>No saved cloud sessions found.</li>';
      return;
    }
    querySnapshot.forEach(doc => {
      const sessionData = doc.data();
      const li = document.createElement('li');
      li.innerHTML = `<div><span>${sessionData.sessionName}</span><br><small class="session-date">${new Date(sessionData.timestamp.seconds * 1000).toLocaleDateString()}</small></div><button class="delete-session-btn">Delete</button>`;
      li.querySelector('div').addEventListener('click', () => loadSpecificSession(doc.id));
      li.querySelector('button').addEventListener('click', (e) => {
        e.stopPropagation();
        deletePrivateSession(doc.id, sessionData.sessionName);
      });
      sessionList.appendChild(li);
    });
  } catch (error) {
    console.error("Error fetching sessions:", error);
    sessionList.innerHTML = '<li>Could not load sessions.</li>';
  }
}

async function deletePrivateSession(sessionId, sessionName) {
  if (confirm(`Are you sure you want to delete "${sessionName}"?`)) {
    try {
      await deleteDoc(doc(db, "users", state.currentUser.uid, "privateSessions", sessionId));
      alert("Session deleted.");
      populateSessionList();
    } catch (error) {
      console.error("Error deleting session:", error);
      alert("Failed to delete session.");
    }
  }
}

async function loadSpecificSession(sessionId) {
  try {
    const docSnap = await getDoc(doc(db, "users", state.currentUser.uid, "privateSessions", sessionId));
    if (docSnap.exists()) {
      clearCurrentSession();
      const sessionData = docSnap.data();
      displaySessionData({
          ...sessionData,
          pins: convertPinsFromFirestore(sessionData.pins),
          route: convertRouteFromFirestore(sessionData.route)
      });
      alert(`Session "${sessionData.sessionName}" loaded!`);
      document.getElementById('sessionsModal').style.display = 'none';
      document.getElementById('centerOnRouteBtn').classList.remove('disabled');
      document.getElementById('dataModal').style.display = 'flex';
    }
  } catch (error) {
    console.error("Error loading specific session:", error);
    alert("Failed to load session.");
  }
}

export function clearCurrentSession() {
  // Simple version from earlier
  state.userMarkers.forEach(marker => marker.remove());
  state.userMarkers = [];
  state.photoPins = [];
  state.routeCoordinates = [];
  if (typeof updateUserPinsSource === 'function') {
      updateUserPinsSource();
  }
  if (state.map && state.map.getSource('user-route')) {
    state.map.getSource('user-route').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: [] } });
  }
  const centerBtn = document.getElementById('centerOnRouteBtn');
  if (centerBtn) { // Added safety check
      centerBtn.classList.add('disabled');
  }
}

function displaySessionData(data) {
  state.photoPins = data.pins || [];
  state.routeCoordinates = data.route || [];

  state.photoPins.forEach(pin => createAndAddMarker(pin, 'user'));
  if (typeof updateUserPinsSource === 'function') {
      updateUserPinsSource();
  }

  if (state.map && state.map.getSource('user-route')) {
    state.map.getSource('user-route').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: state.routeCoordinates } });
  }

  // Call toggleMarkerVisibility immediately after adding markers
  if (typeof toggleMarkerVisibility === 'function') {
      toggleMarkerVisibility();
  }
}

export function exportGeoJSON() {
  const now = new Date();
  const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
  const fileName = `litter_bugs_data_${timestamp}.geojson`;

  const pinFeatures = state.photoPins.map(pin => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: pin.coords },
    properties: { title: pin.title, image_url: pin.imageURL || 'local_data', category: pin.category }
  }));
  const routeFeature = {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: state.routeCoordinates },
    properties: {}
  };

  const geojson = { type: 'FeatureCollection', features: [...pinFeatures, routeFeature] };
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(geojson, null, 2));

  const downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.setAttribute("href", dataStr);
  downloadAnchorNode.setAttribute("download", fileName);
  document.body.appendChild(downloadAnchorNode);
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
  document.getElementById('dataModal').style.display = 'none';
}
