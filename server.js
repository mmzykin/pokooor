// server.js - Backend server for Smokers Connection Telegram Mini App
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Path to our JSON database file
const DB_FILE = path.join(__dirname, 'db.json');

// Initialize database if it doesn't exist
function initDatabase() {
  if (!fs.existsSync(DB_FILE)) {
    const initialData = {
      users: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
    console.log('Database file created');
  }
}

// Read the database
function readDatabase() {
  const data = fs.readFileSync(DB_FILE, 'utf8');
  return JSON.parse(data);
}

// Write to the database
function writeDatabase(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Initialize the database
initDatabase();

// API Routes

// Register or update user
app.post('/api/users', (req, res) => {
  try {
    const { telegramId, username, firstName, lastName } = req.body;
    
    // Read current data
    const data = readDatabase();
    
    // Find user or create new one
    const userIndex = data.users.findIndex(user => user.telegramId === telegramId);
    
    if (userIndex >= 0) {
      // Update existing user
      data.users[userIndex] = {
        ...data.users[userIndex],
        username,
        firstName,
        lastName,
        lastActive: new Date().toISOString()
      };
    } else {
      // Create new user
      data.users.push({
        telegramId,
        username,
        firstName,
        lastName,
        location: {
          type: "Point",
          coordinates: [0, 0] // [longitude, latitude]
        },
        needsCigarette: false,
        lastActive: new Date().toISOString(),
        createdAt: new Date().toISOString()
      });
    }
    
    // Save updated data
    writeDatabase(data);
    
    // Return the user
    const user = data.users.find(user => user.telegramId === telegramId);
    res.status(200).json(user);
  } catch (error) {
    console.error('Error saving user:', error);
    res.status(500).json({ error: 'Failed to save user data' });
  }
});

// Update user location
app.post('/api/users/:telegramId/location', (req, res) => {
  try {
    const { telegramId } = req.params;
    const { latitude, longitude } = req.body;
    
    // Read current data
    const data = readDatabase();
    
    // Find user
    const userIndex = data.users.findIndex(user => user.telegramId === telegramId);
    
    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Update location
    data.users[userIndex].location.coordinates = [longitude, latitude];
    data.users[userIndex].lastActive = new Date().toISOString();
    
    // Save updated data
    writeDatabase(data);
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error updating location:', error);
    res.status(500).json({ error: 'Failed to update location' });
  }
});

// Toggle "needs cigarette" status
app.post('/api/users/:telegramId/toggle-cigarette', (req, res) => {
  try {
    const { telegramId } = req.params;
    
    // Read current data
    const data = readDatabase();
    
    // Find user
    const userIndex = data.users.findIndex(user => user.telegramId === telegramId);
    
    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Toggle status
    data.users[userIndex].needsCigarette = !data.users[userIndex].needsCigarette;
    data.users[userIndex].lastActive = new Date().toISOString();
    
    // Save updated data
    writeDatabase(data);
    
    res.status(200).json({ needsCigarette: data.users[userIndex].needsCigarette });
  } catch (error) {
    console.error('Error toggling cigarette status:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// Find nearby smokers
app.get('/api/users/:telegramId/nearby-smokers', (req, res) => {
  try {
    const { telegramId } = req.params;
    const maxDistance = req.query.distance || 5; // Default 5km
    
    // Read current data
    const data = readDatabase();
    
    // Find user
    const user = data.users.find(user => user.telegramId === telegramId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Find nearby users who need cigarettes
    const nearbySmokers = data.users.filter(smoker => {
      // Exclude current user
      if (smoker.telegramId === telegramId) {
        return false;
      }
      
      // Only include users who need cigarettes
      if (!smoker.needsCigarette) {
        return false;
      }
      
      // Calculate distance
      const distance = calculateDistance(
        user.location.coordinates[1], // latitude
        user.location.coordinates[0], // longitude
        smoker.location.coordinates[1], // latitude
        smoker.location.coordinates[0] // longitude
      );
      
      // Add distance to smoker object
      smoker.distance = distance;
      
      // Only include if within maxDistance
      return distance <= maxDistance;
    });
    
    // Sort by distance
    nearbySmokers.sort((a, b) => a.distance - b.distance);
    
    // Format response to hide sensitive info
    const formattedUsers = nearbySmokers.map(smoker => ({
      id: smoker.telegramId,
      username: smoker.username,
      firstName: smoker.firstName,
      distance: smoker.distance
    }));
    
    res.status(200).json(formattedUsers);
  } catch (error) {
    console.error('Error finding nearby smokers:', error);
    res.status(500).json({ error: 'Failed to find nearby smokers' });
  }
});

// Get all users (for debugging)
app.get('/api/users', (req, res) => {
  try {
    const data = readDatabase();
    res.status(200).json(data.users);
  } catch (error) {
    console.error('Error getting users:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// Helper function to calculate distance between coordinates in kilometers
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return parseFloat((R * c).toFixed(2)); // Distance in km, rounded to 2 decimal places
}

function deg2rad(deg) {
  return deg * (Math.PI/180);
}

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
