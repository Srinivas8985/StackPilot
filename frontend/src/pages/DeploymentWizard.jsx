import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import api from '../api';

import {
  Globe, GitBranch, Search, Settings, FileCode, Rocket,
  Loader2, CheckCircle2, AlertCircle, ArrowRight, ArrowLeft,
  FolderTree, Cpu, Variable, Eye, ChevronRight, X, Plus, Trash2
} from 'lucide-react';

const STEPS = [
  { label: 'Repository', icon: Globe },
  { label: 'Analysis', icon: Search },
  { label: 'Configure', icon: Settings },
  { label: 'Env Vars', icon: Variable },
  { label: 'Dockerfile', icon: FileCode },
  { label: 'Deploy', icon: Rocket },
];

const PROJECT_TYPES = [
  { value: 'react-vite', label: 'React / Vite', icon: '⚛️' },
  { value: 'nextjs', label: 'Next.js', icon: '▲' },
  { value: 'express', label: 'Node.js Express', icon: '🟢' },
  { value: 'flask', label: 'Python Flask', icon: '🐍' },
  { value: 'django', label: 'Python Django', icon: '🎸' },
  { value: 'spring-boot', label: 'Java Spring Boot', icon: '☕' },
  { value: 'static', label: 'Static HTML/CSS', icon: '🌐' },
  { value: 'custom', label: 'Custom Dockerfile', icon: '🐳' },
];

