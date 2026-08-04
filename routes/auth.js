const express = require('express');
const authMiddleware = require('../middleware/auth');
const { 
  register, 
  login, 
  getAllUsers, 
  adminResetPassword, 
  changeOwnPassword,
  getCurrentUser,        
  toggleUserStatus,      
  deleteUser,
  // ✅ NEW
  requestPasswordReset,
  verifyResetToken,
  resetPassword
} = require('../controllers/authController');

const router = express.Router();

// ==================== PUBLIC ROUTES ====================
router.post('/login', login);

// ✅ NEW: Password Reset Routes (Public)
router.post('/request-reset', requestPasswordReset);
router.get('/verify-reset/:token', verifyResetToken);
router.post('/reset-password', resetPassword);

// ==================== PROTECTED ROUTES ====================
router.post('/register', authMiddleware, register);
router.get('/me', authMiddleware, getCurrentUser);
router.get('/users', authMiddleware, getAllUsers);
router.put('/users/:userId/toggle-status', authMiddleware, toggleUserStatus);

router.post('/users/:userId/delete', authMiddleware, deleteUser);
router.post('/admin/reset-password', authMiddleware, adminResetPassword);
router.post('/change-password', authMiddleware, changeOwnPassword);

module.exports = router;