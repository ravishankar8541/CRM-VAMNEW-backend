const express = require('express');
const authMiddleware = require('../middleware/auth'); // ✅ Import from separate file
const { 
  register, 
  login, 
  getAllUsers, 
  adminResetPassword, 
  changeOwnPassword,
  getCurrentUser,        // ✅ New
  toggleUserStatus,      // ✅ New
  deleteUser             // ✅ New
} = require('../controllers/authController');

const router = express.Router();

// ==================== PUBLIC ROUTES ====================
router.post('/register', register);
router.post('/login', login);

// ==================== PROTECTED ROUTES ====================
// All routes below require authentication

// ✅ Get current user info
router.get('/me', authMiddleware, getCurrentUser);

// ✅ Get all users (Admin only)
router.get('/users', authMiddleware, getAllUsers);

// ✅ Toggle user active status (Admin only)
router.put('/users/:userId/toggle-status', authMiddleware, toggleUserStatus);

// ✅ Delete user (Admin only)
router.delete('/users/:userId', authMiddleware, deleteUser);

// ✅ Reset user password (Admin only)
router.post('/admin/reset-password', authMiddleware, adminResetPassword);

// ✅ Change own password
router.post('/change-password', authMiddleware, changeOwnPassword);

module.exports = router;