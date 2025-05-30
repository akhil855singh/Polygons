const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mongoose = require('mongoose');
const compression = require('compression');
const { parse } = require('terraformer-wkt-parser');
const app = express();

// Enable CORS
app.use(cors());

// Use compression
app.use(compression());

// Serve static files
app.use(express.static('public'));
const port = 6010;

// MongoDB connection
mongoose.connect('mongodb://mongo:27017/polygondb', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Polygon schema for MongoDB
const polygonSchema = new mongoose.Schema({
  id: String,
  geometry: {
    type: { type: String, enum: ['Polygon', 'MultiPolygon'], required: true },
    coordinates: { type: Array, required: true }
  },
  status: String,
  bbox: {
    type: { 
      type: String,
      enum: ['Polygon'],  // Only support Polygon for bounding box
      required: true
    },
    coordinates: {
      type: Array,
      required: true
    }
  }
}, { timestamps: true });

// Create 2dsphere index on the bbox field for geospatial queries
polygonSchema.index({ bbox: '2dsphere' });

const Polygon = mongoose.model('Polygon', polygonSchema);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Set up multer storage for file upload
const storage = multer.memoryStorage(); // Store file in memory temporarily
const upload = multer({ storage: storage });

// Function to calculate the bounding box in GeoJSON format
const getBoundingBoxGeoJSON = (coordinates) => {
  let minLat = Infinity, maxLat = -Infinity;
  let minLng = Infinity, maxLng = -Infinity;

  // Loop through each coordinate of the polygon
  coordinates.forEach((ring) => {
    ring.forEach(([lng, lat]) => {
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
    });
  });

  // Return the GeoJSON for the bounding box
  return {
    type: "Polygon",
    coordinates: [
      [
        [minLng, minLat], // SW corner
        [maxLng, minLat], // SE corner
        [maxLng, maxLat], // NE corner
        [minLng, maxLat], // NW corner
        [minLng, minLat]  // Closing the polygon (SW corner)
      ]
    ]
  };
};

// Handle polygon upload
app.post('/upload-polygon', upload.single('polygonFile'), async (req, res) => {
  try {
    // Check if the uploaded file is JSON
    if (!req.file || req.file.mimetype !== 'application/json') {
      return res.status(400).json({ message: 'Please upload a valid JSON file.' });
    }

    // Parse the JSON data from the uploaded file buffer
    const data = JSON.parse(req.file.buffer.toString());

    // Iterate over the polygons and convert WKT to GeoJSON
    const validPolygons = [];

    for (const item of data) {
      try {
        // Convert WKT to GeoJSON
        const geojson = parse(item.geometry);

        // Validate the GeoJSON structure (Polygon or MultiPolygon)
        if (!geojson || !['Polygon', 'MultiPolygon'].includes(geojson.type)) {
          console.warn(`Invalid geometry type for ID ${item.id}: ${geojson ? geojson.type : 'undefined'}`);
          continue; // Skip this item and don't save it
        }

        // Calculate the bounding box for this geometry (in GeoJSON format)
        const bboxGeoJSON = getBoundingBoxGeoJSON(geojson.coordinates);

        // If the geometry is valid, add it to the validPolygons array
        validPolygons.push({
          id: item.id,
          status: item.status,
          geometry: geojson,
          bbox: bboxGeoJSON,  // Store the bounding box as GeoJSON
        });
      } catch (error) {
        console.error(`Error parsing WKT for ID ${item.id}:`, error);
        // Optionally, you can add logging for malformed WKT
      }
    }

    // Only save valid polygons to MongoDB
    if (validPolygons.length > 0) {
      await Polygon.insertMany(validPolygons);
      return res.status(200).json({ message: `${validPolygons.length} valid polygons uploaded and saved to MongoDB.` });
    } else {
      return res.status(400).json({ message: 'No valid polygons to save.' });
    }

  } catch (error) {
    console.error('Error uploading file:', error);
    return res.status(500).json({ message: 'Error uploading file.', error });
  }
});

// Add GET route to retrieve polygons from MongoDB within a specified bounding box
app.get('/polygons', async (req, res) => {
  try {
    const { minLat, minLng, maxLat, maxLng } = req.query;

    if (!minLat || !minLng || !maxLat || !maxLng) {
      return res.status(400).json({ message: 'Please provide valid bounding box parameters (minLat, minLng, maxLat, maxLng).' });
    }

    // Use the bounding box to filter polygons
    const polygons = await Polygon.find({
      bbox: {
        $geoIntersects: {
          $geometry: {
            type: "Polygon",
            coordinates: [
              [
                [minLng, minLat], // SW corner
                [maxLng, minLat], // SE corner
                [maxLng, maxLat], // NE corner
                [minLng, maxLat], // NW corner
                [minLng, minLat]  // Closing the polygon (SW corner)
              ]
            ]
          }
        }
      }
    });

    return res.status(200).json(polygons);
  } catch (error) {
    console.error('Error fetching polygons:', error);
    return res.status(500).json({ message: 'Error fetching polygons', error });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
