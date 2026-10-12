require('dotenv').config();

const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const User = require('./models/User');
const Route = require('./models/Route');
const Telemetry = require('./models/Telemetry');

const app = express();
app.use(cors());
app.use(express.json());

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://shamiuday02_db_user:vH7FxMFHNNRF6zXF@onboard.c25srzt.mongodb.net/?appName=onboard";
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-me';
const TOKEN_LIFETIME = '12h';

if (!process.env.JWT_SECRET) {
  console.warn('WARNING: JWT_SECRET is not set in environment. Using fallback secret.');
}

mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB Connected Successfully'))
  .catch((err) => console.error('MongoDB Connection Failed:', err));

// --- HELPER: TIME PARSER ---
// Parses human transit times ("6.50 AM", "06:50 AM", "7:05 AM", "12:30 PM", "1.15 PM") into minutes from midnight
function parseTimeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  
  const clean = timeStr.trim().toUpperCase();
  const match = clean.match(/^(\d{1,2})[:.](\d{2})(?:\s*([AP]M))?/i);
  if (!match) return 0;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3];

  if (period === 'PM' && hours < 12) {
    hours += 12;
  } else if (period === 'AM' && hours === 12) {
    hours = 0;
  }

  return hours * 60 + minutes;
}

// --- AUTH MIDDLEWARE ---
function requireAuth(...roles) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    try {
      const payload = jwt.verify(token, JWT_SECRET);
      if (roles.length && !roles.includes(payload.role)) {
        return res.status(403).json({ success: false, message: 'You do not have permission for this action' });
      }
      req.user = payload;
      next();
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Session expired or invalid. Please log in again' });
    }
  };
}

// --- API ENDPOINTS ---

// 1. GET ALL ROUTES
app.get('/api/routes', async (req, res) => {
  try {
    const twoMinutesAgo = new Date(Date.now() - 120000);

    // Auto-deactivate routes inactive for > 2 minutes and persist to DB
    await Route.updateMany(
      { is_active: true, last_updated: { $lt: twoMinutesAgo } },
      { $set: { is_active: false } }
    );

    const routes = await Route.find({}).sort({ route_id: 1 });
    
    // Ensure stops within each route are consistently sorted by sequence
    const normalized = routes.map(r => {
      const obj = r.toObject();
      if (obj.stops && Array.isArray(obj.stops)) {
        obj.stops.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
      }
      return obj;
    });

    res.json(normalized);
  } catch (err) {
    console.error('Failed to fetch routes:', err);
    res.status(500).json({ error: 'Failed to fetch routes' });
  }
});

// 2. AUTHENTICATION LOGIN
app.post('/api/auth/login', async (req, res) => {
  const { user_id, password } = req.body || {};

  if (!user_id || !password) {
    return res.status(400).json({ success: false, message: 'User ID and password are required' });
  }

  try {
    const cleanUserId = user_id.trim();
    const cleanPassword = password.trim();

    const user = await User.findOne({ 
      user_id: { $regex: new RegExp(`^${cleanUserId}$`, 'i') } 
    });

    if (!user || user.password !== cleanPassword) {
      return res.status(400).json({ success: false, message: 'Invalid credentials. Please check your ID and password.' });
    }

    const role = user.role.toLowerCase();
    const token = jwt.sign(
      { user_id: user.user_id, role, name: user.name },
      JWT_SECRET,
      { expiresIn: TOKEN_LIFETIME }
    );

    return res.json({
      success: true,
      role,
      user_id: user.user_id,
      name: user.name,
      token,
      message: 'Authentication successful'
    });
  } catch (err) {
    console.error('Server error during login:', err);
    return res.status(500).json({ success: false, message: 'Server error during login' });
  }
});

