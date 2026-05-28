const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { 
    type: String, 
    enum: ['admin', 'manager', 'driver'],
    default: 'manager'
  },
  privileges: [{
    type: String,
    enum: ['create_orders', 'edit_orders', 'confirm_orders', 'manage_drivers', 'manage_clients', 'manage_users']
  }],
  isActive: { type: Boolean, default: true },
  vehicleInfo: { type: String, default: '' },
  assignedZone: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

// NO pre-save middleware here - we'll hash passwords in the route

module.exports = mongoose.model('User', userSchema);