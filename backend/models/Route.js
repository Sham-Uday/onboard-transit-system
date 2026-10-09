const mongoose = require('mongoose');

const stopSchema = new mongoose.Schema({
  sequence: { type: Number, required: true },
  name: { type: String, required: true },
  time: { type: String, required: true },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true }
});

const routeSchema = new mongoose.Schema({
  route_id: { type: String, required: true, unique: true },
  route_name: { type: String, required: true },
  assigned_driver: { type: String, default: 'Unassigned' },
  is_active: { type: Boolean, default: false },
  last_updated: { type: Date, default: Date.now },
  current_location: {
    lat: { type: Number, default: 13.0063 },
    lng: { type: Number, default: 80.2575 },
    speed: { type: Number, default: 0 }
  },
  stops: [stopSchema]
});

module.exports = mongoose.model('Route', routeSchema);