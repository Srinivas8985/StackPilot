const { GoogleGenAI } = require("@google/genai");

let aiInstance = null;
function getAI() {
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return aiInstance;
}

let lastSuccessfulModel = null;

async function getAvailableModels() {
  try {
    const pager = await getAI().models.list();
    const models = [];
    for await (const model of pager) {
      const name = model.name.replace("models/", "");
      if (
        name.includes("gemini") &&
        !name.includes("embedding") &&
        !name.includes("image") &&
        !name.includes("tts")
      ) {
        models.push(name);
      }
    }
    return models;
  } catch (err) {
    console.error("Failed to fetch models:", err.message);
    return ['gemini-2.5-flash', 'gemini-1.5-pro', 'gemini-1.5-flash']; // Hardcoded fallback
  }
}

/**
 * Generate an optimized Dockerfile using Gemini AI.
 *
 * @param {Object} params
 * @param {string} params.projectType - e.g. 'react-vite', 'nextjs', 'express', 'flask', 'django', 'spring-boot', 'static'
 * @param {Object} params.aiContext - lightweight repo context from repoAnalyzer.getAIContext()
 * @param {Object} params.buildConfig - user-specified build settings
 * @param {number} params.exposedPort - port the container should expose
 * @returns {Promise<string>} generated Dockerfile content
 */
async function generateDockerfile({ projectType, aiContext, buildConfig = {}, exposedPort = 3000 }) {
  const prompt = buildPrompt({ projectType, aiContext, buildConfig, exposedPort });
  
  let models;
  try {
    models = await getAvailableModels();
  } catch (err) {
    models = ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'];
  }

  // Prioritize the last successful model
  if (lastSuccessfulModel && models.includes(lastSuccessfulModel)) {
    models = [lastSuccessfulModel, ...models.filter(m => m !== lastSuccessfulModel)];
  }

  for (const model of models) {
    try {
      console.log(`\n[AI] Trying model: ${model}`);

      const response = await getAI().models.generateContent({
        model,
        contents: prompt,
      });

      console.log(`[AI] Success with model: ${model}`);
      lastSuccessfulModel = model;
      const text = response.text;

      // Extract Dockerfile content from markdown code block if present
      const dockerfileMatch = text.match(/```(?:dockerfile|Dockerfile)?\s*\n([\s\S]*?)```/);
      if (dockerfileMatch) {
        return dockerfileMatch[1].trim();
      }

      // If no code block, return the whole text
      return text.trim();
    } catch (err) {
      console.warn(`[AI] Failed model: ${model}`);
      console.warn(err.message);
    }
  }

  console.error('[AI] All AI models failed. Falling back to template-based generation.');
  return generateFallbackDockerfile({ projectType, buildConfig, exposedPort });
}

