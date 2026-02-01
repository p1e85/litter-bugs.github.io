// --- APPLICATION STATE ---
// Centralized state object to be shared across modules. Exporting a single
// object makes it easy to import and modify state from anywhere in the app
// while keeping it organized.
export const state = {
    currentUser: null,
    trackingWatcher: null,
    routeCoordinates: [],
    photoPins: [],
    map: null,
    findMeMarker: null,
    isCommunityViewOn: false,
    communityLayers: [],
    isSignUpMode: true,
    userMarkers: [],
    communityMarkers: [],
    trackingStartTime: null,
    currentStyleIndex: 0,
    findMeState: 0, // 0: off, 1: centered, 2: centered and heading-oriented
    cleanupPhoto: null,
};

// --- CONSTANTS ---
// Application-wide constants that do not change during runtime.

export const ZOOM_THRESHOLD = 14;

export const profanityList = ["word1", "word2", "word3"];

export const mapStyles = [
    { name: 'Streets', url: 'mapbox://styles/mapbox/streets-v12' },
    { name: 'Outdoors', url: 'mapbox://styles/mapbox/outdoors-v12' },
    { name: 'Light', url: 'mapbox://styles/mapbox/light-v11' },
    { name: 'Dark', url: 'mapbox://styles/mapbox/dark-v11' },
    { name: 'Satellite', url: 'mapbox://styles/mapbox/satellite-streets-v12' }
];

export const pinCategories = {
  'Plastic': ['Bottle', 'Container', 'Bag', 'Film/Wrapper', 'Foam', 'Hard Fragment', 'Other'],
  'Glass': ['Bottle', 'Jar', 'Broken Shards', 'Other'],
  'Metal': ['Aluminum Can', 'Steel Can', 'Foil', 'Scrap', 'Other'],
  'Paper': ['Cup', 'Packaging', 'Towel/Tissue', 'Print (Flyer/etc)', 'Other'],
  'Cardboard': ['Box', 'Food Packaging', 'Drink Carrier', 'Other'],
  'Fabric/Textiles': ['Clothing', 'Mask', 'Other'],
  'Rubber': ['Tire', 'Glove', 'Band', 'Other'],
  'Wood': ['Construction Scrap', 'Furniture Fragment', 'Other'],
  'Organic': ['Food Waste', 'Yard Waste', 'Other'],
  'E-waste': ['Battery', 'Small Electronic', 'Wire/Cable', 'Other'],
  'Other': ['General Litter'] // Keep 'Other' simple
};

export const allBadges = {
    first_find: { name: 'First Find', icon: '🗑️', description: 'Pinned your very first piece of litter.' },
    collector: { name: 'Collector', icon: '🛍️', description: 'Pinned a total of 50 items.' },
    super_collector: { name: 'Super Collector', icon: '🏆', description: 'Pinned a total of 250 items.' },
    eagle_eye: { name: 'Eagle Eye', icon: '🦅', description: 'Pinned 1000 items. A true garbage spotter!' },
    first_steps: { name: 'First Steps', icon: '👟', description: 'Completed your first route over 1km.' },
    explorer: { name: 'Explorer', icon: '🗺️', description: 'Walked a total of 25 kilometers.' },
    trailblazer: { name: 'Trailblazer', icon: '⛰️', description: 'Walked a total of 100 kilometers.' },
    marathoner: { name: 'Marathoner', icon: '🏃', description: 'Walked over 42.2km in a single session.' },
    initiate: { name: 'Initiate', icon: '🌱', description: 'Published your first route to the community.' },
    activist: { name: 'Activist', icon: '🌍', description: 'Published 10 routes to the community.' },
    guardian: { name: 'Guardian', icon: '🛡️', description: 'Published 50 routes to the community.' },
    community_pillar: { name: 'Community Pillar', icon: '🏛️', description: 'Published 100 routes. You are a legend!' }
    

};

export const allTitles = {
    // --- EARLY ACCESS ---
    'og_9': { name: "The Original Nine", requirement: "One of the first 9 Troopers to join." },
    'beta_trooper': { name: "Beta Trooper", requirement: "Joined during the initial testing phase." },
    'founding_member': { name: "Founding Member", requirement: "Signed up in the first month of launch." },

    // --- ITEM MILESTONES (The "Pin" Counts) ---
    'scout': { name: "Scout", requirement: "Pinned 10 items." },
    'trash_wizard': { name: "Trash Wizard", requirement: "Achievement: Pinned 50 items." },
    'eco_legend': { name: "Eco Legend", requirement: "Achievement: Pinned 100 items." },
    'waste_wrangler': { name: "Waste Wrangler", requirement: "Achievement: Pinned 250 items." },
    'debris_destroyer': { name: "Debris Destroyer", requirement: "Achievement: Pinned 500 items." },
    'planet_guardian': { name: "Planet Guardian", requirement: "Achievement: Pinned 1,000 items." },

    // --- DISTANCE & ROUTE MILESTONES ---
    'litter_warrior': { name: "Litter Warrior", requirement: "Completed 10 cleanup routes." },
    'trail_blazer': { name: "Trail Blazer", requirement: "Completed 25 cleanup routes." },
    'road_runner': { name: "Road Runner", requirement: "Completed 50 cleanup routes." },
    'marathon_trooper': { name: "Marathon Trooper", requirement: "Cleaned over 26.2 total miles." },

    // --- NEIGHBORHOOD & GEOGRAPHIC ---
    'rp_pioneer': { name: "Rogers Park Pioneer", requirement: "Completed 5 routes in Rogers Park." },
    'north_side_nav': { name: "North Side Navigator", requirement: "Completed 10 routes in North Side sectors." },
    'city_scout': { name: "City Scout", requirement: "Published routes in 3 different neighborhoods." },

    // --- SPECIALTY & BEHAVIORAL ---
    'photo_pro': { name: "Photo Pro", requirement: "Took 25+ cleanup photos." },
    'event_host': { name: "Squad Leader", requirement: "Hosted your first community meetup." },
    'early_bird': { name: "Early Bird", requirement: "Completed 5 cleanups before 9:00 AM." },
    'night_owl': { name: "Night Owl", requirement: "Completed 5 cleanups after 7:00 PM." }
};
