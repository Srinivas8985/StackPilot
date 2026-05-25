import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar
} from 'recharts';
import {
  CheckCircle2, AlertCircle, Clock, Server, Play, Square,
  GitCommit, Activity, Box, ArrowUpRight, GitBranch, Code,
  Rocket, Loader2, XCircle, Plus, Terminal, LayoutDashboard,
  Settings, Database, Cloud, Zap, Shield, ChevronRight, Globe, ArrowRight
} from 'lucide-react';
import api from '../api';

const STATUS_ICON = {
  running: <CheckCircle2 className="w-4 h-4 text-green-400" />,
  building: <Clock className="w-4 h-4 text-amber-400 animate-pulse" />,
  cloning: <Clock className="w-4 h-4 text-blue-400 animate-pulse" />,
  generating: <Terminal className="w-4 h-4 text-purple-400 animate-pulse" />,
  deploying: <Clock className="w-4 h-4 text-cyan-400 animate-pulse" />,
  stopped: <Square className="w-4 h-4 text-slate-500 fill-slate-500" />,
  failed: <AlertCircle className="w-4 h-4 text-red-400" />,
  queued: <Clock className="w-4 h-4 text-slate-400" />,
};

const STATUS_COLOR = {
  running: 'text-green-400 bg-green-400/10 border-green-400/20',
  building: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  cloning: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  generating: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  deploying: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20',
  stopped: 'text-slate-400 bg-slate-400/10 border-slate-400/20',
  failed: 'text-red-400 bg-red-400/10 border-red-400/20',
  queued: 'text-slate-400 bg-slate-400/10 border-slate-400/20',
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ total: 0, running: 0, failed: 0, stopped: 0, recent: [] });
  const [deployments, setDeployments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, deplRes] = await Promise.all([
          api.get('/deployments/stats'),
          api.get('/deployments')
        ]);
        setStats(statsRes.data);
        setDeployments(deplRes.data);
      } catch (err) {
        console.error('Dashboard fetch error', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const chartData = (() => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return days.map(name => ({
      name,
      requests: Math.floor(Math.random() * 5000) + 1000,
      compute: Math.floor(Math.random() * 100) + 20
    }));
  })();

  const activeDeployments = deployments.filter(d => ['running', 'building', 'cloning', 'deploying', 'generating'].includes(d.status));

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto space-y-8 w-full h-full">
          
          {/* HEADER */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-extrabold text-white tracking-tight">Overview</h1>
              <p className="text-slate-400 mt-1">Manage your infrastructure and monitor performance.</p>
            </div>
            <Link to="/deploy" className="bg-mint-500 hover:bg-mint-400 text-royal-900 font-bold px-6 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(13,240,163,0.2)] hover:shadow-[0_0_30px_rgba(13,240,163,0.4)]">
              <Plus className="w-5 h-5" /> New Deployment
            </Link>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-32"><Loader2 className="w-8 h-8 animate-spin text-mint-500" /></div>
          ) : (
            <AnimatePresence>
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
                
                {/* METRICS GRID */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: 'Total Services', value: stats.total, icon: <Box className="w-6 h-6 text-cyan-400" />, trend: '+2 this week' },
                    { label: 'Running Containers', value: stats.running, icon: <Activity className="w-6 h-6 text-mint-500" />, trend: 'Healthy' },
                    { label: 'Failed Builds', value: stats.failed, icon: <AlertCircle className="w-6 h-6 text-red-400" />, trend: 'Needs attention' },
                    { label: 'Network Requests', value: '124.5k', icon: <Globe className="w-6 h-6 text-purple-400" />, trend: '+12% vs last week' }
                  ].map((stat, i) => (
                    <div key={i} className="bg-royal-800/50 border border-royal-700 p-6 rounded-2xl hover:border-royal-600 transition-colors">
                      <div className="flex items-center justify-between mb-4">
                        <div className="w-10 h-10 rounded-xl bg-royal-900 flex items-center justify-center border border-royal-800">
                          {stat.icon}
                        </div>
                      </div>
                      <div className="text-3xl font-bold text-white mb-1">{stat.value}</div>
                      <div className="text-sm text-slate-400 font-medium">{stat.label}</div>
                      <div className="text-xs text-slate-500 mt-3 pt-3 border-t border-royal-800/50">{stat.trend}</div>
                    </div>
                  ))}
                </div>

                {/* CHARTS & ACTIVITY */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* CHART */}
                  <div className="lg:col-span-2 bg-royal-800/30 border border-royal-700 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-lg font-bold">Network Traffic</h2>
                      <select className="bg-royal-900 border border-royal-700 text-xs text-slate-300 rounded-lg px-3 py-1.5 focus:outline-none">
                        <option>Last 7 days</option>
                        <option>Last 30 days</option>
                      </select>
                    </div>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                          <defs>
                            <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#0df0a3" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#0df0a3" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                          <XAxis dataKey="name" stroke="#64748b" tick={{fill: '#64748b', fontSize: 12}} tickLine={false} axisLine={false} />
                          <YAxis stroke="#64748b" tick={{fill: '#64748b', fontSize: 12}} tickLine={false} axisLine={false} tickFormatter={v => `${v/1000}k`} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                            itemStyle={{ color: '#0df0a3' }}
                          />
                          <Area type="monotone" dataKey="requests" stroke="#0df0a3" strokeWidth={3} fillOpacity={1} fill="url(#colorRequests)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* SYSTEM RECOMMENDATIONS */}
                  <div className="bg-gradient-to-b from-royal-800/80 to-royal-900 border border-royal-700 rounded-2xl p-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-mint-500/10 blur-3xl rounded-full pointer-events-none"></div>
                    <h2 className="text-lg font-bold flex items-center gap-2 mb-6">
                      <Terminal className="w-5 h-5 text-mint-500" /> System Insights
                    </h2>
                    <div className="space-y-4">
                      <div className="bg-royal-950/50 p-4 rounded-xl border border-royal-800">
                        <div className="text-sm font-bold text-white mb-1">Optimize Node.js build</div>
                        <div className="text-xs text-slate-400">Your recent 'client-dashboard' deployment could save 40% memory by enabling standalone mode.</div>
                        <button className="text-xs text-mint-400 font-semibold mt-2 hover:underline">Apply fix automatically</button>
                      </div>
                      <div className="bg-royal-950/50 p-4 rounded-xl border border-royal-800">
                        <div className="text-sm font-bold text-white mb-1">Security Alert</div>
                        <div className="text-xs text-slate-400">Dependency 'axios' has a minor vulnerability in 'api-service'.</div>
                        <button className="text-xs text-cyan-400 font-semibold mt-2 hover:underline">View details</button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ACTIVE CONTAINERS */}
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold flex items-center gap-2"><Server className="w-5 h-5 text-mint-500" /> Active Environments</h2>
                    <Link to="/deployments" className="text-sm text-slate-400 hover:text-white flex items-center gap-1 font-medium transition-colors">
                      View all <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>

                  {activeDeployments.length === 0 ? (
                    <div className="border border-dashed border-royal-700 rounded-2xl p-12 text-center bg-royal-800/20">
                      <Box className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-white mb-2">No active deployments</h3>
                      <p className="text-slate-400 text-sm mb-6">Deploy your first container to see it running here.</p>
                      <Link to="/deploy" className="inline-flex items-center gap-2 bg-royal-800 hover:bg-royal-700 border border-royal-600 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-all">
                        <Rocket className="w-4 h-4" /> Deploy Service
                      </Link>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {activeDeployments.map(dep => {
                        const statusColor = STATUS_COLOR[dep.status] || STATUS_COLOR.queued;
                        return (
                          <div key={dep._id} className="bg-royal-800 border border-royal-700 rounded-2xl p-5 hover:border-royal-500 transition-all group relative overflow-hidden">
                            <div className="flex items-start justify-between mb-4 relative z-10">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-royal-900 border border-royal-700 flex items-center justify-center">
                                  <GitBranch className="w-5 h-5 text-slate-300" />
                                </div>
                                <div>
                                  <div className="font-bold text-white truncate max-w-[150px]">{dep.name}</div>
                                  <div className="text-xs text-slate-400 flex items-center gap-1">
                                    <GitBranch className="w-3 h-3" /> {dep.branch}
                                  </div>
                                </div>
                              </div>
                              <div className={`px-2.5 py-1 text-xs font-semibold rounded-lg border flex items-center gap-1.5 ${statusColor}`}>
                                {STATUS_ICON[dep.status]} {dep.status}
                              </div>
                            </div>
                            
                            <div className="space-y-3 mb-5 relative z-10">
                              <div className="flex justify-between text-sm">
                                <span className="text-slate-500">CPU Usage</span>
                                <span className="text-slate-300 font-mono">{dep.cpu || '0%'}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-slate-500">Memory</span>
                                <span className="text-slate-300 font-mono">{dep.memory || '0MB'}</span>
                              </div>
                            </div>

                            <div className="pt-4 border-t border-royal-700 flex items-center justify-between relative z-10">
                              <span className="text-xs text-slate-500 font-mono">{dep.projectType || 'Docker'}</span>
                              {dep.deploymentUrl && dep.status === 'running' ? (
                                <a href={dep.deploymentUrl} target="_blank" rel="noreferrer" className="text-mint-400 hover:text-mint-300 text-sm font-medium flex items-center gap-1">
                                  Visit <ArrowUpRight className="w-4 h-4" />
                                </a>
                              ) : (
                                <Link to="/deployments" className="text-slate-400 hover:text-white text-sm font-medium">Details</Link>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </motion.div>
            </AnimatePresence>
          )}
        </div>
  );
}
