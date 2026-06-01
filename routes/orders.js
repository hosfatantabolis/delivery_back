const express = require('express');
const Order = require('../models/Order');
const Client = require('../models/Client');
const User = require('../models/User'); // Add this line
const { auth, checkPrivilege } = require('../middleware/auth');
const {adminMiddleware} = require('../middleware/admin')

const router = express.Router();

// Helper function to generate unique order number
const generateOrderNumber = () => {
  return `ORD-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
};

// GET all orders - with role-based filtering
router.get('/', auth, async (req, res) => {
  try {
    const {
      creator,
      date,
      driver,
      status,
      deliveryPeriodStart,
      deliveryPeriodEnd,
      client,
      priority,
      type,
      groupByWeek = false
    } = req.query;
    
    let query = {};
    
    // === PRESERVE YOUR EXISTING ROLE-BASED ACCESS ===
    // Managers see ONLY orders they created
    if (req.user.role === 'manager') {
      query.createdBy = req.userId;
    } 
    // Drivers see ONLY orders assigned to them
    else if (req.user.role === 'driver') {
      query.assignedDriver = req.userId;
    }
    // Admins see all orders (no additional query filter)
    
    // === ADD THE NEW FILTERS (only if user has permission) ===
    // For managers, only allow filtering by fields they have access to
    if (req.user.role === 'manager') {
      // Managers can filter by status, priority, type, delivery period
      // But NOT by creator (they only see their own) or driver (security)
      if (status) query.status = status;
      if (priority) query.priority = priority;
      if (type) query.type = type;
      if (deliveryPeriodStart || deliveryPeriodEnd) {
        query.deliveryDate = {};
        if (deliveryPeriodStart) query.deliveryDate.$gte = new Date(deliveryPeriodStart);
        if (deliveryPeriodEnd) query.deliveryDate.$lte = new Date(deliveryPeriodEnd);
      }
      if (date) {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);
        query.createdAt = { $gte: startOfDay, $lte: endOfDay };
      }
      if (client) query.client = client;
    } 
    else if (req.user.role === 'driver') {
      // Drivers can only filter their assigned orders
      if (status) query.status = status;
      if (priority) query.priority = priority;
      if (deliveryPeriodStart || deliveryPeriodEnd) {
        query.deliveryDate = {};
        if (deliveryPeriodStart) query.deliveryDate.$gte = new Date(deliveryPeriodStart);
        if (deliveryPeriodEnd) query.deliveryDate.$lte = new Date(deliveryPeriodEnd);
      }
    } 
    else if (req.user.role === 'admin') {
      // Admins can filter by everything
      if (creator) query.createdBy = creator;
      if (driver) query.assignedDriver = driver;
      if (status) query.status = status;
      if (priority) query.priority = priority;
      if (type) query.type = type;
      if (client) query.client = client;
      if (date) {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);
        query.createdAt = { $gte: startOfDay, $lte: endOfDay };
      }
      if (deliveryPeriodStart || deliveryPeriodEnd) {
        query.deliveryDate = {};
        if (deliveryPeriodStart) query.deliveryDate.$gte = new Date(deliveryPeriodStart);
        if (deliveryPeriodEnd) query.deliveryDate.$lte = new Date(deliveryPeriodEnd);
      }
    }
    
    const orders = await Order.find(query)
      .populate('client', 'name email phone contactPerson addresses')
      .populate('createdBy', 'name phone')
      .populate('confirmedBy', 'name')
      .populate('assignedDriver', 'name email phone');
    
    // Group by week if requested (for admin view primarily)
    if (groupByWeek && req.user.role === 'admin') {
      const groupedOrders = groupOrdersByWeek(orders);
      return res.json(groupedOrders);
    }
    
    res.json(orders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function (same as before)
function groupOrdersByWeek(orders) {
  const grouped = {};
  
  orders.forEach(order => {
    if (order.deliveryDate) {
      const deliveryDate = new Date(order.deliveryDate);
      const weekStart = getStartOfWeek(deliveryDate);
      const weekKey = weekStart.toISOString().split('T')[0];
      
      if (!grouped[weekKey]) {
        grouped[weekKey] = {
          weekStart: weekStart,
          orders: []
        };
      }
      grouped[weekKey].orders.push(order);
    }
  });
  
  const sortedGroups = Object.keys(grouped).sort().map(key => ({
    weekStart: grouped[key].weekStart,
    orders: grouped[key].orders
  }));
  
  return sortedGroups;
}

function getStartOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}


// PUT /api/orders/:orderId/reassign
router.put('/:orderId/reassign', auth, adminMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { newDriverId } = req.body;
    
    // Verify order exists
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Verify new driver exists and is available
    const newDriver = await User.findOne({ _id: newDriverId, role: 'driver' });
    if (!newDriver) {
      return res.status(404).json({ error: 'Driver not found' });
    }
    
    // Store previous driver for history
    const previousDriverId = order.assignedDriver;
    
    // Update order
    order.assignedDriver = newDriverId;
    order.reassignmentHistory = order.reassignmentHistory || [];
    order.reassignmentHistory.push({
      previousDriver: previousDriverId,
      newDriver: newDriverId,
      reassignedBy: req.user.id,
      reassignedAt: new Date(),
      reason: req.body.reason || 'Admin reassignment'
    });
    
    await order.save();
    
    // Optional: Notify both drivers via WebSocket/email
    // notifyDriver(previousDriverId, 'order_unassigned', order);
    // notifyDriver(newDriverId, 'order_assigned', order);
    
    res.json({ 
      message: 'Order reassigned successfully',
      order: order
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// CREATE order
router.post('/', auth, checkPrivilege('create_orders'), async (req, res) => {
  try {
    console.log('=== CREATE ORDER REQUEST ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    const { 
      clientId, 
      orderType, 
      deliveryAddress, 
      deliveryAddressType, 
      deliveryDateStart,
      deliveryDateEnd,
      deliveryTimeStart,
      deliveryTimeEnd,
      notes, 
      priority, 
      assignedDriverId 
    } = req.body;
    
    // Validate required fields
    if (!clientId) {
      return res.status(400).json({ error: 'Client ID is required' });
    }
    
    if (!deliveryAddress) {
      return res.status(400).json({ error: 'Delivery address is required' });
    }
    
    if (!deliveryDateStart) {
      return res.status(400).json({ error: 'Delivery start date is required' });
    }
    
    // Validate client exists
    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    if (client.status !== 'active') {
      return res.status(400).json({ error: 'Client is not active' });
    }
    
    // Generate unique order number (not using pre-save middleware)
    let orderNumber = generateOrderNumber();
    let orderExists = await Order.findOne({ orderNumber });
    while (orderExists) {
      orderNumber = generateOrderNumber();
      orderExists = await Order.findOne({ orderNumber });
    }
    
    // Prepare order data
    const orderData = {
      orderNumber: orderNumber,
      client: clientId,
      orderType: orderType || 'delivery',
      deliveryAddress: deliveryAddress,
      deliveryAddressType: deliveryAddressType || null,
      deliveryDateStart: new Date(deliveryDateStart),
      deliveryDateEnd: deliveryDateEnd ? new Date(deliveryDateEnd) : null,
      deliveryTimeStart: deliveryTimeStart || null,
      deliveryTimeEnd: deliveryTimeEnd || null,
      notes: notes || null,
      priority: priority || 'normal',
      createdBy: req.userId,
      status: assignedDriverId ? 'assigned' : 'pending_confirmation'
    };
    
    // Add assigned driver if provided
    if (assignedDriverId) {
      const driver = await User.findById(assignedDriverId);
      if (driver && driver.role === 'driver') {
        orderData.assignedDriver = assignedDriverId;
      }
    }
    
    console.log('Order data to save:', JSON.stringify(orderData, null, 2));
    
    const order = new Order(orderData);
    await order.save();
    
    const populatedOrder = await Order.findById(order._id)
      .populate('client', 'name email phone contactPerson addresses')
      .populate('createdBy', 'name')
      .populate('assignedDriver', 'name email phone');
    
    const io = req.app.get('io');
    if (io) {
      io.emit('order-created', populatedOrder);
      
      if (assignedDriverId) {
        const notification = {
          id: Date.now(),
          type: 'assignment',
          title: '📋 New Order Assigned',
          message: `You have been assigned to order ${orderNumber} for ${client.name}`,
          orderId: order._id,
          orderNumber: orderNumber,
          clientName: client.name,
          deliveryAddress: deliveryAddress,
          deliveryDateStart: deliveryDateStart,
          deliveryDateEnd: deliveryDateEnd,
          priority: priority || 'normal',
          assignedBy: req.user.name,
          timestamp: new Date().toISOString(),
          read: false
        };
        
        io.to(`user_${assignedDriverId.toString()}`).emit('notification', notification);
        io.to(`user_${assignedDriverId.toString()}`).emit('order-assigned', populatedOrder);
      }
    }
    
    console.log('✅ Order created successfully:', orderNumber);
    res.status(201).json(populatedOrder);
    
  } catch (error) {
    console.error('❌ Error creating order:', error);
    console.error('Error stack:', error.stack);
    res.status(400).json({ error: error.message });
  }
});

// ASSIGN driver to order (admin/manager only)
router.put('/:id/assign', auth, checkPrivilege('edit_orders'), async (req, res) => {
  try {
    const { driverId } = req.body;
    
    console.log('=== ASSIGN DRIVER ===');
    console.log('Order ID:', req.params.id);
    console.log('Driver ID:', driverId);
    console.log('Driver room:', `user_${driverId.toString()}`);
    console.log('Current user:', req.user?.name, 'Role:', req.user?.role);

    if (!driverId) {
      return res.status(400).json({ error: 'Driver ID is required' });
    }
    
    // Check if driver exists and is a driver
    const driver = await User.findById(driverId);
    console.log('Driver found:', driver ? driver.email : 'Not found');
    
    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }
    
    if (driver.role !== 'driver') {
      return res.status(400).json({ error: 'User is not a driver' });
    }
    
    // Update order with driver assignment
    const updatedOrder = await Order.findByIdAndUpdate(
      req.params.id,
      { assignedDriver: driverId, status: 'assigned', updatedAt: Date.now() },
      { new: true }
    ).populate('client', 'name address phone email')
     .populate('assignedDriver', 'name email phone')
     .populate('createdBy', 'name');
    
    if (!updatedOrder) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    
    // Send notification to the assigned driver
    const notification = {
      id: Date.now(),
      type: 'assignment',
      title: '📋 New Order Assigned',
      message: `You have been assigned to order ${updatedOrder.orderNumber} for ${updatedOrder.client?.name}`,
      orderId: updatedOrder._id,
      orderNumber: updatedOrder.orderNumber,
      clientName: updatedOrder.client?.name,
      deliveryAddress: updatedOrder.deliveryAddress,
      priority: updatedOrder.priority,
      assignedBy: req.user.name,
      timestamp: new Date().toISOString(),
      read: false
    };
    
    const io = req.app.get('io');
    if (io) {
      const driverRoom = `user_${driverId.toString()}`;
      console.log(`📤 Emitting to room: ${driverRoom}`);
      console.log(`📤 Order data:`, {
        orderNumber: updatedOrder.orderNumber,
        clientName: updatedOrder.client?.name
      });

      // Send notification to driver
      const notification = {
        id: Date.now(),
        type: 'assignment',
        title: '📋 New Order Assigned',
        message: `You have been assigned to order ${updatedOrder.orderNumber} for ${updatedOrder.client?.name}`,
        orderId: updatedOrder._id,
        orderNumber: updatedOrder.orderNumber,
        clientName: updatedOrder.client?.name,
        deliveryAddress: updatedOrder.deliveryAddress,
        timestamp: new Date().toISOString(),
        read: false
      };
      
      // Send to driver's personal room
      io.to(`user_${driverId.toString()}`).emit('notification', notification);
      io.to(`user_${driverId.toString()}`).emit('order-assigned', updatedOrder);
      // Emit to driver's personal room
      io.to(driverRoom).emit('order-assigned', updatedOrder);
       // Also emit a test ping to verify room exists
      io.to(driverRoom).emit('test-ping', { time: Date.now() });

      // Also send to admin room for visibility
      io.to('role_admin').emit('notification', {
        ...notification,
        message: `Order ${updatedOrder.orderNumber} assigned to driver ${driver.name}`
      });

      io.to(driverRoom).emit('order-assigned', updatedOrder);
      const rooms = io.sockets.adapter.rooms;
      console.log('Available rooms:', Array.from(rooms.keys()));
      // Check if driver room exists
      // const driverRoom = `user_${driverId.toString()}`;
      if (rooms.has(driverRoom)) {
        console.log(`✅ Driver room ${driverRoom} exists, has ${rooms.get(driverRoom).size} clients`);
      } else {
        console.log(`❌ Driver room ${driverRoom} does NOT exist!`);
      }


    }
    
    res.json(updatedOrder);
    
  } catch (error) {
    console.error('Error assigning driver:', error);
    res.status(500).json({ error: error.message });
  }
});

// CONFIRM order
router.post('/:id/confirm', auth, checkPrivilege('confirm_orders'), async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status: 'confirmed', confirmedBy: req.userId },
      { new: true }
    ).populate('client', 'name').populate('createdBy', 'name');
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const io = req.app.get('io');
    if (io) {
      io.emit('order-updated', order);
    }
    
    res.json(order);
  } catch (error) {
    console.error('Error confirming order:', error);
    res.status(400).json({ error: error.message });
  }
});

// UPDATE order
router.put('/:id', auth, async (req, res) => {
  try {
    console.log('=== UPDATE ORDER REQUEST ===');
    console.log('User role:', req.user.role);
    console.log('User ID:', req.userId.toString());
    console.log('Order ID:', req.params.id);
    
    const order = await Order.findById(req.params.id)
      .populate('client', 'name phone email')
      .populate('assignedDriver', 'name phone email')
      .populate('createdBy', 'name email');
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    let updatedOrder;
    
    if (req.user.role === 'driver') {
      const orderDriverId = order.assignedDriver ? order.assignedDriver._id.toString() : null;
      const currentUserId = req.userId.toString();
      
      if (!orderDriverId || orderDriverId !== currentUserId) {
        return res.status(403).json({ error: 'You can only update your own assigned orders' });
      }
      
      const { status } = req.body;
      if (!status) {
        return res.status(400).json({ error: 'Drivers can only update order status' });
      }
      
      const allowedTransitions = {
        'assigned': ['in_transit', 'cancelled'],
        'in_transit': ['delivered', 'cancelled'],
        'confirmed': ['assigned', 'cancelled']
      };
      
      const allowedNextStatuses = allowedTransitions[order.status] || [];
      if (!allowedNextStatuses.includes(status)) {
        return res.status(403).json({ error: `Cannot change status from ${order.status} to ${status}` });
      }
      
      updatedOrder = await Order.findByIdAndUpdate(
        req.params.id,
        { status, updatedAt: Date.now() },
        { new: true }
      ).populate('client', 'name phone email')
       .populate('assignedDriver', 'name phone email')
       .populate('createdBy', 'name email');
      
      const notification = {
        id: Date.now(),
        type: status === 'delivered' ? 'success' : 'info',
        title: `Order ${updatedOrder.orderNumber} Status Update`,
        message: `🚚 Driver ${req.user.name} has ${status === 'delivered' ? 'completed delivery of' : 'updated'} order ${updatedOrder.orderNumber} to: ${status}`,
        orderId: order._id,
        orderNumber: order.orderNumber,
        timestamp: new Date().toISOString(),
        read: false
      };
      
      const io = req.app.get('io');
      if (io) {
        io.to('role_admin').emit('notification', notification);
        if (order.createdBy) {
          io.to(`user_${order.createdBy._id.toString()}`).emit('notification', notification);
        }
        io.emit('order-updated', updatedOrder);
      }
    } 
    else if (req.user.role === 'admin' || req.user.role === 'manager') {
      updatedOrder = await Order.findByIdAndUpdate(
        req.params.id,
        { ...req.body, updatedAt: Date.now() },
        { new: true }
      ).populate('client', 'name phone email')
       .populate('assignedDriver', 'name phone email')
       .populate('createdBy', 'name email');
    } 
    else {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    
    if (!updatedOrder) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    res.json(updatedOrder);
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(400).json({ error: error.message });
  }
});

// DRIVER ONLY: Update order status (PATCH endpoint)
router.patch('/:id/status', auth, async (req, res) => {
  try {
    console.log('=== DRIVER STATUS UPDATE ===');
    console.log('User:', req.user.email, 'Role:', req.user.role);
    console.log('Order ID:', req.params.id);
    console.log('New status:', req.body.status);
    
    // Check if user is driver
    if (req.user.role !== 'driver') {
      return res.status(403).json({ error: 'Only drivers can use this endpoint' });
    }
    
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }
    
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Check if order is assigned to this driver
    if (!order.assignedDriver || order.assignedDriver.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: 'This order is not assigned to you' });
    }
    
    // Validate allowed status transitions
    const allowedTransitions = {
      'assigned': ['in_transit', 'cancelled'],
      'in_transit': ['delivered', 'cancelled'],
      'confirmed': ['assigned', 'cancelled']
    };
    
    const allowedNextStatuses = allowedTransitions[order.status] || [];
    if (!allowedNextStatuses.includes(status)) {
      return res.status(403).json({ 
        error: `Cannot change status from ${order.status} to ${status}. Allowed: ${allowedNextStatuses.join(', ')}` 
      });
    }
    
    // Update status
    const updatedOrder = await Order.findByIdAndUpdate(
      req.params.id,
      { status, updatedAt: Date.now() },
      { new: true }
    ).populate('client', 'name phone email')
     .populate('assignedDriver', 'name email phone')
     .populate('createdBy', 'name email');
    
    console.log(`✅ Order ${order.orderNumber} status updated to ${status}`);
    
    // Send notification to admins and manager
    const notification = {
      id: Date.now(),
      type: status === 'delivered' ? 'success' : 'info',
      title: `Order ${updatedOrder.orderNumber} Status Update`,
      message: `🚚 Driver ${req.user.name} has ${status === 'delivered' ? 'completed delivery of' : 'updated'} order ${updatedOrder.orderNumber} to: ${status}`,
      orderId: order._id,
      orderNumber: order.orderNumber,
      driverName: req.user.name,
      status: status,
      timestamp: new Date().toISOString(),
      read: false
    };
    
    const io = req.app.get('io');
    if (io) {
      // Send to all admins
      io.to('role_admin').emit('notification', notification);
      
      // Send to the manager who created the order
      if (order.createdBy) {
        io.to(`user_${order.createdBy.toString()}`).emit('notification', notification);
      }
      
      // Broadcast order update
      io.emit('order-updated', updatedOrder);
    }
    
    res.json({ 
      success: true, 
      message: `Order status updated to ${status}`,
      order: updatedOrder 
    });
    
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Alternative endpoint for drivers using PUT (more compatible)
router.put('/:id/status', auth, async (req, res) => {
  console.log('=== DRIVER STATUS UPDATE (PUT) ===');
  console.log('User:', req.user.email, 'Role:', req.user.role);
  
  // Check if user is driver
  if (req.user.role !== 'driver') {
    return res.status(403).json({ error: 'Only drivers can update order status' });
  }
  
  const { status } = req.body;
  if (!status) {
    return res.status(400).json({ error: 'Status is required' });
  }
  
  try {
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Check if order is assigned to this driver
    if (!order.assignedDriver || order.assignedDriver.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: 'This order is not assigned to you' });
    }
    
    // Validate allowed status transitions
    const allowedTransitions = {
      'assigned': ['in_transit', 'cancelled'],
      'in_transit': ['delivered', 'cancelled'],
      'confirmed': ['assigned', 'cancelled']
    };
    
    const allowedNextStatuses = allowedTransitions[order.status] || [];
    if (!allowedNextStatuses.includes(status)) {
      return res.status(403).json({ 
        error: `Cannot change status from ${order.status} to ${status}. Allowed: ${allowedNextStatuses.join(', ')}` 
      });
    }
    
    // Update status
    const updatedOrder = await Order.findByIdAndUpdate(
      req.params.id,
      { status, updatedAt: Date.now() },
      { new: true }
    ).populate('client', 'name phone email')
     .populate('assignedDriver', 'name email phone')
     .populate('createdBy', 'name email');
    
    console.log(`✅ Order ${order.orderNumber} status updated to ${status}`);
    
    // Send notification
    const notification = {
      id: Date.now(),
      type: status === 'delivered' ? 'success' : 'info',
      title: `Order ${updatedOrder.orderNumber} Status Update`,
      message: `🚚 Driver ${req.user.name} has ${status === 'delivered' ? 'completed delivery of' : 'updated'} order to: ${status}`,
      orderId: order._id,
      orderNumber: order.orderNumber,
      timestamp: new Date().toISOString(),
      read: false
    };
    
    const io = req.app.get('io');
    if (io) {
      io.to('role_admin').emit('notification', notification);
      if (order.createdBy) {
        io.to(`user_${order.createdBy.toString()}`).emit('notification', notification);
      }
      io.emit('order-updated', updatedOrder);
    }
    
    res.json({ 
      success: true, 
      message: `Order status updated to ${status}`,
      order: updatedOrder 
    });
    
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;