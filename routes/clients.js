const express = require('express');
const Client = require('../models/Client');
const { auth, checkPrivilege } = require('../middleware/auth');

const router = express.Router();

// GET all clients - filtered by role
router.get('/', auth, async (req, res) => {
  try {
    let query = {};

    if (req.user.role === 'manager') {
      query.createdBy = req.userId;
    }

    const clients = await Client.find(query).populate('createdBy', 'name');
    res.json(clients);
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET single client
router.get('/:id', auth, async (req, res) => {
  try {
    const client = await Client.findById(req.params.id).populate(
      'createdBy',
      'name',
    );

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    if (
      req.user.role === 'manager' &&
      client.createdBy._id.toString() !== req.userId.toString()
    ) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(client);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CREATE client
router.post('/', auth, checkPrivilege('manage_clients'), async (req, res) => {
  try {
    const {
      name,
      contacts, // NEW: array of contacts
      contactPerson, // backward compatibility
      phone, // backward compatibility
      email, // backward compatibility
      addresses,
      taxId,
      notes,
    } = req.body;

    // Check for duplicate client name for this manager
    const existingClient = await Client.findOne({
      name,
      createdBy: req.userId,
    });
    if (existingClient) {
      return res
        .status(400)
        .json({ error: 'You already have a client with this name' });
    }

    // Build client data
    let clientData = {
      name,
      addresses: addresses || [],
      taxId,
      notes,
      createdBy: req.userId,
      status: 'active',
    };

    // Handle contacts (new structure)
    if (contacts && contacts.length > 0) {
      clientData.contacts = contacts;
      // Also set legacy fields for backward compatibility
      const primaryContact = contacts.find((c) => c.isPrimary) || contacts[0];
      clientData.contactPerson = primaryContact.name;
      clientData.phone = primaryContact.phone;
      clientData.email = primaryContact.email || '';
    } else {
      // Legacy mode - single contact
      clientData.contacts = [
        {
          name: contactPerson,
          phone: phone,
          email: email || '',
          position: 'Main Contact',
          isPrimary: true,
        },
      ];
      clientData.contactPerson = contactPerson;
      clientData.phone = phone;
      clientData.email = email || '';
    }

    const client = new Client(clientData);
    await client.save();

    const populatedClient = await Client.findById(client._id).populate(
      'createdBy',
      'name',
    );
    res.status(201).json(populatedClient);
  } catch (error) {
    console.error('Error creating client:', error);
    res.status(400).json({ error: error.message });
  }
});

// UPDATE client
router.put('/:id', auth, checkPrivilege('manage_clients'), async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    if (
      req.user.role === 'manager' &&
      client.createdBy.toString() !== req.userId.toString()
    ) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { contacts, contactPerson, phone, email, ...otherFields } = req.body;

    // Handle contacts update
    if (contacts && contacts.length > 0) {
      otherFields.contacts = contacts;
      // Update legacy fields from primary contact
      const primaryContact = contacts.find((c) => c.isPrimary) || contacts[0];
      otherFields.contactPerson = primaryContact.name;
      otherFields.phone = primaryContact.phone;
      otherFields.email = primaryContact.email || '';
    } else if (contactPerson && phone) {
      // Legacy mode update
      otherFields.contactPerson = contactPerson;
      otherFields.phone = phone;
      otherFields.email = email || '';
      // Update or create contacts array
      if (client.contacts && client.contacts.length > 0) {
        otherFields.contacts = [
          {
            ...client.contacts[0],
            name: contactPerson,
            phone: phone,
            email: email || '',
          },
        ];
      } else {
        otherFields.contacts = [
          {
            name: contactPerson,
            phone: phone,
            email: email || '',
            position: 'Main Contact',
            isPrimary: true,
          },
        ];
      }
    }

    const updatedClient = await Client.findByIdAndUpdate(
      req.params.id,
      otherFields,
      { new: true, runValidators: true },
    ).populate('createdBy', 'name');

    res.json(updatedClient);
  } catch (error) {
    console.error('Error updating client:', error);
    res.status(400).json({ error: error.message });
  }
});

// DELETE (deactivate) client
router.delete(
  '/:id',
  auth,
  checkPrivilege('manage_clients'),
  async (req, res) => {
    try {
      const client = await Client.findById(req.params.id);

      if (!client) {
        return res.status(404).json({ error: 'Client not found' });
      }

      if (
        req.user.role === 'manager' &&
        client.createdBy.toString() !== req.userId.toString()
      ) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const deactivatedClient = await Client.findByIdAndUpdate(
        req.params.id,
        { status: 'inactive' },
        { new: true },
      );

      res.json({ message: 'Client deactivated', client: deactivatedClient });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },
);

module.exports = router;
