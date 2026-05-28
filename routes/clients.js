const express = require('express');
const Client = require('../models/Client');
const { auth, checkPrivilege } = require('../middleware/auth');

const router = express.Router();

// GET all clients - include all fields including addresses
router.get('/', auth, async (req, res) => {
  try {
    const clients = await Client.find().populate('createdBy', 'name');
    res.json(clients);
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET single client
router.get('/:id', auth, async (req, res) => {
  try {
    const client = await Client.findById(req.params.id).populate('createdBy', 'name');
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    res.json(client);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CREATE client
router.post('/', auth, checkPrivilege('manage_clients'), async (req, res) => {
  try {
    const { name, contactPerson, phone, email, addresses, taxId, notes } = req.body;
    
    // Check if client already exists
    const existingClient = await Client.findOne({ name });
    if (existingClient) {
      return res.status(400).json({ error: 'Client with this name already exists' });
    }
    
    const client = new Client({
      name,
      contactPerson,
      phone,
      email,
      addresses: addresses || [], // Allow addresses to be passed
      taxId,
      notes,
      createdBy: req.userId,
      status: 'active'
    });
    
    await client.save();
    res.status(201).json(client);
  } catch (error) {
    console.error('Error creating client:', error);
    res.status(400).json({ error: error.message });
  }
});

// UPDATE client
router.put('/:id', auth, checkPrivilege('manage_clients'), async (req, res) => {
  try {
    const client = await Client.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    res.json(client);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE (deactivate) client
router.delete('/:id', auth, checkPrivilege('manage_clients'), async (req, res) => {
  try {
    const client = await Client.findByIdAndUpdate(
      req.params.id,
      { status: 'inactive' },
      { new: true }
    );
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    res.json({ message: 'Client deactivated', client });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;