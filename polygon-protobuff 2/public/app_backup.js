let map;
let infoWindow;  // To show the label on hover
let polygonCache = {};  // Cache for polygons based on bounding box
let renderedPolygons = new Set();  // Set to track rendered polygons

function initMap() {
    const mapOptions = {
        center: { lat: 28.5383, lng: -81.3792 },  // Centered at Orlando, FL
        zoom: 10
    };

    // Initialize the map
    map = new google.maps.Map(document.getElementById('map'), mapOptions);

    // Initialize the InfoWindow for displaying the label
    infoWindow = new google.maps.InfoWindow();

    // Add listener for the bounds_changed event to trigger fetching polygons when the map bounds change
    google.maps.event.addListener(map, 'bounds_changed', function () {
        console.log('Bounds changed. Loading polygons...');
        loadPolygonsInView();  // Call to fetch polygons
    });

    // Initial call to load polygons when the map first loads
    loadPolygonsInView();
}

// Function to load polygons within the current map bounds
function loadPolygonsInView() {
    const bounds = map.getBounds();
    if (!bounds) {
        console.log("Bounds not available.");
        return;
    }

    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();

    // Apply floor and ceil to create a more coarse-grained bounding box for caching
    const minLat = Math.floor(sw.lat() * 100) / 100;  // Floored to 2 decimal places
    const minLng = Math.floor(sw.lng() * 100) / 100; // Floored to 2 decimal places
    const maxLat = Math.ceil(ne.lat() * 100) / 100;  // Ceiled to 2 decimal places
    const maxLng = Math.ceil(ne.lng() * 100) / 100;  // Ceiled to 2 decimal places

    // Cache key now based on floored/ceiled bounds
    const cacheKey = `${minLat},${minLng},${maxLat},${maxLng}`;

    // Check if the polygons for this bounding box are already cached
    if (polygonCache[cacheKey]) {
        console.log("Using cached polygons...");
        renderPolygons(polygonCache[cacheKey]);
        return;
    }

    // Fetch polygons from the server only if not cached
    console.log('Fetching polygons within bounds:', minLat, minLng, maxLat, maxLng);

    fetch(`/polygons?minLat=${minLat}&minLng=${minLng}&maxLat=${maxLat}&maxLng=${maxLng}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(polygons => {
            console.log('Polygons within bounding box:', polygons);
            
            // Cache the fetched polygons
            polygonCache[cacheKey] = polygons;

            renderPolygons(polygons);  // Render the polygons
        })
        .catch(error => {
            console.error('Error loading polygons:', error);
        });
}

// Function to render polygons on the map using Google Maps Data layer
function renderPolygons(polygons) {
    if (polygons.length === 0) {
        console.log("No polygons to render.");
        return;
    }

    console.log(polygons);

    // Create a new Google Maps Data layer
    const dataLayer = new google.maps.Data();
    dataLayer.setMap(map);  // Add the data layer to the map

    // Loop through each polygon and add it to the Data layer
    polygons.forEach(polygonData => {
        const polygonId = polygonData.id;  // Get the polygon ID

        // Skip rendering if the polygon has already been rendered
        if (renderedPolygons.has(polygonId)) {
            console.log(`Polygon with ID ${polygonId} already rendered. Skipping...`);
            return;
        }

        const geoJson = {
            type: "Feature",
            geometry: polygonData.geometry,  // The geometry is passed in GeoJSON format
            properties: {
                id: polygonId,
                status: polygonData.status
            }
        };

        // Add the GeoJSON object to the data layer
        dataLayer.addGeoJson(geoJson);

        // Mark this polygon as rendered
        renderedPolygons.add(polygonId);

        console.log(`Polygon with ID ${polygonId} rendered.`);
    });

    // Set style for the polygons based on status
    dataLayer.setStyle(function(feature) {
        const status = feature.getProperty('status');
        const { color, label } = getStatusStyle(status);  // Get color and label based on status
        
        return {
            fillColor: color,
            fillOpacity: 0.5,   // Make the polygon semi-transparent
            strokeColor: '#000000',  // Black border
            strokeWeight: 2,
            strokeOpacity: 0.8
        };
    });

    // Optional: Listen for mouseover events to display polygon information
    google.maps.event.addListener(dataLayer, 'mouseover', function(event) {
        const feature = event.feature;
        const polygonId = feature.getProperty('id');
        const status = feature.getProperty('status');
        const { label } = getStatusStyle(status);  // Get label for the polygon

        // Set content for the InfoWindow to show the label
        infoWindow.setContent(`<strong>Status:</strong> ${label}<br><strong>Id:</strong>${polygonId}`);
        infoWindow.setPosition(event.latLng);  // Position it at the location of the polygon
        infoWindow.open(map);  // Open the InfoWindow
    });

    // Optional: Listen for mouseout events to handle when the mouse leaves a polygon
    google.maps.event.addListener(dataLayer, 'mouseout', function() {
        // Close the InfoWindow when mouse leaves the polygon
        infoWindow.close();
    });
}

// Function to map status to color and label
function getStatusStyle(status) {
    // Mapping status to color and label based on your provided table
    const statusMap = {
        1: { label: "Low Population", color: "rgb(255, 0, 0)" },  // Red
        2: { label: "Best", color: "rgb(55, 200, 200)" },        // Light Blue
        3: { label: "Good", color: "rgb(105, 200, 100)" },        // Light Green
        4: { label: "OK - Termite", color: "rgb(245, 245, 0)" },  // Yellow
        5: { label: "Good", color: "rgb(105, 100, 200)" },        // Purple
        6: { label: "Good", color: "rgb(155, 100, 100)" },        // Redish
        7: { label: "Do not knock", color: "rgb(255, 0, 0)" },    // Red
        8: { label: "OK", color: "rgb(155, 0, 200)" },            // Purple
        9: { label: "Do not knock", color: "rgb(255, 0, 0)" },    // Red
        10: { label: "Do not knock", color: "rgb(255, 0, 0)" }    // Red
    };

    // Return the corresponding label and color based on status
    return statusMap[status] || { label: "Unknown", color: "rgb(0, 0, 0)" }; // Default to black if status is not found
}

// Wait for the DOM to be fully loaded before initializing the map
google.maps.event.addDomListener(window, 'load', initMap);
