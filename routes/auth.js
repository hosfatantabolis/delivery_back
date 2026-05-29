const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

const router = express.Router();

// REGISTER - PUBLIC
router.post('/register', async (req, res) => {
  console.log('📝 Register request:', { ...req.body, password: '[HIDDEN]' });
  
  try {
    const { name, email, phone, password, role, vehicleInfo, assignedZone } = req.body;
    
    if (!name || !email || !phone || !password) {
      return res.status(400).json({ error: 'All fields are required (name, email, phone, password)' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be 6+ characters' });
    }
    
    // Validate phone format (basic validation)
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 10 || phoneDigits.length > 15) {
      return res.status(400).json({ error: 'Please enter a valid phone number (10-15 digits)' });
    }
    
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    let privileges = [];
    if (role === 'admin') {
      privileges = ['create_orders', 'edit_orders', 'confirm_orders', 'manage_drivers', 'manage_clients', 'manage_users'];
    } else if (role === 'manager') {
      privileges = ['create_orders', 'edit_orders', 'manage_clients'];
    }
    
    const user = new User({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      password: hashedPassword,
      role: role || 'manager',
      privileges: privileges,
      isActive: true,
      vehicleInfo: role === 'driver' ? (vehicleInfo || '') : '',
      assignedZone: role === 'driver' ? (assignedZone || '') : ''
    });
    
    await user.save();
    
    const userResponse = {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      privileges: user.privileges
    };
    
    console.log('✅ User created:', email, 'as', role, 'Phone:', phone);
    res.status(201).json({ 
      message: 'Registration successful!', 
      user: userResponse 
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: error.message });
  }
});

// LOGIN - PUBLIC
router.post('/login', async (req, res) => {
  console.log('🔐 Login request:', req.body.email);
  
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Make sure role is included in token
    const token = jwt.sign(
      { userId: user._id, role: user.role }, 
      process.env.JWT_SECRET || 'my_secret_key_123',
      { expiresIn: '7d' }
    );
    
    console.log('✅ User logged in:', email, 'Role:', user.role);
    
    res.json({ 
      token, 
      user: { 
        id: user._id, 
        name: user.name, 
        email: user.email,
        phone: user.phone,
        role: user.role, 
        privileges: user.privileges 
      } 
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET current user
router.get('/me', auth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    const userResponse = {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      phone: req.user.phone,
      role: req.user.role,
      privileges: req.user.privileges
    };
    
    res.json({ user: userResponse });
  } catch (error) {
    console.error('Error fetching current user:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET all users
router.get('/users', auth, async (req, res) => {
  try {
    // Only admins can view all users
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const users = await User.find().select('-password');
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;