function buildPrompt({ projectType, aiContext, buildConfig, exposedPort }) {
  let prompt = `You are a DevOps expert. Generate a production-ready, optimized Dockerfile for the following project.

RULES:
- Use multi-stage builds when beneficial
- Use lightweight base images (alpine, slim)
- Follow Docker best practices
- Only output the Dockerfile content inside a single code block
- No explanations, just the Dockerfile
- Optimize for small image size and fast builds
- Include proper EXPOSE
- IMPORTANT: Use wildcards for lockfiles (e.g., COPY package*.json ./) because package-lock.json or yarn.lock might not exist in the repository! NEVER explicitly copy a lockfile by exact name.
- IMPORTANT: For CMD or ENTRYPOINT, if using the array/exec form, separate the arguments properly (e.g. CMD ["npm", "start"] NOT CMD ["npm start"]). Alternatively, use the shell form (e.g. CMD npm start).
- CRITICAL: The Docker build context is strictly the folder shown in the structure below. DO NOT prepend parent folder names (like "frontend/" or "server/") in your COPY commands. Act as if the provided structure is the absolute root of the repository.

PROJECT DETAILS:
- Project type: ${projectType || 'auto-detect'}
- Exposed port: ${exposedPort}
`;

  if (buildConfig.installCommand) {
    prompt += `- Install command: ${buildConfig.installCommand}\n`;
  }
  if (buildConfig.buildCommand) {
    prompt += `- Build command: ${buildConfig.buildCommand}\n`;
  }
  if (buildConfig.startCommand) {
    prompt += `- Start command: ${buildConfig.startCommand}\n`;
  }
  if (buildConfig.nodeVersion) {
    prompt += `- Node.js version: ${buildConfig.nodeVersion}\n`;
  }

  if (aiContext.packageJson) {
    prompt += `\npackage.json (summary):\n${JSON.stringify(aiContext.packageJson, null, 2)}\n`;
  }

  if (aiContext.requirementsTxt) {
    prompt += `\nrequirements.txt:\n${aiContext.requirementsTxt}\n`;
  }

  if (aiContext.pomXml) {
    prompt += `\npom.xml (first 50 lines):\n${aiContext.pomXml}\n`;
  }

  if (aiContext.folderTree && aiContext.folderTree.length > 0) {
    prompt += `\nRepository Structure (up to 2 levels deep):\n${JSON.stringify(aiContext.folderTree, null, 2)}\n`;
  } else if (aiContext.files && aiContext.files.length > 0) {
    prompt += `\nTop-level files: ${aiContext.files.join(', ')}\n`;
  }

  // Framework-specific hints
  if (projectType === 'react-vite') {
    prompt += `\nFRAMEWORK HINTS:
- This is a React/Vite project
- Use multi-stage build: build with Node, serve with nginx
- Build output is typically in dist/ (Vite) or build/ (CRA)
- Use nginx:alpine for serving
- CRITICAL: DO NOT attempt to COPY an nginx.conf file from the repository! It does not exist.
- INSTEAD, you MUST generate the nginx configuration dynamically inside the Dockerfile using a RUN command.
- Example: RUN echo 'server { listen 3000; root /usr/share/nginx/html; location / { try_files $uri $uri/ /index.html; } }' > /etc/nginx/conf.d/default.conf\n`;
  } else if (projectType === 'nextjs') {
    prompt += `\nFRAMEWORK HINTS:
- This is a Next.js project
- Use standalone output mode if configured
- Use multi-stage build
- Copy .next/standalone and .next/static\n`;
  } else if (projectType === 'flask') {
    prompt += `\nFRAMEWORK HINTS:
- Use python:3.12-slim
- Install dependencies from requirements.txt
- Use gunicorn for production
- Default WSGI entry: app:app\n`;
  } else if (projectType === 'django') {
    prompt += `\nFRAMEWORK HINTS:
- Use python:3.12-slim
- Install dependencies from requirements.txt
- Use gunicorn for production
- Collect static files
- Default WSGI: project.wsgi:application\n`;
  } else if (projectType === 'spring-boot') {
    prompt += `\nFRAMEWORK HINTS:
- Use eclipse-temurin Java image
- Use multi-stage build: build with Maven/Gradle, run with JRE
- Copy the built JAR file\n`;
  }

  return prompt;
}

/**
 * Fallback Dockerfile templates when Gemini API is unavailable
 */
function generateFallbackDockerfile({ projectType, buildConfig, exposedPort }) {
  const port = exposedPort || 3000;
  const nodeVer = buildConfig.nodeVersion || '20';
  const installCmd = buildConfig.installCommand || 'npm install';
  const buildCmd = buildConfig.buildCommand || '';
  const startCmd = buildConfig.startCommand || 'npm start';

  const templates = {
    'react-vite': `# Stage 1: Build
FROM node:${nodeVer}-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN ${installCmd}
COPY . .
RUN ${buildCmd || 'npm run build'}

# Stage 2: Serve
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
RUN echo 'server { listen ${port}; root /usr/share/nginx/html; location / { try_files $uri $uri/ /index.html; } }' > /etc/nginx/conf.d/default.conf
EXPOSE ${port}
CMD ["nginx", "-g", "daemon off;"]`,

    'nextjs': `FROM node:${nodeVer}-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN ${installCmd}
COPY . .
RUN ${buildCmd || 'npm run build'}

FROM node:${nodeVer}-alpine
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
EXPOSE ${port}
CMD ${startCmd || 'npm start'}`,

    'express': `FROM node:${nodeVer}-alpine
WORKDIR /app
COPY package*.json ./
RUN ${installCmd} --only=production
COPY . .
EXPOSE ${port}
CMD ${startCmd || 'npm start'}`,

    'flask': `FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE ${port}
CMD ["gunicorn", "--bind", "0.0.0.0:${port}", "app:app"]`,

    'django': `FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN python manage.py collectstatic --noinput
EXPOSE ${port}
CMD ["gunicorn", "--bind", "0.0.0.0:${port}", "config.wsgi:application"]`,

    'spring-boot': `FROM eclipse-temurin:21-jdk AS builder
WORKDIR /app
COPY . .
RUN ./mvnw package -DskipTests

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=builder /app/target/*.jar app.jar
EXPOSE ${port}
CMD ["java", "-jar", "app.jar"]`,

    'static': `FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE ${port}
CMD ["nginx", "-g", "daemon off;"]`
  };

  return templates[projectType] || templates['express'];
}

module.exports = { generateDockerfile, generateFallbackDockerfile };
