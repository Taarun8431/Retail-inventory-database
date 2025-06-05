// Backend/server.js
const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const inventoryRoutes = require('./routes/inventoryRoutes');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Configure CORS for both Express and Socket.IO
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Accept']
};

app.use(cors(corsOptions));
app.use(express.json());

// Initialize Socket.IO with CORS configuration
const io = socketIo(server, { 
  cors: corsOptions,
  transports: ['websocket', 'polling']
});

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

// Serve static files from the Frontend directory
app.use(express.static(path.join(__dirname, '../Frontend')));

// Routes
app.use('/api', inventoryRoutes);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });

  // Handle inventory updates
  socket.on('inventoryUpdate', (data) => {
    console.log('Inventory update received:', data);
    // Broadcast the update to all connected clients
    io.emit('inventoryUpdated', data);
  });
});

// Helper function to emit inventory updates
const emitInventoryUpdate = (data) => {
  io.emit('inventoryUpdated', data);
};

// Make the emit function available to routes
app.set('emitInventoryUpdate', emitInventoryUpdate);

// Get port from environment variable or use 3000 as default
const port = process.env.PORT || 3000;
console.log('Using port:', port);

// Handle server errors
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Please try a different port or kill the process using this port.`);
    process.exit(1);
  } else {
    console.error('Server error:', error);
  }
});

// Start the server
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Frontend available at http://localhost:${port}`);
  console.log(`API available at http://localhost:${port}/api`);
  console.log(`WebSocket server running on ws://localhost:${port}`);
});
