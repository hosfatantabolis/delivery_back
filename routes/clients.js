// In backend/routes/clients.js

const express = require('express');
const Client = require('../models/Client');
const { auth, checkPrivilege } = require('../middleware/auth');

const router = express.Router();

// GET all clients - filtered by role
router.get('/', auth, async (req, res) => {
  try {
    let query = {};
    
    // Managers see ONLY clients they created
    if (req.user.role === 'manager') {
      query.createdBy = req.userId;
    }
    // Admins see all clients
    // Drivers might not need to see clients at all
    
    const clients = await Client.find(query).populate('createdBy', 'name');
    res.json(clients);
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET single client - check permissions
router.get('/:id', auth, async (req, res) => {
  try {
    const client = await Client.findById(req.params.id).populate('createdBy', 'name');
    
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    // Check if manager has access to this client
    if (req.user.role === 'manager' && client.createdBy._id.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: 'Access denied. You can only view your own clients.' });
    }
    
    res.json(client);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CREATE client - automatically set createdBy
router.post('/', auth, checkPrivilege('manage_clients'), async (req, res) => {
  try {
    const { name, contactPerson, phone, email, addresses, taxId, notes } = req.body;
    
    // Check if client already exists for this manager
    const existingClient = await Client.findOne({ name, createdBy: req.userId });
    if (existingClient) {
      return res.status(400).json({ error: 'You already have a client with this name' });
    }
    
    const client = new Client({
      name,
      contactPerson,
      phone,
      email,
      addresses: addresses || [],
      taxId,
      notes,
      createdBy: req.userId,
      status: 'active'
    });
    
    await client.save();
    
    const populatedClient = await Client.findById(client._id).populate('createdBy', 'name');
    res.status(201).json(populatedClient);
  } catch (error) {
    console.error('Error creating client:', error);
    res.status(400).json({ error: error.message });
  }
});

// UPDATE client - check ownership
router.put('/:id', auth, checkPrivilege('manage_clients'), async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    // Check if manager owns this client
    if (req.user.role === 'manager' && client.createdBy.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: 'Access denied. You can only edit your own clients.' });
    }
    
    const updatedClient = await Client.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('createdBy', 'name');
    
    res.json(updatedClient);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE (deactivate) client - check ownership
router.delete('/:id', auth, checkPrivilege('manage_clients'), async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    // Check if manager owns this client
    if (req.user.role === 'manager' && client.createdBy.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: 'Access denied. You can only deactivate your own clients.' });
    }
    
    const deactivatedClient = await Client.findByIdAndUpdate(
      req.params.id,
      { status: 'inactive' },
      { new: true }
    );
    
    res.json({ message: 'Client deactivated', client: deactivatedClient });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;