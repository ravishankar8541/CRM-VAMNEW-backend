


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
  requestPasswordReset,
  verifyResetToken,
  resetPassword,
  getUsersForDropdown,
  updateUserTarget // ✅ Added
} = require('../controllers/authController');

const router = express.Router();

// ==================== PUBLIC ROUTES ====================
router.post('/login', login);
router.post('/request-reset', requestPasswordReset);
router.get('/verify-reset/:token', verifyResetToken);
router.post('/reset-password', resetPassword);

// ==================== PROTECTED ROUTES ====================
router.post('/register', authMiddleware, register);
router.get('/me', authMiddleware, getCurrentUser);
router.get('/users', authMiddleware, getAllUsers);
router.put('/users/:userId/toggle-status', authMiddleware, toggleUserStatus);
router.put('/users/:userId/target', authMiddleware, updateUserTarget); // ✅ Added Target route
router.post('/users/:userId/delete', authMiddleware, deleteUser);
router.post('/admin/reset-password', authMiddleware, adminResetPassword);
router.post('/change-password', authMiddleware, changeOwnPassword);
router.get('/users/dropdown', authMiddleware, getUsersForDropdown);

module.exports = router;