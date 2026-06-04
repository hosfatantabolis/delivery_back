const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String },
  position: { type: String }, // e.g., "CEO", "Logistics Manager", "Warehouse"
  isPrimary: { type: Boolean, default: false },
  notes: { type: String },
});

const addressSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['billing', 'shipping', 'warehouse', 'office', 'other'],
    default: 'shipping',
  },
  address: { type: String, required: true },
  city: { type: String },
  state: { type: String },
  zipCode: { type: String },
  country: { type: String },
  isDefault: { type: Boolean, default: false },
  instructions: { type: String },
});

const clientSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  contacts: [contactSchema], // NEW: multiple contacts
  // Deprecated but kept for backward compatibility
  contactPerson: { type: String },
  phone: { type: String },
  email: { type: String },
  addresses: [addressSchema],
  taxId: { type: String },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
  },
  notes: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
});

// Ensure at least one primary contact exists
clientSchema.pre('save', function (next) {
  if (this.contacts && this.contacts.length > 0) {
    const hasPrimary = this.contacts.some((c) => c.isPrimary);
    if (!hasPrimary && this.contacts.length > 0) {
      this.contacts[0].isPrimary = true;
    }
  }
  next();
});

module.exports = mongoose.model('Client', clientSchema);
