const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided. Please login.',
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // ✅ Check if user still exists in database
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User no longer exists. Please login again.',
      });
    }

    // ✅ Check if user is active
    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        message: 'Account is disabled. Please contact administrator.',
      });
    }

    // ✅ Attach full user object to request
    req.user = {
      id: user._id,
      username: user.username,
      role: user.role,
      name: user.name,
      isActive: user.isActive,
    };
    
    // ✅ Debug log
    console.log('✅ Auth Middleware - User attached:', req.user);
    
    next();
  } catch (error) {
    console.error('❌ Auth Middleware Error:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token. Please login again.',
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Session expired. Please login again.',
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Authentication failed. Please login again.',
    });
  }
};

module.exports = authMiddleware;