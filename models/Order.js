const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderNumber: { type: String, unique: true },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true,
  },
  contactName: { type: String },
  contactPhone: { type: String },
  contactEmail: { type: String },
  orderType: {
    type: String,
    enum: ['delivery', 'collection', 'both', 'complicated'],
    default: 'delivery',
  },
  deliveryAddress: { type: String, required: true },
  deliveryAddressType: { type: String },
  deliveryDateStart: { type: Date, required: true },
  deliveryDateEnd: { type: Date },
  deliveryTimeStart: { type: String },
  deliveryTimeEnd: { type: String },
  notes: { type: String },
  priority: {
    type: String,
    enum: ['normal', 'high', 'urgent'],
    default: 'normal',
  },
  status: {
    type: String,
    enum: [
      'pending_confirmation',
      'confirmed',
      'assigned',
      'in_transit',
      'delivered',
      'cancelled',
      'rejected',
    ],
    default: 'pending_confirmation',
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assignedDriver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectionReason: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  assignedDriver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reassignmentHistory: [
    {
      previousDriver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      newDriver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      reassignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      reassignedAt: { type: Date, default: Date.now },
      reason: String,
    },
  ],
});

// NO pre-save middleware - we'll generate order number in the route

module.exports = mongoose.model('Order', orderSchema);
