const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Simple test route
app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is working!' });
});

// Register test route
app.post('/api/auth/register', (req, res) => {
  console.log('Register request received:', req.body);
  res.json({ message: 'Register endpoint working', data: req.body });
});

// Login test route
app.post('/api/auth/login', (req, res) => {
  console.log('Login request received:', req.body);
  res.json({ message: 'Login endpoint working', token: 'test-token' });
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Test server running on port ${PORT}`);
  console.log('Test endpoints:');
  console.log('  GET  http://localhost:5000/api/test');
  console.log('  POST http://localhost:5000/api/auth/register');
  console.log('  POST http://localhost:5000/api/auth/login');
});