const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const clientRoutes = require("./routes/clients");
const orderRoutes = require("./routes/orders");

const app = express();
const server = http.createServer(app);
app.use((req, res, next) => {
  res.setHeader(
    "Access-Control-Allow-Origin",
    "https://delivery.hosfatantabolis.ru",
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});
const io = new Server(server, {
  cors: {
    origin: "https://delivery.hosfatantabolis.ru",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

// Make io accessible to routes
app.set("io", io);

// Track connected users
const connectedUsers = new Map();

// Socket.IO authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  console.log("Socket handshake token present:", !!token);

  if (!token) {
    return next(new Error("Authentication required"));
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "my_secret_key_123",
    );
    socket.userId = decoded.userId;
    socket.userRole = decoded.role;
    console.log(
      "Socket authenticated:",
      socket.userId,
      "Role:",
      socket.userRole,
    );
    next();
  } catch (err) {
    console.error("Socket auth error:", err.message);
    next(new Error("Invalid token"));
  }
});

io.on("connection", (socket) => {
  console.log("✅ Client connected:", socket.userId, "Role:", socket.userRole);

  // Log all outgoing events for this socket
  const originalEmit = socket.emit;
  socket.emit = function (eventName, ...args) {
    console.log(`📤 Sending to ${socket.userId}: ${eventName}`, args[0]);
    return originalEmit.apply(this, [eventName, ...args]);
  };

  // Store user connection
  connectedUsers.set(socket.userId, {
    socketId: socket.id,
    role: socket.userRole,
    userId: socket.userId,
  });

  // Join role-specific rooms
  if (socket.userRole) {
    socket.join(`role_${socket.userRole}`);
    console.log(`User ${socket.userId} joined room: role_${socket.userRole}`);
  }

  // Join personal room
  socket.join(`user_${socket.userId}`);

  // Send a test message to confirm connection
  socket.emit("connection-confirmed", {
    message: "Connected to WebSocket server",
    userId: socket.userId,
    role: socket.userRole,
  });

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.userId);
    connectedUsers.delete(socket.userId);
  });

  socket.on("ping", () => {
    socket.emit("pong");
  });

  socket.on("error", (error) => {
    console.error("Socket error:", error);
  });
});

// Make notification functions globally available
global.sendNotificationToRole = (role, notification) => {
  console.log(`Sending notification to role_${role}:`, notification);
  io.to(`role_${role}`).emit("notification", notification);
};

global.sendNotificationToUser = (userId, notification) => {
  console.log(`Sending notification to user_${userId}:`, notification);
  io.to(`user_${userId}`).emit("notification", notification);
};

global.sendToAll = (event, data) => {
  io.emit(event, data);
};

// Middleware
app.use(
  cors({
    origin: "https://delivery.hosfatantabolis.ru",
    credentials: true,
  }),
);
app.use(express.json());

// MongoDB connection
mongoose
  .connect("mongodb://localhost:27017/delivery_system")
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB error:", err.message));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/orders", orderRoutes);

// Test route
app.get("/api/test", (req, res) => {
  res.json({ message: "Server is running" });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log(`🔌 WebSocket ready`);
  console.log(`📡 Connected users: ${connectedUsers.size}\n`);
});