// 3. LIVE TELEMETRY BROADCAST (drivers OR demo simulation)
app.post('/api/telemetry', async (req, res) => {
  const { route_id, lat, lng, speed, is_active, is_demo } = req.body || {};
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  let driver_id = 'SIM-001';
  let driver_name = 'Demo Driver';

  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      driver_id = payload.user_id;
      driver_name = payload.name || driver_id;
    } catch (err) {
      if (!is_demo) {
        return res.status(401).json({ success: false, message: 'Session expired or invalid' });
      }
    }
  } else if (!is_demo) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  if (!route_id) {
    return res.status(400).json({ success: false, message: 'route_id is required' });
  }

  try {
    const route = await Route.findOne({ route_id });
    if (!route) {
      return res.status(404).json({ success: false, message: `Route '${route_id}' not found` });
    }

    const activeState = is_active !== undefined ? Boolean(is_active) : true;
    route.is_active = activeState;
    route.last_updated = new Date();
    
    if (activeState) {
      route.assigned_driver = `${driver_name} (${driver_id})`;
    }

    if (lat !== undefined && lng !== undefined) {
      const parsedLat = parseFloat(lat);
      const parsedLng = parseFloat(lng);
      const parsedSpeed = parseFloat(speed) || 0;

      if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
        route.current_location = {
          lat: parsedLat,
          lng: parsedLng,
          speed: parsedSpeed
        };

        if (activeState) {
          Telemetry.create({
            route_id,
            driver_id,
            lat: parsedLat,
            lng: parsedLng,
            speed: parsedSpeed,
            timestamp: new Date()
          }).catch(e => console.warn('Telemetry log creation error:', e.message));
        }
      }
    }

    await route.save();
    return res.json({ 
      success: true, 
      message: activeState ? 'Telemetry updated successfully' : 'Route deactivated successfully',
      is_active: route.is_active,
      assigned_driver: route.assigned_driver,
      route
    });
  } catch (err) {
    console.error('Telemetry update failed:', err);
    return res.status(500).json({ success: false, message: 'Telemetry update failed' });
  }
});

// 4. DEACTIVATE ROUTE EXPLICITLY (drivers, admins, or demo simulator)
app.post('/api/routes/:id/deactivate', async (req, res) => {
  try {
    const route = await Route.findOne({ route_id: req.params.id });
    if (!route) return res.status(404).json({ success: false, message: `Route '${req.params.id}' not found` });
    
    route.is_active = false;
    route.last_updated = new Date();
    await route.save();

    return res.json({ 
      success: true, 
      message: `Route '${req.params.id}' has been deactivated`,
      route 
    });
  } catch (err) {
    console.error('Deactivation error:', err);
    return res.status(500).json({ success: false, message: 'Failed to deactivate route' });
  }
});

// 5. DEACTIVATE ALL ROUTES (testing / reset helper)
app.post('/api/routes/deactivate-all', async (req, res) => {
  try {
    await Route.updateMany({}, { $set: { is_active: false, last_updated: new Date() } });
    return res.json({ success: true, message: 'All active routes have been deactivated' });
  } catch (err) {
    console.error('Reset routes error:', err);
    return res.status(500).json({ success: false, message: 'Failed to deactivate all routes' });
  }
});

