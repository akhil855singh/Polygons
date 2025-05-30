let map;
let infoWindow;  // To show the label on hover
let polygonCache = {};  // Cache for polygons based on bounding box
let renderedPolygons = new Set();  // Set to track rendered polygons
let lastBounds = null;  // Store the bounds of the last API call
let visitedBounds = new Set();  // Track already visited bounds

// Debounce timer variable
let debounceTimer;
const DEBOUNCE_DELAY = 1000; // Adjust delay as needed (300ms is a common value)

// Initialize map
function initMap() {
    const mapOptions = {
        center: { lat: 28.5383, lng: -81.3792 },  // Centered at Orlando, FL
        zoom: 8
    };

    // Initialize the map
    map = new google.maps.Map(document.getElementById('map'), mapOptions);

    // Initialize the InfoWindow for displaying the label
    infoWindow = new google.maps.InfoWindow();

    // Add listener for the bounds_changed event with debouncing
    google.maps.event.addListener(map, 'bounds_changed', debounce(loadPolygonsInView, DEBOUNCE_DELAY));

    // Initial call to load polygons when the map first loads
    loadPolygonsInView();
}

// Debounce function to limit the rate of function execution
function debounce(func, delay) {
    return function (...args) {
        clearTimeout(debounceTimer); // Clear the previous timer
        debounceTimer = setTimeout(() => func(...args), delay); // Set a new timer
    };
}

// Function to load polygons within the current map bounds
function loadPolygonsInView() {
    const bounds = map.getBounds();
    if (!bounds) {
        console.log("Bounds not available.");
        return;
    }

    // Check the zoom level, and only fetch polygons if the zoom level is greater than 8
    const zoomLevel = map.getZoom();
    if (zoomLevel <= 7) {
        console.log("Zoom level is too low, skipping polygon fetch.");
        return;  // Do not fetch polygons if zoom level is 8 or lower
    }

    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();

    // Apply floor and ceil to create a more coarse-grained bounding box for caching
    const minLat = Math.floor(sw.lat());  
    const minLng = Math.floor(sw.lng()); 
    const maxLat = Math.ceil(ne.lat());  // Ceiled to 2 decimal places
    const maxLng = Math.ceil(ne.lng());  // Ceiled to 2 decimal places

    // Cache key now based on floored/ceiled bounds
    const cacheKey = `${minLat},${minLng},${maxLat},${maxLng}`;

    // Check if the polygons for this bounding box are already cached
    if (polygonCache[cacheKey]) {
        //console.log("Using cached polygons...");
        renderPolygons(polygonCache[cacheKey]);
        return;
    }

    // Check if the new bounds are outside the last loaded bounds
    if (lastBounds && isBoundsInside(lastBounds, minLat, minLng, maxLat, maxLng)) {
        //console.log("New bounds are within the previously loaded bounds. Skipping fetch.");
        return;  // Skip fetch if the new bounds are inside the last bounds
    }

    // Mark bounds as visited and avoid future requests for the same area
    const boundsKey = `${minLat},${minLng},${maxLat},${maxLng}`;
    if (visitedBounds.has(boundsKey)) {
       // console.log("Bounds already visited, skipping...");
        return;
    }
    visitedBounds.add(boundsKey);

    // Divide the bounds into 10 smaller sub-bounds and call the API asynchronously for each
    const subBounds = divideBounds(minLat, minLng, maxLat, maxLng, 10);
    
    // Make asynchronous calls for each sub-bound and render each result as soon as it's received
    subBounds.forEach(subBound => {
        fetchPolygons(subBound)
            .then(polygons => {
                // Immediately render the polygons once they are received
                if (polygons.length > 0) {
                   // console.log('Polygons received:', polygons);
                    renderPolygons(polygons);
                }
            })
            .catch(error => {
                console.error('Error fetching polygons for sub-bound:', error);
            });
    });

    // Cache the entire set of polygons after all have been rendered
    polygonCache[cacheKey] = [];
}

// Function to divide the current bounds into sub-bounds
function divideBounds(minLat, minLng, maxLat, maxLng, numDivisions) {
    const latStep = (maxLat - minLat) / Math.ceil(Math.sqrt(numDivisions));
    const lngStep = (maxLng - minLng) / Math.ceil(Math.sqrt(numDivisions));

    const subBounds = [];
    for (let lat = minLat; lat < maxLat; lat += latStep) {
        for (let lng = minLng; lng < maxLng; lng += lngStep) {
            subBounds.push({
                minLat: lat,
                minLng: lng,
                maxLat: Math.min(lat + latStep, maxLat),
                maxLng: Math.min(lng + lngStep, maxLng),
            });
        }
    }
    return subBounds;
}

// Function to fetch polygons for a given sub-bound
function fetchPolygons({ minLat, minLng, maxLat, maxLng }) {
    return fetch(`/polygons?minLat=${minLat}&minLng=${minLng}&maxLat=${maxLat}&maxLng=${maxLng}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(polygons => {
            //console.log(`Polygons for sub-bound (${minLat}, ${minLng}, ${maxLat}, ${maxLng}):`, polygons);
            return polygons;
        })
        .catch(error => {
            console.error('Error fetching polygons for sub-bound:', error);
            return [];  // Return an empty array if there's an error
        });
}

// Function to check if the new bounds are inside the previously loaded bounds
function isBoundsInside(lastBounds, minLat, minLng, maxLat, maxLng) {
    return (
        minLat >= lastBounds.minLat &&
        minLng >= lastBounds.minLng &&
        maxLat <= lastBounds.maxLat &&
        maxLng <= lastBounds.maxLng
    );
}

// Function to render polygons on the map using Google Maps Data layer
function renderPolygons(polygons) {
    if (polygons.length === 0) {
        //console.log("No polygons to render.");
        return;
    }

    

    // Create a new Google Maps Data layer
    const dataLayer = new google.maps.Data();
    dataLayer.setMap(map);  // Add the data layer to the map

    // Loop through each polygon and add it to the Data layer
    polygons.forEach(polygonData => {
        const polygonId = polygonData.id;  // Get the polygon ID

        // Skip rendering if the polygon has already been rendered
        if (renderedPolygons.has(polygonId)) {
           // console.log(`Polygon with ID ${polygonId} already rendered. Skipping...`);
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

       //console.log(`Polygon with ID ${polygonId} rendered.`);
    });

    // Set style for the polygons based on status
    dataLayer.setStyle(function(feature) {
        const status = feature.getProperty('status');
        const { color, label } = getStatusStyle(status);  // Get color and label based on status
        
        return {
            fillColor: color,
            fillOpacity: 0.5,   // Make the polygon semi-transparent
            strokeColor: '#000000',  // Black border
            strokeWeight: 0.5,
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

    return statusMap[status] || { label: "Unknown", color: "rgb(0, 0, 0)" }; // Default to black
}

// Wait for the DOM to be fully loaded before initializing the map
google.maps.event.addDomListener(window, 'load', initMap);