export default function DeploymentWizard() {
  // Force HMR update
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1: Repo
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [name, setName] = useState('');

  // Step 2: Analysis
  const [analysis, setAnalysis] = useState(null);

  // Step 3: Config
  const [projectType, setProjectType] = useState('');
  const [deployFolder, setDeployFolder] = useState('.');
  const [environment, setEnvironment] = useState('development');
  const [buildConfig, setBuildConfig] = useState({
    installCommand: '', buildCommand: '', startCommand: '',
    exposedPort: 3000, nodeVersion: '20'
  });

  // Step 4: Env Vars
  const [envVars, setEnvVars] = useState([{ key: '', value: '' }]);

  // Step 5: Dockerfile
  const [dockerfile, setDockerfile] = useState('');
  const [useCustomDockerfile, setUseCustomDockerfile] = useState(false);

  // Step 6: Deploy result
  const [deployResult, setDeployResult] = useState(null);

  const handleAnalyze = async () => {
    setError(''); setLoading(true);
    try {
      const res = await api.post('/deployments/analyze', { repoUrl, branch });
      setAnalysis(res.data.analysis);
      if (res.data.analysis.detectedFramework) setProjectType(res.data.analysis.detectedFramework);
      if (res.data.analysis.hasDockerfile) setUseCustomDockerfile(true);
      if (!name) {
        const parts = repoUrl.replace(/\.git$/, '').split('/');
        setName(parts[parts.length - 1] || 'my-app');
      }
      setStep(1);
    } catch (err) {
      setError(err.response?.data?.msg || 'Failed to analyze repository');
    } finally { setLoading(false); }
  };

  const handleGenerateDockerfile = async () => {
    if (useCustomDockerfile && analysis?.hasDockerfile) { setStep(4); return; }
    setError(''); setLoading(true);
    try {
      const res = await api.post('/deployments/generate-dockerfile', {
        repoUrl, branch, projectType, deployFolder, buildConfig
      });
      setDockerfile(res.data.dockerfile);
      setStep(4);
    } catch (err) {
      setError(err.response?.data?.msg || 'Failed to generate Dockerfile');
    } finally { setLoading(false); }
  };

  const handleDeploy = async () => {
    setError(''); setLoading(true);
    try {
      const payload = {
        name, repoUrl, branch, environment, projectType, deployFolder,
        envVars: envVars.filter(e => e.key && e.value),
        buildConfig, useCustomDockerfile,
        generatedDockerfile: useCustomDockerfile ? null : dockerfile
      };
      const res = await api.post('/deployments', payload);
      setDeployResult(res.data);
      setStep(5);
    } catch (err) {
      setError(err.response?.data?.msg || 'Deployment failed');
    } finally { setLoading(false); }
  };

  const addEnvVar = () => setEnvVars([...envVars, { key: '', value: '' }]);
  const removeEnvVar = (i) => setEnvVars(envVars.filter((_, idx) => idx !== i));
  const updateEnvVar = (i, field, val) => {
    const updated = [...envVars];
    updated[i][field] = val;
    setEnvVars(updated);
  };

  const inputClass = "w-full px-4 py-3 bg-royal-900/50 border border-royal-800 rounded-xl focus:outline-none focus:border-mint-500 focus:ring-1 focus:ring-mint-500 text-white placeholder-slate-500 transition-all text-sm";

  return (
    <main className="relative z-10 p-6 lg:p-10">
        <div className="max-w-3xl mx-auto">
          {/* Progress Steps */}
          <div className="flex items-center justify-between mb-10">
            {STEPS.map((s, i) => (
              <div key={s.label} className="flex items-center gap-2">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  i < step ? 'bg-mint-500 text-royal-900' :
                  i === step ? 'bg-mint-500/20 text-mint-400 ring-2 ring-mint-500' :
                  'bg-royal-800 text-slate-500'
                }`}>
                  {i < step ? <CheckCircle2 className="w-5 h-5" /> : <s.icon className="w-4 h-4" />}
                </div>
                <span className={`hidden sm:block text-xs font-medium ${i <= step ? 'text-white' : 'text-slate-500'}`}>
                  {s.label}
                </span>
                {i < STEPS.length - 1 && <ChevronRight className="w-4 h-4 text-slate-600 mx-1 hidden sm:block" />}
              </div>
            ))}
          </div>

          {error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl mb-6 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />{error}
              <button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button>
            </motion.div>
          )}

          <AnimatePresence mode="wait">
            {/* ============ STEP 0: Repository URL ============ */}
            {step === 0 && (
              <motion.div key="s0" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
                className="flat-panel p-8">
                <h2 className="text-2xl font-bold text-white mb-1">Enter Repository</h2>
                <p className="text-slate-400 text-sm mb-8">Paste a GitHub, GitLab, or Bitbucket repository URL.</p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Repository URL</label>
                    <input type="text" value={repoUrl} onChange={e => setRepoUrl(e.target.value)}
                      className={inputClass + " font-mono"} placeholder="https://github.com/user/repo.git" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">Branch</label>
                      <input type="text" value={branch} onChange={e => setBranch(e.target.value)}
                        className={inputClass} placeholder="main" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">Service Name</label>
                      <input type="text" value={name} onChange={e => setName(e.target.value)}
                        className={inputClass} placeholder="my-app" />
                    </div>
                  </div>
                </div>
                <button onClick={handleAnalyze} disabled={loading || !repoUrl}
                  className="mt-8 w-full bg-mint-500 hover:bg-mint-400 text-royal-900 font-bold py-3.5 rounded-full shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-60">
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Search className="w-5 h-5" />Analyze Repository</>}
                </button>
              </motion.div>
            )}

            {/* ============ STEP 1: Analysis Results ============ */}
            {step === 1 && analysis && (
              <motion.div key="s1" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
                className="flat-panel p-8">
                <h2 className="text-2xl font-bold text-white mb-1">Repository Analysis</h2>
                <p className="text-slate-400 text-sm mb-6">We scanned your repository and found the following.</p>
                {/* Suggestions */}
                <div className="space-y-2 mb-6">
                  {analysis.suggestions.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-mint-400">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />{s}
                    </div>
                  ))}
                </div>
                {/* Detected Config Files */}
                {analysis.configFiles.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-slate-300 mb-2">Config Files Found</h4>
                    <div className="flex flex-wrap gap-2">
                      {analysis.configFiles.map(f => (
                        <span key={f} className="text-xs font-mono bg-royal-900 px-3 py-1.5 rounded-lg text-slate-300">{f}</span>
                      ))}
                    </div>
                  </div>
                )}
                {/* Deployable Folders */}
                {analysis.deployableFolders.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-slate-300 mb-2">Deployable Folders (Monorepo)</h4>
                    <div className="space-y-2">
                      {analysis.deployableFolders.map(f => (
                        <button key={f.path} onClick={() => setDeployFolder(f.path)}
                          className={`w-full text-left px-4 py-3 rounded-xl border transition-all text-sm ${
                            deployFolder === f.path ? 'border-mint-500 bg-mint-500/10 text-mint-400' : 'border-royal-800 bg-royal-900/50 text-slate-300 hover:border-slate-600'
                          }`}>
                          <FolderTree className="w-4 h-4 inline mr-2" />{f.path}/
                          {f.hasPackageJson && <span className="ml-2 text-xs text-slate-500">(package.json)</span>}
                        </button>
                      ))}
                      <button onClick={() => setDeployFolder('.')}
                        className={`w-full text-left px-4 py-3 rounded-xl border transition-all text-sm ${
                          deployFolder === '.' ? 'border-mint-500 bg-mint-500/10 text-mint-400' : 'border-royal-800 bg-royal-900/50 text-slate-300 hover:border-slate-600'
                        }`}>
                        <FolderTree className="w-4 h-4 inline mr-2" />. (root)
                      </button>
                    </div>
                  </div>
                )}
                {/* Folder Tree Preview */}
                {analysis.folderTree.length > 0 && (
                  <details className="mb-6">
                    <summary className="text-sm text-slate-400 cursor-pointer hover:text-slate-300">View folder tree</summary>
                    <div className="mt-2 bg-royal-900 rounded-xl p-4 font-mono text-xs text-slate-400 max-h-48 overflow-y-auto">
                      {renderTree(analysis.folderTree, 0)}
                    </div>
                  </details>
                )}
                <div className="flex gap-3">
                  <button onClick={() => setStep(0)} className="flex-1 py-3 rounded-full border border-royal-800 text-slate-300 hover:bg-royal-900/50 transition-all text-sm font-medium">
                    <ArrowLeft className="w-4 h-4 inline mr-1" />Back
                  </button>
                  <button onClick={() => setStep(2)} className="flex-1 bg-mint-500 hover:bg-mint-400 text-royal-900 font-bold py-3 rounded-full shadow-lg transition-all text-sm">
                    Continue<ArrowRight className="w-4 h-4 inline ml-1" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* ============ STEP 2: Configuration ============ */}
            {step === 2 && (
              <motion.div key="s2" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
                className="flat-panel p-8">
                <h2 className="text-2xl font-bold text-white mb-1">Configure Deployment</h2>
                <p className="text-slate-400 text-sm mb-6">Select project type and build settings.</p>
                {/* Project Type */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-slate-300 mb-2">Project Type</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {PROJECT_TYPES.map(pt => (
                      <button key={pt.value} onClick={() => setProjectType(pt.value)}
                        className={`px-3 py-3 rounded-xl border text-sm text-center transition-all ${
                          projectType === pt.value ? 'border-mint-500 bg-mint-500/10 text-mint-400' : 'border-royal-800 bg-royal-900/50 text-slate-300 hover:border-slate-600'
                        }`}>
                        <span className="text-lg block mb-1">{pt.icon}</span>{pt.label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Build Config */}
                <div className="space-y-4 mb-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Install Command</label>
                      <input type="text" value={buildConfig.installCommand} onChange={e => setBuildConfig({...buildConfig, installCommand: e.target.value})}
                        className={inputClass} placeholder="npm install" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Build Command</label>
                      <input type="text" value={buildConfig.buildCommand} onChange={e => setBuildConfig({...buildConfig, buildCommand: e.target.value})}
                        className={inputClass} placeholder="npm run build" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Start Command</label>
                      <input type="text" value={buildConfig.startCommand} onChange={e => setBuildConfig({...buildConfig, startCommand: e.target.value})}
                        className={inputClass} placeholder="npm start" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Exposed Port</label>
                      <input type="number" value={buildConfig.exposedPort} onChange={e => setBuildConfig({...buildConfig, exposedPort: parseInt(e.target.value) || 3000})}
                        className={inputClass} placeholder="3000" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Node Version</label>
                      <select value={buildConfig.nodeVersion} onChange={e => setBuildConfig({...buildConfig, nodeVersion: e.target.value})}
                        className={inputClass + " cursor-pointer"}>
                        <option value="20">Node 20</option><option value="18">Node 18</option><option value="16">Node 16</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Environment</label>
                    <select value={environment} onChange={e => setEnvironment(e.target.value)} className={inputClass + " cursor-pointer"}>
                      <option value="development">Development</option><option value="staging">Staging</option><option value="production">Production</option>
                    </select>
                  </div>
                </div>
                {analysis?.hasDockerfile && (
                  <label className="flex items-center gap-2 text-sm text-slate-300 mb-6 cursor-pointer">
                    <input type="checkbox" checked={useCustomDockerfile} onChange={e => setUseCustomDockerfile(e.target.checked)}
                      className="w-4 h-4 rounded border-royal-800 text-mint-500 focus:ring-mint-500 bg-royal-900/50" />
                    Use existing Dockerfile from repository
                  </label>
                )}
                <div className="flex gap-3">
                  <button onClick={() => setStep(1)} className="flex-1 py-3 rounded-full border border-royal-800 text-slate-300 hover:bg-royal-900/50 transition-all text-sm font-medium">
                    <ArrowLeft className="w-4 h-4 inline mr-1" />Back
                  </button>
                  <button onClick={() => setStep(3)} className="flex-1 bg-mint-500 hover:bg-mint-400 text-royal-900 font-bold py-3 rounded-full shadow-lg transition-all text-sm">
                    Continue<ArrowRight className="w-4 h-4 inline ml-1" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* ============ STEP 3: Environment Variables ============ */}
            {step === 3 && (
              <motion.div key="s3" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
                className="flat-panel p-8">
                <h2 className="text-2xl font-bold text-white mb-1">Environment Variables</h2>
                <p className="text-slate-400 text-sm mb-6">Add key-value pairs injected at container runtime.</p>
                <div className="space-y-3 mb-6">
                  {envVars.map((ev, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input type="text" value={ev.key} onChange={e => updateEnvVar(i, 'key', e.target.value)}
                        className={inputClass + " flex-1 font-mono"} placeholder="KEY" />
                      <span className="text-slate-500">=</span>
                      <input type="text" value={ev.value} onChange={e => updateEnvVar(i, 'value', e.target.value)}
                        className={inputClass + " flex-1 font-mono"} placeholder="value" />
                      <button onClick={() => removeEnvVar(i)} className="text-red-400 hover:text-red-300 p-2"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
                <button onClick={addEnvVar} className="flex items-center gap-1.5 text-sm text-mint-400 hover:text-mint-300 mb-8">
                  <Plus className="w-4 h-4" />Add Variable
                </button>
                <div className="flex gap-3">
                  <button onClick={() => setStep(2)} className="flex-1 py-3 rounded-full border border-royal-800 text-slate-300 hover:bg-royal-900/50 transition-all text-sm font-medium">
                    <ArrowLeft className="w-4 h-4 inline mr-1" />Back
                  </button>
                  <button onClick={handleGenerateDockerfile} disabled={loading}
                    className="flex-1 bg-mint-500 hover:bg-mint-400 text-royal-900 font-bold py-3 rounded-full shadow-lg transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Cpu className="w-4 h-4" />{useCustomDockerfile ? 'Skip to Deploy' : 'Generate Dockerfile'}</>}
                  </button>
                </div>
              </motion.div>
            )}

            {/* ============ STEP 4: Dockerfile Preview ============ */}
            {step === 4 && (
              <motion.div key="s4" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
                className="flat-panel p-8">
                <h2 className="text-2xl font-bold text-white mb-1">
                  {useCustomDockerfile ? 'Deploy Confirmation' : 'Auto-Generated Dockerfile'}
                </h2>
                <p className="text-slate-400 text-sm mb-6">
                  {useCustomDockerfile ? 'Using the Dockerfile from your repository.' : 'Review and edit the generated Dockerfile before deploying.'}
                </p>
                {!useCustomDockerfile && (
                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-2">
                      <FileCode className="w-4 h-4 text-cyan-400" />
                      <span className="text-sm font-medium text-slate-300">Dockerfile</span>
                      <span className="text-xs bg-cyan-400/10 text-cyan-400 px-2 py-0.5 rounded-full ml-auto">Auto-Generated</span>
                    </div>
                    <textarea value={dockerfile} onChange={e => setDockerfile(e.target.value)}
                      rows={16}
                      className="w-full px-4 py-3 bg-royal-900 border border-royal-800 rounded-xl focus:outline-none focus:border-mint-500 text-green-400 font-mono text-xs leading-relaxed resize-none"
                    />
                  </div>
                )}
                {/* Summary */}
                <div className="bg-royal-900 rounded-xl p-4 mb-6 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-slate-400">Service</span><span className="text-white font-medium">{name}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Branch</span><span className="text-white font-mono">{branch}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Framework</span><span className="text-white">{projectType || 'Auto'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Deploy Folder</span><span className="text-white font-mono">{deployFolder}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Port</span><span className="text-white">{buildConfig.exposedPort}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Env Vars</span><span className="text-white">{envVars.filter(e=>e.key).length}</span></div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setStep(3)} className="flex-1 py-3 rounded-full border border-royal-800 text-slate-300 hover:bg-royal-900/50 transition-all text-sm font-medium">
                    <ArrowLeft className="w-4 h-4 inline mr-1" />Back
                  </button>
                  <button onClick={handleDeploy} disabled={loading}
                    className="flex-1 bg-mint-500 hover:bg-mint-400 text-royal-900 font-bold py-3 rounded-full shadow-lg transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Rocket className="w-5 h-5" />Deploy Now</>}
                  </button>
                </div>
              </motion.div>
            )}

            {/* ============ STEP 5: Deploying ============ */}
            {step === 5 && deployResult && (
              <motion.div key="s5" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className="flat-panel p-8 text-center">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.2 }}>
                  <CheckCircle2 className="w-20 h-20 text-mint-500 mx-auto mb-4" />
                </motion.div>
                <h2 className="text-2xl font-bold text-white mb-2">Deployment Triggered!</h2>
                <p className="text-slate-400 text-sm mb-8">Your service is being built and deployed. Track progress on the deployments page.</p>
                <div className="bg-royal-900 rounded-xl p-4 mb-8 font-mono text-sm text-mint-400">
                  {deployResult.name} — {deployResult.status}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => navigate('/deployments')}
                    className="flex-1 bg-mint-500 hover:bg-mint-400 text-royal-900 font-bold py-3 rounded-full shadow-lg transition-all text-sm">
                    View Deployments
                  </button>
                  <button onClick={() => { setStep(0); setAnalysis(null); setDockerfile(''); setDeployResult(null); setError(''); }}
                    className="flex-1 py-3 rounded-full border border-royal-800 text-slate-300 hover:bg-royal-900/50 transition-all text-sm font-medium">
                    Deploy Another
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
    </main>
  );
}

function renderTree(nodes, depth) {
  return nodes.map((node, i) => (
    <div key={node.path} style={{ paddingLeft: depth * 16 }}>
      <span className={node.type === 'directory' ? 'text-cyan-400' : 'text-slate-500'}>
        {node.type === 'directory' ? '📁 ' : '📄 '}{node.name}
      </span>
      {node.children && renderTree(node.children, depth + 1)}
    </div>
  ));
}
