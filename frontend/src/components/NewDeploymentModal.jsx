import React, { useState } from 'react';
import { motion } from 'framer-motion';
import api from '../api';
import { X, Rocket, GitBranch, Globe, Loader2, AlertCircle } from 'lucide-react';

export default function NewDeploymentModal({ onClose, onCreated }) {
  const [formData, setFormData] = useState({
    name: '',
    repoUrl: '',
    branch: 'main',
    environment: 'development'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const onChange = e => setFormData({ ...formData, [e.target.name]: e.target.value });

  const onSubmit = async e => {
    e.preventDefault();
    setError('');

    if (!formData.name.trim() || !formData.repoUrl.trim()) {
      return setError('Name and repository URL are required.');
    }

    setLoading(true);
    try {
      await api.post('/deployments', formData);
      onCreated();
    } catch (err) {
      setError(err.response?.data?.msg || 'Failed to create deployment.');
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="flat-panel w-full max-w-lg p-8 relative"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-mint-500/20 flex items-center justify-center">
            <Rocket className="w-5 h-5 text-mint-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">New Deployment</h2>
            <p className="text-slate-400 text-xs">Deploy from a GitHub repository</p>
          </div>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl mb-6 text-sm"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </motion.div>
        )}

        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Service Name</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={onChange}
              required
              className="w-full px-4 py-3 bg-royal-900/50 border border-royal-800 rounded-xl focus:outline-none focus:border-mint-500 focus:ring-1 focus:ring-mint-500 text-white placeholder-slate-500 transition-all text-sm"
              placeholder="e.g. my-frontend-app"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              <span className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" />
                GitHub Repository URL
              </span>
            </label>
            <input
              type="url"
              name="repoUrl"
              value={formData.repoUrl}
              onChange={onChange}
              required
              className="w-full px-4 py-3 bg-royal-900/50 border border-royal-800 rounded-xl focus:outline-none focus:border-mint-500 focus:ring-1 focus:ring-mint-500 text-white placeholder-slate-500 transition-all text-sm font-mono"
              placeholder="https://github.com/user/repo.git"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <GitBranch className="w-3.5 h-3.5" />
                  Branch
                </span>
              </label>
              <input
                type="text"
                name="branch"
                value={formData.branch}
                onChange={onChange}
                className="w-full px-4 py-3 bg-royal-900/50 border border-royal-800 rounded-xl focus:outline-none focus:border-mint-500 focus:ring-1 focus:ring-mint-500 text-white placeholder-slate-500 transition-all text-sm"
                placeholder="main"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Environment</label>
              <select
                name="environment"
                value={formData.environment}
                onChange={onChange}
                className="w-full px-4 py-3 bg-royal-900/50 border border-royal-800 rounded-xl focus:outline-none focus:border-mint-500 focus:ring-1 focus:ring-mint-500 text-white transition-all text-sm cursor-pointer"
              >
                <option value="development">Development</option>
                <option value="staging">Staging</option>
                <option value="production">Production</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-mint-500 hover:bg-mint-400 text-royal-900 font-bold py-3.5 rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Deploying…
              </>
            ) : (
              <>
                <Rocket className="w-5 h-5" />
                Deploy Service
              </>
            )}
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}
