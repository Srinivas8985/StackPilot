const fs = require('fs');
const path = require('path');

// Framework detection signatures
const SIGNATURES = {
  'react-vite': {
    files: ['vite.config.js', 'vite.config.ts'],
    packageKeywords: ['react', 'vite', '@vitejs/plugin-react'],
    label: 'React / Vite'
  },
  'nextjs': {
    files: ['next.config.js', 'next.config.mjs', 'next.config.ts'],
    packageKeywords: ['next'],
    label: 'Next.js'
  },
  'express': {
    files: [],
    packageKeywords: ['express'],
    label: 'Node.js Express'
  },
  'flask': {
    files: ['app.py', 'wsgi.py'],
    requirementsKeywords: ['flask'],
    label: 'Python Flask'
  },
  'django': {
    files: ['manage.py'],
    requirementsKeywords: ['django'],
    label: 'Python Django'
  },
  'spring-boot': {
    files: ['pom.xml', 'build.gradle'],
    label: 'Java Spring Boot'
  },
  'static': {
    files: ['index.html'],
    label: 'Static HTML/CSS'
  }
};

/**
 * Analyze a cloned repository directory.
 * Returns: { framework, folders, hasDockerfile, configFiles, packageInfo, folderTree }
 */
function analyzeRepository(repoDir) {
  const result = {
    detectedFramework: null,
    frameworkLabel: null,
    hasDockerfile: false,
    configFiles: [],
    packageInfo: null,
    requirementsInfo: null,
    folderTree: [],
    deployableFolders: [],
    suggestions: []
  };

  if (!fs.existsSync(repoDir)) return result;

  // Check for Dockerfile
  result.hasDockerfile = fs.existsSync(path.join(repoDir, 'Dockerfile'));

  // Build folder tree (max 2 levels deep)
  result.folderTree = buildFolderTree(repoDir, repoDir, 0, 2);

  // Scan for config files
  const configFileNames = [
    'package.json', 'requirements.txt', 'pom.xml', 'build.gradle',
    'vite.config.js', 'vite.config.ts', 'next.config.js', 'next.config.mjs',
    'next.config.ts', 'Dockerfile', '.dockerignore', 'docker-compose.yml',
    'tsconfig.json', 'webpack.config.js', 'manage.py', 'app.py'
  ];

  scanForFiles(repoDir, configFileNames, result.configFiles, repoDir);

  // Read package.json if exists
  const pkgPath = path.join(repoDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      result.packageInfo = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    } catch (_) {}
  }

  // Read requirements.txt if exists
  const reqPath = path.join(repoDir, 'requirements.txt');
  if (fs.existsSync(reqPath)) {
    try {
      result.requirementsInfo = fs.readFileSync(reqPath, 'utf-8');
    } catch (_) {}
  }

  // Detect framework
  result.detectedFramework = detectFramework(repoDir, result.packageInfo, result.requirementsInfo);
  if (result.detectedFramework && SIGNATURES[result.detectedFramework]) {
    result.frameworkLabel = SIGNATURES[result.detectedFramework].label;
  }

  // Detect deployable sub-folders (common monorepo patterns)
  const commonFolders = ['frontend', 'backend', 'client', 'server', 'web', 'api', 'app',
                         'apps/web', 'apps/api', 'apps/frontend', 'apps/backend',
                         'packages/web', 'packages/api', 'src'];
  for (const folder of commonFolders) {
    const fullPath = path.join(repoDir, folder);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
      // Check if sub-folder has its own package.json or app files
      const subPkg = fs.existsSync(path.join(fullPath, 'package.json'));
      const subReq = fs.existsSync(path.join(fullPath, 'requirements.txt'));
      const subIndex = fs.existsSync(path.join(fullPath, 'index.html'));
      if (subPkg || subReq || subIndex) {
        result.deployableFolders.push({
          path: folder,
          hasPackageJson: subPkg,
          hasRequirements: subReq,
          hasIndex: subIndex
        });
      }
    }
  }

  // Generate suggestions
  if (result.detectedFramework) {
    result.suggestions.push(`Detected ${result.frameworkLabel} project`);
  }
  if (result.hasDockerfile) {
    result.suggestions.push('Dockerfile found — will use existing Dockerfile');
  } else {
    result.suggestions.push('No Dockerfile found — AI will generate an optimized one');
  }
  if (result.deployableFolders.length > 0) {
    result.suggestions.push(`Monorepo detected — ${result.deployableFolders.length} deployable folder(s) found`);
  }

  return result;
}

