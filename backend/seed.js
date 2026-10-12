const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const mongoose = require('mongoose');
const User = require('./models/User'); 
const Route = require('./models/Route'); 

const MONGO_URI = "mongodb+srv://shamiuday02_db_user:vH7FxMFHNNRF6zXF@onboard.c25srzt.mongodb.net/?appName=onboard";

async function seedData() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB for seeding...');

    await User.deleteMany({});
    await Route.deleteMany({});

    // Seed Admin & Driver accounts
    const defaultUsers = [
      { name: 'Rajesh', user_id: 'DRV-101', password: 'driver123', role: 'driver' },
      { name: 'System Administrator', user_id: 'ADM-001', password: 'admin123', role: 'admin' }
    ];

    await User.insertMany(defaultUsers);

    // Seed Real Bus Routes with Real Chennai Coordinates
    const defaultRoutes = [
      {
        route_id: 'R21',
        route_name: '21 - ADAMBAKKAM POLICE BOOTH',
        assigned_driver: 'John Driver',
        is_active: false,
        current_location: { lat: 12.9881, lng: 80.2052, speed: 0 },
        stops: [
          { sequence: 1, name: 'ADAMBAKKAM POLICE BOOTH', lat: 12.9881, lng: 80.2052, time: '6.50 AM' }
        ]
      },
      {
        route_id: 'R14',
        route_name: '14 - ADYAR AAVIN',
        assigned_driver: 'Unassigned',
        is_active: false,
        current_location: { lat: 13.0063, lng: 80.2575, speed: 0 },
        stops: [
          { sequence: 1, name: 'ADYAR AAVIN', lat: 13.0063, lng: 80.2575, time: '6.25 AM' },
          { sequence: 2, name: 'ADYAR TELEPHONE EXCHANGE', lat: 13.0041, lng: 80.2548, time: '6.30 AM' },
          { sequence: 3, name: 'PTC QUARTERS', lat: 12.9912, lng: 80.2468, time: '6.35 AM' }
        ]
      },
      {
        route_id: 'R108',
        route_name: '108 - ALANDUR METRO',
        assigned_driver: 'Unassigned',
        is_active: false,
        current_location: { lat: 13.0040, lng: 80.2015, speed: 0 },
        stops: [
          { sequence: 1, name: 'ALANDUR METRO', lat: 13.0040, lng: 80.2015, time: '6.45 AM' },
          { sequence: 2, name: 'NANGANALLUR PETROL BUNK', lat: 12.9825, lng: 80.1912, time: '6.50 AM' },
          { sequence: 3, name: 'MEENAMBAKKAM', lat: 12.9870, lng: 80.1762, time: '6.55 AM' },
          { sequence: 4, name: 'CHROMPET SARAVANA STORES', lat: 12.9517, lng: 80.1408, time: '7.05 AM' }
        ]
      },
      {
        route_id: 'R49',
        route_name: '49 - AMBEDKAR NAGAR',
        assigned_driver: 'Unassigned',
        is_active: false,
        current_location: { lat: 13.1258, lng: 80.2112, speed: 0 },
        stops: [
          { sequence: 1, name: 'AMBEDKAR NAGAR', lat: 13.1258, lng: 80.2112, time: '6.25 AM' },
          { sequence: 2, name: 'RETTERI', lat: 13.1202, lng: 80.2056, time: '6.30 AM' },
          { sequence: 3, name: 'VINAYAGAPURAM', lat: 13.1365, lng: 80.2014, time: '6.35 AM' }
        ]
      },
      {
        route_id: 'R15',
        route_name: '15 - AMMA NANA',
        assigned_driver: 'Unassigned',
        is_active: false,
        current_location: { lat: 13.0224, lng: 80.2415, speed: 0 },
        stops: [
          { sequence: 1, name: 'KOTTURPURAM', lat: 13.0224, lng: 80.2415, time: '6.20 AM' },
          { sequence: 2, name: 'THORAIPAKKAM', lat: 12.9392, lng: 80.2371, time: '6.35 AM' },
          { sequence: 3, name: 'KARAPAKKAM', lat: 12.9125, lng: 80.2285, time: '6.40 AM' }
        ]
      },
      {
        route_id: 'R12',
        route_name: '12 - ASHOK PILLAR',
        assigned_driver: 'Unassigned',
        is_active: false,
        current_location: { lat: 13.0352, lng: 80.2124, speed: 0 },
        stops: [
          { sequence: 1, name: 'ASHOK PILLAR', lat: 13.0352, lng: 80.2124, time: '6.35 AM' },
          { sequence: 2, name: 'KASI THEATRE', lat: 13.0285, lng: 80.2101, time: '6.40 AM' },
          { sequence: 3, name: 'EKKATU THANGAL', lat: 13.0215, lng: 80.2050, time: '6.45 AM' }
        ]
      }
    ];

    await Route.insertMany(defaultRoutes);
    console.log('Database successfully seeded with all 6 timetable routes!');
    process.exit(0);
  } catch (err) {
    console.error('Seeding Error:', err);
    process.exit(1);
  }
}

seedData();