// 6. ADD STOP TO ROUTE (admins only) - ARRANGE CHRONOLOGICALLY BY ARRIVAL TIME
app.post('/api/routes/:id/stops', requireAuth('admin'), async (req, res) => {
  const routeId = req.params.id;
  const { name, time, lat, lng } = req.body || {};

  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'Stop name is required' });
  }
  if (!time || !time.trim()) {
    return res.status(400).json({ success: false, message: 'Stop time is required' });
  }

  try {
    const route = await Route.findOne({ route_id: routeId });
    if (!route) {
      return res.status(404).json({ success: false, message: `Route '${routeId}' not found` });
    }

    const newTimeMinutes = parseTimeToMinutes(time);

    // Compute coordinates: interpolate between neighboring stops if lat/lng not provided
    let stopLat = (lat !== undefined && !isNaN(parseFloat(lat))) ? parseFloat(lat) : null;
    let stopLng = (lng !== undefined && !isNaN(parseFloat(lng))) ? parseFloat(lng) : null;

    if (stopLat === null || stopLng === null) {
      const sortedStops = [...(route.stops || [])].sort(
        (a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time)
      );

      let prevStop = null;
      let nextStop = null;
      for (const s of sortedStops) {
        if (parseTimeToMinutes(s.time) <= newTimeMinutes) {
          prevStop = s;
        } else {
          nextStop = s;
          break;
        }
      }

      if (prevStop && nextStop) {
        // Interpolate between the chronological neighbors
        stopLat = parseFloat(((prevStop.lat + nextStop.lat) / 2).toFixed(6));
        stopLng = parseFloat(((prevStop.lng + nextStop.lng) / 2).toFixed(6));
      } else if (prevStop) {
        // Append after latest stop
        stopLat = parseFloat((prevStop.lat + 0.003).toFixed(6));
        stopLng = parseFloat((prevStop.lng + 0.003).toFixed(6));
      } else if (nextStop) {
        // Prepend before earliest stop
        stopLat = parseFloat((nextStop.lat - 0.003).toFixed(6));
        stopLng = parseFloat((nextStop.lng - 0.003).toFixed(6));
      } else {
        // Default Chennai coordinates
        stopLat = 13.0063;
        stopLng = 80.2575;
      }
    }

    const newStop = {
      name: name.trim(),
      time: time.trim(),
      lat: stopLat,
      lng: stopLng
    };

    route.stops.push(newStop);

    // CHRONOLOGICAL SORT BY ARRIVAL TIME
    route.stops.sort((a, b) => {
      const diff = parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time);
      if (diff !== 0) return diff;
      return (a.sequence || 0) - (b.sequence || 0);
    });

    // Re-assign sequence numbers according to chronological order
    route.stops.forEach((stop, index) => {
      stop.sequence = index + 1;
    });

    await route.save();

    const createdSeq = route.stops.find(s => s.name === newStop.name && s.time === newStop.time)?.sequence;

    return res.status(200).json({ 
      success: true, 
      message: `Stop '${name.trim()}' scheduled at ${time.trim()} placed at Stop #${createdSeq}`, 
      stop: newStop,
      route 
    });
  } catch (err) {
    console.error('Error adding stop:', err);
    return res.status(500).json({ success: false, message: 'Error adding stop' });
  }
});

// 7. DELETE STOP FROM ROUTE (admins only)
app.delete('/api/routes/:id/stops/:sequence', requireAuth('admin'), async (req, res) => {
  const { id, sequence } = req.params;
  const targetSeq = parseInt(sequence, 10);

  if (isNaN(targetSeq)) {
    return res.status(400).json({ success: false, message: 'Invalid sequence number' });
  }

  try {
    const route = await Route.findOne({ route_id: id });
    if (!route) {
      return res.status(404).json({ success: false, message: `Route '${id}' not found` });
    }

    const initialCount = route.stops.length;
    route.stops = route.stops.filter(stop => stop.sequence !== targetSeq);

    if (route.stops.length === initialCount) {
      return res.status(404).json({ success: false, message: `Stop with sequence #${targetSeq} not found` });
    }

    // Keep sorted chronologically by time
    route.stops.sort((a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time));

    // Re-sequence remaining stops
    route.stops.forEach((stop, index) => { 
      stop.sequence = index + 1; 
    });

    await route.save();
    return res.status(200).json({ 
      success: true, 
      message: `Stop #${targetSeq} removed and remaining stops re-sequenced`, 
      route 
    });
  } catch (err) {
    console.error('Error deleting stop:', err);
    return res.status(500).json({ success: false, message: 'Error deleting stop' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`OnBoard Transit API Server running on port ${PORT}`));