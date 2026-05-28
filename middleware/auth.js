const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'my_secret_key_123');
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    if (!user.isActive) {
      return res.status(401).json({ error: 'Account is deactivated' });
    }
    
    req.user = user;
    req.userId = user._id;
    req.userRole = user.role; // Explicitly set role
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error.message);
    res.status(401).json({ error: 'Please authenticate' });
  }
};

const checkPrivilege = (privilege) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    if (req.user.role === 'admin') {
      return next();
    }
    
    if (req.user.privileges && req.user.privileges.includes(privilege)) {
      return next();
    }
    
    res.status(403).json({ error: `Insufficient privileges. Need: ${privilege}` });
  };
};

module.exports = { auth, checkPrivilege };