function detectFramework(repoDir, packageInfo, requirementsInfo) {
  // Check file-based signatures first
  for (const [key, sig] of Object.entries(SIGNATURES)) {
    if (sig.files) {
      for (const file of sig.files) {
        if (fs.existsSync(path.join(repoDir, file))) {
          return key;
        }
      }
    }
  }

  // Check package.json dependencies
  if (packageInfo) {
    const allDeps = {
      ...packageInfo.dependencies,
      ...packageInfo.devDependencies
    };
    const depNames = Object.keys(allDeps || {});

    for (const [key, sig] of Object.entries(SIGNATURES)) {
      if (sig.packageKeywords) {
        for (const keyword of sig.packageKeywords) {
          if (depNames.includes(keyword)) return key;
        }
      }
    }
  }

  // Check requirements.txt
  if (requirementsInfo) {
    const lower = requirementsInfo.toLowerCase();
    for (const [key, sig] of Object.entries(SIGNATURES)) {
      if (sig.requirementsKeywords) {
        for (const keyword of sig.requirementsKeywords) {
          if (lower.includes(keyword)) return key;
        }
      }
    }
  }

  return null;
}

function buildFolderTree(baseDir, currentDir, depth, maxDepth) {
  if (depth > maxDepth) return [];
  const items = [];

  try {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      // Skip hidden files, node_modules, .git
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '__pycache__') continue;

      const relativePath = path.relative(baseDir, path.join(currentDir, entry.name)).replace(/\\/g, '/');
      if (entry.isDirectory()) {
        items.push({
          name: entry.name,
          path: relativePath,
          type: 'directory',
          children: buildFolderTree(baseDir, path.join(currentDir, entry.name), depth + 1, maxDepth)
        });
      } else {
        items.push({
          name: entry.name,
          path: relativePath,
          type: 'file'
        });
      }
    }
  } catch (_) {}

  return items;
}

function scanForFiles(dir, fileNames, results, baseDir, depth = 0) {
  if (depth > 2) return;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && fileNames.includes(entry.name)) {
        results.push(path.relative(baseDir, fullPath).replace(/\\/g, '/'));
      } else if (entry.isDirectory() && depth < 2) {
        scanForFiles(fullPath, fileNames, results, baseDir, depth + 1);
      }
    }
  } catch (_) {}
}

/**
 * Get context for Gemini AI (lightweight — NOT full repo)
 */
function getAIContext(repoDir, deployFolder = '.') {
  const targetDir = path.join(repoDir, deployFolder);
  const context = {
    projectType: null,
    packageJson: null,
    requirementsTxt: null,
    pomXml: null,
    scripts: null,
    dependencies: null,
    files: [],
    folderTree: [],
    hasDockerfile: false
  };

  if (!fs.existsSync(targetDir)) return context;

  // List top-level files
  try {
    const entries = fs.readdirSync(targetDir);
    context.files = entries.filter(e => !e.startsWith('.') && e !== 'node_modules' && e !== '__pycache__');
    context.folderTree = buildFolderTree(targetDir, targetDir, 0, 2);
  } catch (_) {}

  // package.json
  const pkgPath = path.join(targetDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      context.packageJson = {
        name: pkg.name,
        scripts: pkg.scripts,
        dependencies: pkg.dependencies,
        devDependencies: pkg.devDependencies
      };
      context.scripts = pkg.scripts;
      context.dependencies = { ...pkg.dependencies, ...pkg.devDependencies };
    } catch (_) {}
  }

  // requirements.txt
  const reqPath = path.join(targetDir, 'requirements.txt');
  if (fs.existsSync(reqPath)) {
    try { context.requirementsTxt = fs.readFileSync(reqPath, 'utf-8'); } catch (_) {}
  }

  // pom.xml (first 50 lines)
  const pomPath = path.join(targetDir, 'pom.xml');
  if (fs.existsSync(pomPath)) {
    try {
      const content = fs.readFileSync(pomPath, 'utf-8');
      context.pomXml = content.split('\n').slice(0, 50).join('\n');
    } catch (_) {}
  }

  context.hasDockerfile = fs.existsSync(path.join(targetDir, 'Dockerfile'));

  return context;
}

module.exports = { analyzeRepository, getAIContext, detectFramework };
