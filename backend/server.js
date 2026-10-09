const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const User = require('./models/User');
const Route = require('./models/Route');

const app = express();
app.use(cors());
app.use(express.json());

const MONGO_URI = "mongodb+srv://shamiuday02_db_user:vH7FxMFHNNRF6zXF@onboard.c25srzt.mongodb.net/?appName=onboard";

// Secret used to sign login tokens. Set JWT_SECRET in your environment (.env) for real use.
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-me';
if (!process.env.JWT_SECRET) console.warn('WARNING: JWT_SECRET is not set. Using an insecure dev secret.');
const TOKEN_LIFETIME = '12h';

mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB Connected Successfully'))
  .catch((err) => console.error('MongoDB Connection Failed:', err));

// --- AUTH MIDDLEWARE ---
// requireAuth('driver') -> only drivers; requireAuth('admin') -> only admins
function requireAuth(...roles) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ success: false, message: 'Login required' });

    try {
      const payload = jwt.verify(token, JWT_SECRET);
      if (roles.length && !roles.includes(payload.role)) {
        return res.status(403).json({ success: false, message: 'You do not have permission for this action' });
      }
      req.user = payload;
      next();
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Session expired. Please log in again' });
    }
  };
}

// --- API ENDPOINTS ---

// 1. GET ALL ROUTES (public: students need this) - auto-deactivates stale routes > 2 mins inactive
app.get('/api/routes', async (req, res) => {
  try {
    const routes = await Route.find({});
    const now = new Date();
    const updatedRoutes = routes.map(r => {
      const routeObj = r.toObject();
      if (routeObj.last_updated && (now - new Date(routeObj.last_updated)) > 120000) {
        routeObj.is_active = false;
      }
      return routeObj;
    });

    res.json(updatedRoutes);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch routes' });
  }
});

// 2. AUTHENTICATION LOGIN (returns a signed token)
app.post('/api/auth/login', async (req, res) => {
  const { user_id, password } = req.body;

  try {
    const cleanUserId = user_id ? user_id.trim() : '';
    const cleanPassword = password ? password.trim() : '';

    const user = await User.findOne({ 
      user_id: { $regex: new RegExp(`^${cleanUserId}$`, 'i') } 
    });

    if (!user || user.password !== cleanPassword) {
      return res.status(400).json({ success: false, message: 'Invalid Credentials' });
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
    return res.status(500).json({ success: false, message: 'Server error during login' });
  }
});

// 3. LIVE TELEMETRY BROADCAST (drivers only; driver ID comes from the token, not the request body)
app.post('/api/telemetry', requireAuth('driver'), async (req, res) => {
  const { route_id, lat, lng, speed, is_active } = req.body;
  const driver_id = req.user.user_id;

  try {
    const route = await Route.findOne({ route_id });
    if (!route) {
      return res.status(404).json({ success: false, message: 'Route not found' });
    }

    route.is_active = is_active !== undefined ? is_active : true;
    route.last_updated = new Date();
    
    if (driver_id && is_active) {
      route.assigned_driver = driver_id;
    }

    if (lat && lng) {
      route.current_location = { lat, lng, speed: speed || 0 };
    }

    await route.save();
    res.json({ success: true, message: 'Telemetry updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Telemetry update failed' });
  }
});

// 4. ADD STOP TO ROUTE (admins only)
app.post('/api/routes/:id/stops', requireAuth('admin'), async (req, res) => {
  const routeId = req.params.id;
  const { name, time, lat, lng } = req.body;

  try {
    const route = await Route.findOne({ route_id: routeId });
    if (!route) return res.status(404).json({ success: false, message: 'Route not found' });

    const nextSequence = route.stops ? route.stops.length + 1 : 1;
    route.stops.push({
      sequence: nextSequence,
      name,
      time,
      lat: lat || (route.stops[0]?.lat || 13.0063) + 0.001,
      lng: lng || (route.stops[0]?.lng || 80.2575) + 0.001
    });

    await route.save();
    return res.status(200).json({ success: true, message: 'Stop added', route });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Error adding stop' });
  }
});

// 5. DELETE STOP FROM ROUTE (admins only)
app.delete('/api/routes/:id/stops/:sequence', requireAuth('admin'), async (req, res) => {
  const { id, sequence } = req.params;

  try {
    const route = await Route.findOne({ route_id: id });
    if (!route) return res.status(404).json({ success: false, message: 'Route not found' });

    route.stops = route.stops.filter(stop => stop.sequence !== parseInt(sequence));
    route.stops.forEach((stop, index) => { stop.sequence = index + 1; });

    await route.save();
    return res.status(200).json({ success: true, message: 'Stop deleted', route });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Error deleting stop' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));