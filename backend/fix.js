const mongoose = require('mongoose');
const Deployment = require('./models/Deployment');

mongoose.connect('mongodb://127.0.0.1:27017/stackpilot').then(async () => {
  const dep = await Deployment.findById('6a12bbaa5dd8f0bf7fcf22e4');
  if (dep) {
    if (dep.generatedDockerfile) {
      dep.generatedDockerfile = dep.generatedDockerfile.replace('CMD ["npm start"]', 'CMD ["npm", "start"]');
      await dep.save();
      console.log('Fixed dockerfile in DB');
    }
  }
  process.exit(0);
});
