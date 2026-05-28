const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;
const User = require('../models/User');

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID || 'your_client_id',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || 'your_client_secret',
    callbackURL: `${process.env.PUBLIC_API_URL || 'http://localhost:5000'}/api/auth/github/callback`,
    scope: ['user:email', 'repo']
  },
  async function(accessToken, refreshToken, profile, done) {
    try {
      // Find existing user by githubId
      let user = await User.findOne({ githubId: profile.id });
      
      if (!user) {
        // Fallback: Check if a user with this email exists
        const email = profile.emails && profile.emails.length > 0 ? profile.emails[0].value : `${profile.username}@github.com`;
        user = await User.findOne({ email });
        
        if (user) {
          // Link github account to existing user
          user.githubId = profile.id;
          user.githubUsername = profile.username;
          user.githubAvatar = profile.photos && profile.photos.length > 0 ? profile.photos[0].value : null;
          user.githubAccessToken = accessToken;
          await user.save();
        } else {
          // Create new user
          user = new User({
            name: profile.displayName || profile.username,
            email: email,
            password: Math.random().toString(36).slice(-10) + 'A1!', // random temp password
            githubId: profile.id,
            githubUsername: profile.username,
            githubAvatar: profile.photos && profile.photos.length > 0 ? profile.photos[0].value : null,
            githubAccessToken: accessToken,
            role: 'user'
          });
          await user.save();
        }
      } else {
        // Update access token
        user.githubAccessToken = accessToken;
        user.githubAvatar = profile.photos && profile.photos.length > 0 ? profile.photos[0].value : null;
        await user.save();
      }
      
      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  }
));

module.exports = passport;
