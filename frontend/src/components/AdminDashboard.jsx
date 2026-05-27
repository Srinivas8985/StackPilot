import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell
} from 'recharts';
import {
  Shield, Server, Users, Activity, Settings, RefreshCw,
  Play, Square, Trash2, AlertCircle, CheckCircle2, Clock,
  Database, Cpu, HardDrive, GitBranch, Loader2, ToggleLeft,
  ToggleRight, Zap, Box, ChevronRight, Terminal, Globe, Rocket
} from 'lucide-react';
import api from '../api';

const STATUS_DOT = {
  running:    'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.6)]',
  building:   'bg-amber-400 animate-pulse',
  deploying:  'bg-cyan-400 animate-pulse',
  stopped:    'bg-slate-500',
  failed:     'bg-red-400',
  queued:     'bg-slate-400 animate-pulse',
};

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [config, setConfig] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [actionLoading, setActionLoading] = useState('');

  const fetchAll = useCallback(async () => {
    try {
      const [statsRes, configRes, usersRes] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/config'),
        api.get('/admin/users')
      ]);
      setStats(statsRes.data);
      setConfig(configRes.data);
      setUsers(usersRes.data);
    } catch (err) {
      console.error('Admin fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const iv = setInterval(fetchAll, 8000);
    return () => clearInterval(iv);
  }, [fetchAll]);

  const updateConfig = async (updates) => {
    try {
      const res = await api.put('/admin/config', updates);
      setConfig(res.data);
    } catch (err) {
      console.error('Config update error:', err);
    }
  };

  const triggerAction = async (action, label) => {
    setActionLoading(label);
    try {
      await api.post(action);
      await fetchAll();
    } catch (err) {
      console.error(`${label} error:`, err);
    } finally {
      setActionLoading('');
    }
  };

  const updateUserRole = async (userId, role) => {
    try {
      await api.put(`/admin/users/${userId}/role`, { role });
      await fetchAll();
    } catch (err) {
      console.error('Role update error:', err);
    }
  };

  const adminRedeploy = async (depId) => {
    setActionLoading(`redeploy-${depId}`);
    try {
      await api.post(`/admin/deployments/${depId}/redeploy`);
      await fetchAll();
    } catch (err) {
      console.error('Admin redeploy error:', err);
    } finally {
      setActionLoading('');
    }
  };

  const adminDelete = async (depId) => {
    if (!confirm('Delete this deployment permanently?')) return;
    setActionLoading(`delete-${depId}`);
    try {
      await api.delete(`/admin/deployments/${depId}`);
      await fetchAll();
    } catch (err) {
      console.error('Admin delete error:', err);
    } finally {
      setActionLoading('');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-32">
        <Loader2 className="w-8 h-8 animate-spin text-mint-500" />
      </div>
    );
  }

  const TABS = [
    { key: 'overview', label: 'Overview', icon: <Activity className="w-4 h-4" /> },
    { key: 'deployments', label: 'Deployments', icon: <Server className="w-4 h-4" /> },
    { key: 'users', label: 'Users', icon: <Users className="w-4 h-4" /> },
    { key: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
  ];

  const CHART_COLORS = ['#0df0a3', '#00d4ff', '#a78bfa', '#f472b6'];

  const pieData = stats ? [
    { name: 'Running', value: stats.deployments.running, color: '#0df0a3' },
    { name: 'Stopped', value: stats.deployments.stopped, color: '#64748b' },
    { name: 'Failed', value: stats.deployments.failed, color: '#f87171' },
  ].filter(d => d.value > 0) : [];

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto space-y-8 w-full">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">Admin Portal</h1>
            <p className="text-blue-200 text-sm">Platform management & monitoring</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${stats?.jenkins?.online ? 'bg-green-400/10 text-green-400 border border-green-400/20' : 'bg-red-400/10 text-red-400 border border-red-400/20'}`}>
            <div className={`w-2 h-2 rounded-full ${stats?.jenkins?.online ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.6)]' : 'bg-red-400'}`} />
            Jenkins {stats?.jenkins?.online ? 'Online' : 'Offline'}
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 bg-royal-800/50 border border-royal-700 rounded-xl p-1">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-mint-500/10 text-mint-400 shadow-sm'
                : 'text-blue-200/80 hover:text-white hover:bg-white/10'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* ─── OVERVIEW TAB ─── */}
        {activeTab === 'overview' && (
          <motion.div key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-8">
            {/* Metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Total Deployments', value: stats?.deployments?.total || 0, icon: <Box className="w-6 h-6 text-cyan-400" />, sub: `${stats?.deployments?.autoDeploy || 0} auto-deploy` },
                { label: 'Running', value: stats?.deployments?.running || 0, icon: <Activity className="w-6 h-6 text-mint-500" />, sub: 'Active containers' },
                { label: 'Failed', value: stats?.deployments?.failed || 0, icon: <AlertCircle className="w-6 h-6 text-red-400" />, sub: 'Needs attention' },
                { label: 'Total Users', value: stats?.users?.total || 0, icon: <Users className="w-6 h-6 text-purple-400" />, sub: 'Registered accounts' },
              ].map((m, i) => (
                <div key={i} className="bg-white/5 border border-white/10 p-6 rounded-2xl hover:border-white/20 transition-colors backdrop-blur-md">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/5 mb-4 shadow-sm">{m.icon}</div>
                  <div className="text-3xl font-bold text-white mb-1 drop-shadow-md">{m.value}</div>
                  <div className="text-sm text-blue-100 font-medium">{m.label}</div>
                  <div className="text-xs text-blue-200/60 mt-3 pt-3 border-t border-white/10">{m.sub}</div>
                </div>
              ))}
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Timeline Chart */}
              <div className="lg:col-span-2 bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-white"><Activity className="w-5 h-5 text-mint-500" /> Deployment Timeline</h3>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats?.timeline || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="_id" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis stroke="#64748b" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }} />
                      <Bar dataKey="successes" fill="#0df0a3" radius={[6, 6, 0, 0]} name="Success" />
                      <Bar dataKey="failures" fill="#f87171" radius={[6, 6, 0, 0]} name="Failed" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Status Pie */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
                <h3 className="text-lg font-bold mb-4 text-white">Status Distribution</h3>
                {pieData.length > 0 ? (
                  <div className="h-56 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">
                          {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-56 flex items-center justify-center text-slate-500 text-sm">No deployments yet</div>
                )}
                <div className="flex justify-center gap-4 mt-2">
                  {pieData.map(d => (
                    <div key={d.name} className="flex items-center gap-1.5 text-xs text-blue-200">
                      <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: d.color }} />
                      {d.name} ({d.value})
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Docker & Jenkins Info */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-white"><Database className="w-5 h-5 text-cyan-400" /> Docker Resources</h3>
                <div className="space-y-3">
                  {[
                    { label: 'Running Containers', value: stats?.docker?.containers },
                    { label: 'Images', value: stats?.docker?.images },
                    { label: 'Memory', value: stats?.docker?.memoryUsage },
                    { label: 'CPUs', value: stats?.docker?.cpuUsage },
                  ].map((item, i) => (
                    <div key={i} className="flex justify-between items-center py-2 border-b border-white/5 last:border-0">
                      <span className="text-sm text-blue-200">{item.label}</span>
                      <span className="text-sm font-mono text-white">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-white"><Terminal className="w-5 h-5 text-purple-400" /> Quick Actions</h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Force Poll', action: '/admin/polling/trigger', icon: <RefreshCw className="w-4 h-4" /> },
                    { label: 'Run Cleanup', action: '/admin/cleanup', icon: <Trash2 className="w-4 h-4" /> },
                    { label: 'Docker Prune', action: '/admin/docker/prune', icon: <HardDrive className="w-4 h-4" /> },
                  ].map(btn => (
                    <button
                      key={btn.label}
                      onClick={() => triggerAction(btn.action, btn.label)}
                      disabled={!!actionLoading}
                      className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white px-4 py-3 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                    >
                      {actionLoading === btn.label ? <Loader2 className="w-4 h-4 animate-spin" /> : btn.icon}
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ─── DEPLOYMENTS TAB ─── */}
        {activeTab === 'deployments' && (
          <motion.div key="deployments" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="bg-royal-800/30 border border-royal-700 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-royal-700 flex items-center justify-between">
                <h3 className="font-bold flex items-center gap-2"><Server className="w-5 h-5 text-mint-500" /> All Deployments ({stats?.deployments?.total || 0})</h3>
              </div>
              <div className="divide-y divide-royal-800/50">
                {(stats?.recentDeployments || []).map(dep => (
                  <div key={dep._id} className="flex items-center gap-4 px-6 py-4 hover:bg-royal-800/30 transition-colors">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${STATUS_DOT[dep.status] || 'bg-slate-500'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-white truncate">{dep.name}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                        <GitBranch className="w-3 h-3" /> {dep.branch}
                        {dep.autoDeployEnabled && <span className="text-mint-400 flex items-center gap-1"><Zap className="w-3 h-3" /> Auto</span>}
                        {dep.user && <span>• {dep.user.name}</span>}
                      </div>
                    </div>
                    <div className={`px-2.5 py-1 text-xs font-semibold rounded-lg ${
                      dep.status === 'running' ? 'bg-green-400/10 text-green-400' :
                      dep.status === 'failed' ? 'bg-red-400/10 text-red-400' :
                      'bg-slate-400/10 text-slate-400'
                    }`}>{dep.status}</div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => adminRedeploy(dep._id)}
                        disabled={actionLoading === `redeploy-${dep._id}`}
                        className="text-cyan-400 hover:text-cyan-300 p-1.5 rounded-lg hover:bg-royal-800 transition-colors"
                        title="Redeploy"
                      >
                        {actionLoading === `redeploy-${dep._id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => adminDelete(dep._id)}
                        disabled={actionLoading === `delete-${dep._id}`}
                        className="text-red-400 hover:text-red-300 p-1.5 rounded-lg hover:bg-royal-800 transition-colors"
                        title="Delete"
                      >
                        {actionLoading === `delete-${dep._id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                ))}
                {(!stats?.recentDeployments || stats.recentDeployments.length === 0) && (
                  <div className="p-12 text-center text-slate-500">No deployments found</div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* ─── USERS TAB ─── */}
        {activeTab === 'users' && (
          <motion.div key="users" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="bg-royal-800/30 border border-royal-700 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-royal-700">
                <h3 className="font-bold flex items-center gap-2"><Users className="w-5 h-5 text-purple-400" /> User Management ({users.length})</h3>
              </div>
              <div className="divide-y divide-royal-800/50">
                {users.map(user => (
                  <div key={user._id} className="flex items-center gap-4 px-6 py-4 hover:bg-royal-800/30 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm">
                      {user.name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-white">{user.name}</div>
                      <div className="text-xs text-slate-500">{user.email}</div>
                    </div>
                    <select
                      value={user.role}
                      onChange={(e) => updateUserRole(user._id, e.target.value)}
                      className="bg-royal-900 border border-royal-700 text-sm text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-mint-500"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* ─── SETTINGS TAB ─── */}
        {activeTab === 'settings' && config && (
          <motion.div key="settings" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">

            {/* Polling Settings */}
            <div className="bg-royal-800/30 border border-royal-700 rounded-2xl p-6">
              <h3 className="text-lg font-bold mb-6 flex items-center gap-2"><RefreshCw className="w-5 h-5 text-mint-500" /> Polling Configuration</h3>
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-white">Global Polling</div>
                    <div className="text-xs text-slate-500 mt-0.5">Enable automatic GitHub commit monitoring</div>
                  </div>
                  <button
                    onClick={() => updateConfig({ globalPollingEnabled: !config.globalPollingEnabled })}
                    className="transition-colors"
                  >
                    {config.globalPollingEnabled
                      ? <ToggleRight className="w-10 h-10 text-mint-500" />
                      : <ToggleLeft className="w-10 h-10 text-slate-600" />
                    }
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-white">Pause CI/CD</div>
                    <div className="text-xs text-slate-500 mt-0.5">Temporarily pause all auto-deployments</div>
                  </div>
                  <button
                    onClick={() => updateConfig({ cicdPaused: !config.cicdPaused })}
                    className="transition-colors"
                  >
                    {config.cicdPaused
                      ? <ToggleRight className="w-10 h-10 text-red-400" />
                      : <ToggleLeft className="w-10 h-10 text-slate-600" />
                    }
                  </button>
                </div>

                <div>
                  <label className="block font-medium text-white mb-2">Polling Interval</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={10000}
                      max={300000}
                      step={5000}
                      value={config.defaultPollingIntervalMs}
                      onChange={(e) => updateConfig({ defaultPollingIntervalMs: parseInt(e.target.value) })}
                      className="flex-1 accent-mint-500"
                    />
                    <span className="text-sm font-mono text-mint-400 min-w-[60px] text-right">
                      {Math.round(config.defaultPollingIntervalMs / 1000)}s
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-white mb-2">Max Deployments Per User</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={config.maxDeploymentsPerUser}
                    onChange={(e) => updateConfig({ maxDeploymentsPerUser: parseInt(e.target.value) })}
                    className="w-24 bg-royal-900 border border-royal-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-mint-500"
                  />
                </div>
              </div>
            </div>

            {/* Jenkins Settings */}
            <div className="bg-royal-800/30 border border-royal-700 rounded-2xl p-6">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><Terminal className="w-5 h-5 text-cyan-400" /> Jenkins Configuration</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-slate-400">URL</span>
                  <span className="text-sm font-mono text-white">{config.jenkinsUrl}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-slate-400">Job Name</span>
                  <span className="text-sm font-mono text-white">{config.jenkinsJobName}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-slate-400">Status</span>
                  <span className={`text-sm font-semibold ${stats?.jenkins?.online ? 'text-green-400' : 'text-red-400'}`}>
                    {stats?.jenkins?.online ? '● Connected' : '● Disconnected'}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
