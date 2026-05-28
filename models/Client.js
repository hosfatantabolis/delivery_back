const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
  type: { 
    type: String, 
    enum: ['billing', 'shipping', 'warehouse', 'office', 'other'],
    default: 'shipping'
  },
  address: { type: String, required: true },
  city: { type: String },
  state: { type: String },
  zipCode: { type: String },
  country: { type: String },
  isDefault: { type: Boolean, default: false },
  instructions: { type: String }
});

const clientSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  contactPerson: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String },
  addresses: [addressSchema], // Multiple addresses
  taxId: { type: String },
  status: { 
    type: String, 
    enum: ['active', 'inactive'], 
    default: 'active' 
  },
  notes: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Client', clientSchema);