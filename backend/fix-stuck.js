// const mongoose = require('mongoose');
// const Deployment = require('./models/Deployment');

// mongoose.connect('mongodb://127.0.0.1:27017/stackpilot').then(async () => {
//   await Deployment.updateMany({ status: { $in: ['building', 'cloning', 'deploying'] } }, { $set: { status: 'failed' }});
//   console.log('Fixed stuck deployments!');
//   process.exit(0);
// });
// 
const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
  apiKey: "AIzaSyDfEAcOcrRn3j1FkOsoILIgOfmbqnkcAm4",
});

async function getAvailableModels() {
  try {
    const pager = await ai.models.list();

    // Convert pager to array
    const models = [];
    for await (const model of pager) {
      models.push(model.name);
    }

    console.log("\nAvailable Models:\n");

    models.forEach((model) => {
      console.log(model);
    });

    return models;
  } catch (err) {
    console.error("Failed to fetch models:");
    console.error(err.message);
  }
}

getAvailableModels();