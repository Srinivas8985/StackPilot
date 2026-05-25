import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import api from '../api';

import DeploymentLogs from '../components/DeploymentLogs';
import {
  Rocket, Plus, Play, Square, RotateCcw, Trash2,
  GitBranch, Globe, Clock, CheckCircle2, AlertCircle,
  Loader2, ExternalLink, Terminal, Server, ChevronDown,
  Search, Filter, XCircle
} from 'lucide-react';

const STATUS_CONFIG = {
  queued:    { color: 'text-slate-400',  bg: 'bg-slate-400/10',  dot: 'bg-slate-400',  label: 'Queued' },
  cloning:   { color: 'text-blue-400',   bg: 'bg-blue-400/10',   dot: 'bg-blue-400',   label: 'Cloning' },
  building:  { color: 'text-amber-400',  bg: 'bg-amber-400/10',  dot: 'bg-amber-400',  label: 'Building' },
  deploying: { color: 'text-cyan-400',   bg: 'bg-cyan-400/10',   dot: 'bg-cyan-400',   label: 'Deploying' },
  running:   { color: 'text-green-400',  bg: 'bg-green-400/10',  dot: 'bg-green-400',  label: 'Running' },
  stopped:   { color: 'text-slate-500',  bg: 'bg-slate-500/10',  dot: 'bg-slate-500',  label: 'Stopped' },
  failed:    { color: 'text-red-400',    bg: 'bg-red-400/10',    dot: 'bg-red-400',     label: 'Failed' },
};

