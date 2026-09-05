

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const crypto = require('crypto');
const { sendPasswordResetEmail } = require('../services/emailService');

// Register
exports.register = async (req, res) => {
  try {
    const { name, username, password, role, targetTotal, targetCore, targetGoogleAds } = req.body;

    if (!name || !username || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'All Fields are required',
      });
    }

    const existingUser = await User.findOne({ username });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Username already exists',
      });
    }

    const total = targetTotal !== undefined ? (parseFloat(targetTotal) || 0) : 250000;
    const core = targetCore !== undefined ? (parseFloat(targetCore) || 0) : Math.round(total * 0.7);
    const googleAds = targetGoogleAds !== undefined ? (parseFloat(targetGoogleAds) || 0) : Math.round(total * 0.3);

    const user = await User.create({
      name,
      username,
      password,
      role: role || 'employee',
      isActive: true,
      targetTotal: total,
      targetCore: core,
      targetGoogleAds: googleAds,
    });

    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        role: user.role,
        isActive: user.isActive,
        targetTotal: user.targetTotal,
        targetCore: user.targetCore,
        targetGoogleAds: user.targetGoogleAds,
      },
    });

  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during registration',
      error: error.message,
    });
  }
};

// LOGIN with role validation
exports.login = async (req, res) => {
  try {
    const { username, password, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required',
      });
    }

    const user = await User.findOne({ username }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password',
      });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        message: 'Account is disabled. Please contact administrator.',
      });
    }

    if (role && user.role !== role) {
      return res.status(403).json({
        success: false,
        message: `Access denied. You are not registered as ${role}. Your role is ${user.role}.`,
      });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password',
      });
    }

    const token = jwt.sign(
      { 
        id: user._id, 
        username: user.username, 
        role: user.role,
        name: user.name,
        isActive: user.isActive 
      },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    user.lastLogin = new Date();
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        role: user.role,
        isActive: user.isActive,
        targetTotal: user.targetTotal,
        targetCore: user.targetCore,
        targetGoogleAds: user.targetGoogleAds,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message,
    });
  }
};

// GET CURRENT USER
exports.getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        message: 'Account is disabled',
      });
    }

    return res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        role: user.role,
        isActive: user.isActive,
        targetTotal: user.targetTotal,
        targetCore: user.targetCore,
        targetGoogleAds: user.targetGoogleAds,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error('Get current user error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// GET ALL USERS (Admin only)
exports.getAllUsers = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.',
      });
    }

    const users = await User.find({}, '-password').sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: users,
    });
  } catch (error) {
    console.error('Get users error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};


exports.updateUserTarget = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.',
      });
    }

    const { userId } = req.params;
    const { targetTotal, targetCore, targetGoogleAds } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // ✅ Target sirf Sales team ke liye allow karein
    if (user.role !== 'sales') {
      return res.status(400).json({
        success: false,
        message: 'Target can only be assigned to users with Sales role.',
      });
    }

    const total = targetTotal !== undefined ? Math.max(0, parseFloat(targetTotal) || 0) : (user.targetTotal || 250000);
    const core = targetCore !== undefined ? Math.max(0, parseFloat(targetCore) || 0) : Math.round(total * 0.7);
    const googleAds = targetGoogleAds !== undefined ? Math.max(0, parseFloat(targetGoogleAds) || 0) : Math.round(total * 0.3);

    user.targetTotal = total;
    user.targetCore = core;
    user.targetGoogleAds = googleAds;

    await user.save();

    return res.status(200).json({
      success: true,
      message: `Target updated successfully for ${user.name}`,
      data: {
        _id: user._id,
        name: user.name,
        username: user.username,
        role: user.role,
        targetTotal: user.targetTotal,
        targetCore: user.targetCore,
        targetGoogleAds: user.targetGoogleAds,
      },
    });
  } catch (error) {
    console.error('Update user target error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while updating target',
      error: error.message,
    });
  }
};

// TOGGLE USER STATUS (Admin only)
exports.toggleUserStatus = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.',
      });
    }

    const { userId } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isActive must be a boolean value',
      });
    }

    if (userId === req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You cannot change your own account status',
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (isActive === false && user.role === 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin', isActive: true });
      if (adminCount <= 1) {
        return res.status(400).json({
          success: false,
          message: 'Cannot disable the last active admin account',
        });
      }
    }

    user.isActive = isActive;
    await user.save();

    return res.status(200).json({
      success: true,
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        role: user.role,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    console.error('Toggle user status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// RESET PASSWORD (Admin only)
exports.adminResetPassword = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.',
      });
    }

    const { userId, newPassword } = req.body;

    if (!userId || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'User ID and new password are required',
      });
    }

    if (newPassword.length < 4) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 4 characters',
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (user.isActive === false) {
      return res.status(400).json({
        success: false,
        message: 'Cannot reset password for disabled account',
      });
    }

    user.password = newPassword;
    user.lastPasswordChange = new Date();
    await user.save();

    return res.status(200).json({
      success: true,
      message: `Password reset successfully for ${user.username}`,
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// CHANGE OWN PASSWORD
exports.changeOwnPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required',
      });
    }

    if (newPassword.length < 4) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 4 characters',
      });
    }

    const user = await User.findById(userId).select('+password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        message: 'Account is disabled. Cannot change password.',
      });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect',
      });
    }

    user.password = newPassword;
    user.lastPasswordChange = new Date();
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// DELETE USER (Admin only)
exports.deleteUser = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.',
      });
    }

    const { userId } = req.params;

    if (userId === req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You cannot delete your own account',
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (user.role === 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount <= 1) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete the last admin account',
        });
      }
    }

    await User.findByIdAndDelete(userId);

    return res.status(200).json({
      success: true,
      message: `User ${user.username} deleted successfully`,
    });
  } catch (error) {
    console.error('Delete user error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// Request Password Reset
exports.requestPasswordReset = async (req, res) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({
        success: false,
        message: 'Username is required',
      });
    }

    const user = await User.findOne({ username: username.toLowerCase() });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found with this username',
      });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        message: 'Account is disabled. Please contact administrator.',
      });
    }

    if (user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Password reset is only available for admin accounts.',
      });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = Date.now() + 3600000;

    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = new Date(resetTokenExpiry);
    await user.save();

    const emailResult = await sendPasswordResetEmail(
      user.username,
      resetToken,
      user.name || user.username
    );

    if (!emailResult.success) {
      console.error('Email sending failed:', emailResult.error);
      return res.status(500).json({
        success: false,
        message: 'Failed to send reset email. Please try again later.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Password reset link sent to your email. Please check your inbox.',
    });

  } catch (error) {
    console.error('Request password reset error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while requesting password reset',
      error: error.message,
    });
  }
};

// Verify Reset Token
exports.verifyResetToken = async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Reset token is required',
      });
    }

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token. Please request a new password reset.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Token is valid',
      username: user.username,
    });

  } catch (error) {
    console.error('Verify reset token error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// Reset Password with Token
exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Token and new password are required',
      });
    }

    if (newPassword.length < 4) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 4 characters',
      });
    }

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token. Please request a new password reset.',
      });
    }

    user.password = newPassword;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    user.lastPasswordChange = new Date();
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Password reset successfully. You can now login with your new password.',
    });

  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while resetting password',
      error: error.message,
    });
  }
};

// Dropdown list
exports.getUsersForDropdown = async (req, res) => {
  try {
    const users = await User.find(
      { isActive: true },
      'name username role targetTotal targetCore targetGoogleAds'
    ).sort({ name: 1 });

    return res.status(200).json({
      success: true,
      data: users,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};
