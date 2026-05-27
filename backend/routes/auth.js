const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const auth = require('../middleware/auth');
const authController = require('../controllers/authController');
const passport = require('passport');
const jwt = require('jsonwebtoken');

// @route   POST api/auth/signup
// @desc    Register user
// @access  Public
router.post('/signup', [
  check('name', 'Name is required').not().isEmpty(),
  check('email', 'Please include a valid email').isEmail(),
  check('password', 'Please enter a password with 6 or more characters').isLength({ min: 6 })
], authController.signup);

// @route   POST api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', [
  check('email', 'Please include a valid email').isEmail(),
  check('password', 'Password is required').exists()
], authController.login);

// @route   GET api/auth/me
// @desc    Get user by token
// @access  Private
router.get('/me', auth, authController.getMe);

// @route   GET api/auth/github
// @desc    Authenticate with GitHub
// @access  Public
router.get('/github', passport.authenticate('github', { scope: [ 'user:email', 'repo' ] }));

// @route   GET api/auth/github/callback
// @desc    GitHub callback URL
// @access  Public
router.get('/github/callback', 
  passport.authenticate('github', { failureRedirect: '/login' }),
  function(req, res) {
    // Successful authentication, generate JWT
    const payload = {
      user: {
        id: req.user.id,
        role: req.user.role
      }
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET || 'stackpilot_super_secret',
      { expiresIn: '5h' },
      (err, token) => {
        if (err) throw err;
        // Redirect back to frontend with the token
        res.redirect(`http://localhost:5173/auth-callback?token=${token}`);
      }
    );
  }
);

module.exports = router;
