const mongoose = require('mongoose');

const TelemetrySchema = new mongoose.Schema({
  route_id: { type: String, required: true },
  driver_id: { type: String, required: true },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  speed: { type: Number, default: 0 },
  timestamp: { type: Date, default: Date.now }
});

TelemetrySchema.index({ route_id: 1, timestamp: -1 });

module.exports = mongoose.model('Telemetry', TelemetrySchema);