export default function Deployments() {
  // Force HMR update
  const [deployments, setDeployments] = useState([]);
  const [loading, setLoading] = useState(true);

  const [logsId, setLogsId] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const fetchDeployments = async () => {
    try {
      const res = await api.get('/deployments');
      setDeployments(res.data);
    } catch (err) {
      console.error('Failed to fetch deployments', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeployments();
    const interval = setInterval(fetchDeployments, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleStop = async (id) => {
    setActionLoading(id);
    try {
      await api.post(`/deployments/${id}/stop`);
      fetchDeployments();
    } catch (err) { console.error(err); }
    setActionLoading(null);
  };

  const handleStart = async (id) => {
    setActionLoading(id);
    try {
      await api.post(`/deployments/${id}/start`);
      fetchDeployments();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.msg || 'Failed to start deployment');
    }
    setActionLoading(null);
  };

  const handleRedeploy = async (id) => {
    setActionLoading(id);
    try {
      await api.post(`/deployments/${id}/redeploy`);
      fetchDeployments();
    } catch (err) { console.error(err); }
    setActionLoading(null);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this deployment permanently?')) return;
    setActionLoading(id);
    try {
      await api.delete(`/deployments/${id}`);
      fetchDeployments();
    } catch (err) { console.error(err); }
    setActionLoading(null);
  };

  const filtered = deployments.filter(d => {
    const matchSearch = d.name.toLowerCase().includes(search.toLowerCase()) ||
                        d.repoUrl.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || d.status === filter;
    return matchSearch && matchFilter;
  });

  const timeAgo = (date) => {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  return (
    <main className="relative z-10 p-6 lg:p-10">
        <div className="max-w-7xl mx-auto">

          {/* Header */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
            <div>
              <h1 className="text-3xl font-bold text-white mb-1">Deployments</h1>
              <p className="text-slate-400 text-sm">Manage your containerized services</p>
            </div>
            <Link
              to="/deploy"
              className="flex items-center gap-2 bg-mint-500 hover:bg-mint-400 text-royal-900 font-bold px-6 py-3 rounded-full shadow-lg hover:shadow-xl transition-all"
            >
              <Plus className="w-5 h-5" />
              New Deployment
            </Link>
          </div>

          {/* Filters Row */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search deployments…"
                className="w-full pl-10 pr-4 py-2.5 bg-royal-800 border-none rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-mint-500 text-sm"
              />
            </div>
            <select
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="bg-royal-800 border-none rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-mint-500 cursor-pointer"
            >
              <option value="all">All Status</option>
              <option value="running">Running</option>
              <option value="building">Building</option>
              <option value="stopped">Stopped</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          {/* Deployments Grid */}
          {loading ? (
            <div className="flex items-center justify-center py-32">
              <Loader2 className="w-8 h-8 text-mint-500 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flat-panel p-16 text-center"
            >
              <Server className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">
                {deployments.length === 0 ? 'No deployments yet' : 'No results found'}
              </h3>
              <p className="text-slate-400 text-sm mb-6">
                {deployments.length === 0
                  ? 'Deploy your first service by providing a GitHub repository URL.'
                  : 'Try adjusting your search or filter.'}
              </p>
              {deployments.length === 0 && (
                <Link
                  to="/deploy"
                  className="inline-flex items-center gap-2 bg-mint-500 hover:bg-mint-400 text-royal-900 font-bold px-6 py-3 rounded-full transition-all"
                >
                  <Rocket className="w-5 h-5" />
                  Create First Deployment
                </Link>
              )}
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <AnimatePresence>
                {filtered.map((dep, i) => {
                  const status = STATUS_CONFIG[dep.status] || STATUS_CONFIG.queued;
                  return (
                    <motion.div
                      key={dep._id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ delay: i * 0.05 }}
                      className="flat-panel p-6 hover:bg-royal-800/80 transition-colors group"
                    >
                      {/* Top Row */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <h3 className="text-lg font-semibold text-white truncate">{dep.name}</h3>
                            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${status.bg} ${status.color}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${status.dot} ${dep.status === 'building' || dep.status === 'cloning' || dep.status === 'deploying' ? 'animate-pulse' : ''}`} />
                              {status.label}
                            </span>
                          </div>
                          <p className="text-slate-500 text-xs truncate font-mono">{dep.repoUrl}</p>
                        </div>
                      </div>

                      {/* Meta Row */}
                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 mb-4">
                        <span className="flex items-center gap-1">
                          <GitBranch className="w-3.5 h-3.5" />
                          {dep.branch}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {timeAgo(dep.createdAt)}
                        </span>
                        {dep.port && (
                          <span className="flex items-center gap-1 text-cyan-400">
                            <Globe className="w-3.5 h-3.5" />
                            Port {dep.port}
                          </span>
                        )}
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-slate-800 rounded text-slate-400">
                          {dep.environment}
                        </span>
                      </div>

                      {/* URL */}
                      {dep.deploymentUrl && (
                        <a
                          href={dep.deploymentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm text-mint-400 hover:text-mint-300 transition-colors mb-4 font-mono"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          {dep.deploymentUrl}
                        </a>
                      )}

                      {/* Progress bar for in-progress deployments */}
                      {(dep.status === 'cloning' || dep.status === 'building' || dep.status === 'deploying') && (
                        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden mb-4">
                          <motion.div
                            initial={{ width: '0%' }}
                            animate={{
                              width: dep.status === 'cloning' ? '30%' : dep.status === 'building' ? '60%' : '90%'
                            }}
                            transition={{ duration: 1.5 }}
                            className="h-full bg-gradient-to-r from-cyan-400 to-mint-500"
                          />
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 pt-2 border-t border-slate-800/50">
                        <button
                          onClick={() => setLogsId(logsId === dep._id ? null : dep._id)}
                          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-royal-900/50 transition-colors"
                        >
                          <Terminal className="w-3.5 h-3.5" />
                          Logs
                        </button>

                        {dep.status === 'running' && (
                          <button
                            onClick={() => handleStop(dep._id)}
                            disabled={actionLoading === dep._id}
                            className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 px-3 py-1.5 rounded-lg hover:bg-amber-500/10 transition-colors"
                          >
                            {actionLoading === dep._id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}
                            Stop
                          </button>
                        )}

                        {(dep.status === 'stopped' || dep.status === 'failed') && (
                          <button
                            onClick={() => handleStart(dep._id)}
                            disabled={actionLoading === dep._id}
                            className="flex items-center gap-1.5 text-xs text-green-400 hover:text-green-300 px-3 py-1.5 rounded-lg hover:bg-green-500/10 transition-colors"
                          >
                            {actionLoading === dep._id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                            Start
                          </button>
                        )}

                        {(dep.status === 'stopped' || dep.status === 'failed') && (
                          <button
                            onClick={() => handleRedeploy(dep._id)}
                            disabled={actionLoading === dep._id}
                            className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 px-3 py-1.5 rounded-lg hover:bg-cyan-500/10 transition-colors"
                          >
                            {actionLoading === dep._id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                            Redeploy
                          </button>
                        )}

                        <button
                          onClick={() => handleDelete(dep._id)}
                          disabled={actionLoading === dep._id}
                          className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition-colors ml-auto"
                        >
                          {actionLoading === dep._id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          Delete
                        </button>
                      </div>

                      {/* Inline Logs */}
                      <AnimatePresence>
                        {logsId === dep._id && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                          >
                            <DeploymentLogs deploymentId={dep._id} />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
    </main>
  );
}
