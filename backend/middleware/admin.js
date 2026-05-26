const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Middleware that checks if the authenticated user has admin role.
 * Must be used AFTER the standard auth middleware.
 */
module.exports = async function (req, res, next) {
  try {
    const user = await User.findById(req.user.id).select('role');
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ msg: 'Admin access required' });
    }
    next();
  } catch (err) {
    console.error('Admin middleware error:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
};
