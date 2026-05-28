const express = require('express');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { auth, checkPrivilege } = require('../middleware/auth');

const router = express.Router();

// GET all drivers
router.get('/drivers', auth, checkPrivilege('manage_drivers'), async (req, res) => {
  try {
    const drivers = await User.find({ role: 'driver' }).select('-password');
    res.json(drivers);
  } catch (error) {
    console.error('Error fetching drivers:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET single driver
router.get('/drivers/:id', auth, checkPrivilege('manage_drivers'), async (req, res) => {
  try {
    const driver = await User.findOne({ _id: req.params.id, role: 'driver' }).select('-password');
    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }
    res.json(driver);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CREATE driver
router.post('/drivers', auth, checkPrivilege('manage_drivers'), async (req, res) => {
  try {
    const { name, email, password, phone, vehicleInfo, assignedZone } = req.body;
    
    // Check if email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create driver
    const driver = new User({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: 'driver',
      phone: phone || '',
      vehicleInfo: vehicleInfo || '',
      assignedZone: assignedZone || '',
      isActive: true
    });
    
    await driver.save();
    
    const driverResponse = driver.toObject();
    delete driverResponse.password;
    
    res.status(201).json(driverResponse);
  } catch (error) {
    console.error('Error creating driver:', error);
    res.status(400).json({ error: error.message });
  }
});

// UPDATE driver
router.put('/drivers/:id', auth, checkPrivilege('manage_drivers'), async (req, res) => {
  try {
    const { name, phone, vehicleInfo, assignedZone, isActive } = req.body;
    
    const driver = await User.findByIdAndUpdate(
      req.params.id,
      { 
        name, 
        phone, 
        vehicleInfo, 
        assignedZone, 
        isActive 
      },
      { new: true, runValidators: true }
    ).select('-password');
    
    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }
    
    res.json(driver);
  } catch (error) {
    console.error('Error updating driver:', error);
    res.status(400).json({ error: error.message });
  }
});

// DELETE (deactivate) driver
router.delete('/drivers/:id', auth, checkPrivilege('manage_drivers'), async (req, res) => {
  try {
    const driver = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    ).select('-password');
    
    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }
    
    res.json({ message: 'Driver deactivated successfully', driver });
  } catch (error) {
    console.error('Error deactivating driver:', error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;