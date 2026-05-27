const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const githubService = require('../services/githubService');
const deploymentController = require('../controllers/deploymentController');
const User = require('../models/User');

// @route   GET api/github/repos
// @desc    Get user repositories (public & private)
// @access  Private
router.get('/repos', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || !user.githubAccessToken) {
      return res.status(400).json({ msg: 'GitHub not connected' });
    }

    const repos = await githubService.fetchUserRepositories(user.githubAccessToken);
    res.json(repos);
  } catch (err) {
    console.error('[GitHub Route] Error fetching repos:', err.message);
    res.status(500).json({ msg: 'Server error fetching repositories' });
  }
});

// @route   POST api/github/webhook
// @desc    Handle incoming GitHub push events
// @access  Public
router.post('/webhook', express.json({type: 'application/json'}), deploymentController.handleGitHubWebhook);

module.exports = router;
