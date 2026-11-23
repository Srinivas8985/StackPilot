import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../api';
import {
  X, Server, Cloud, Shield, Terminal, Copy, Check,
  AlertTriangle, RefreshCw, Trash2, ExternalLink, Cpu, Globe, Key, Clock,
  CheckCircle2, Play, Wrench, Layers, Rocket, ShieldCheck,
  Activity, HeartPulse, CheckSquare, AlertCircle
} from 'lucide-react';

const TERRAFORM_STATUS_MAP = {
  PENDING: { label: 'Pending', color: 'text-blue-200', bg: 'bg-slate-500/10', border: 'border-slate-500/30' },
  INITIALIZING: { label: 'Initializing Workspace', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', pulse: true },
  PLANNING: { label: 'Generating Plan', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', pulse: true },
  PROVISIONING: { label: 'Provisioning EC2 (Terraform)', color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', pulse: true },
  PROVISIONED: { label: 'Provisioned', color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30' },
  FAILED: { label: 'Provisioning Failed', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30' },
  DESTROYING: { label: 'Destroying Resources', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', pulse: true },
  DESTROYED: { label: 'Destroyed', color: 'text-slate-400', bg: 'bg-slate-800', border: 'border-slate-700' },
};

const ANSIBLE_STATUS_MAP = {
  pending: { label: 'Pending Configuration', color: 'text-slate-400', bg: 'bg-slate-800/40', border: 'border-slate-700' },
  configuring: { label: 'Configuring (Ansible)', color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', pulse: true },
  configured: { label: 'Configured & Docker Ready', color: 'text-mint-400', bg: 'bg-mint-500/10', border: 'border-mint-500/30' },
  failed: { label: 'Configuration Failed', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30' },
};

const PUPPET_STATUS_MAP = {
  pending: { label: 'Pending Desired State', color: 'text-slate-400', bg: 'bg-slate-800/40', border: 'border-slate-700' },
  applying: { label: 'Enforcing State (Puppet)', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', pulse: true },
  applied: { label: 'Desired State Active', color: 'text-mint-400', bg: 'bg-mint-500/10', border: 'border-mint-500/30' },
  failed: { label: 'Enforcement Failed', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30' },
};

const JENKINS_STATUS_MAP = {
  idle: { label: 'Ready to Deploy', color: 'text-slate-400', bg: 'bg-slate-800/40', border: 'border-slate-700' },
  building: { label: 'Building Image', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', pulse: true },
  transferring: { label: 'Streaming Image via SSH', color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', pulse: true },
  deploying: { label: 'Deploying Container', color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', pulse: true },
  running: { label: 'Container Running on EC2', color: 'text-mint-400', bg: 'bg-mint-500/10', border: 'border-mint-500/30' },
  failed: { label: 'Remote Deploy Failed', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30' },
};

const NAGIOS_STATUS_MAP = {
  pending: { label: 'Pending Registration', color: 'text-slate-400', bg: 'bg-slate-800/40', border: 'border-slate-700' },
  registered: { label: 'Registered (Monitoring Active)', color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30' },
  healthy: { label: 'All Checks OK', color: 'text-mint-400', bg: 'bg-mint-500/10', border: 'border-mint-500/30' },
  warning: { label: 'Warning Threshold Exceeded', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', pulse: true },
  critical: { label: 'Critical Service Alert', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', pulse: true },
  unavailable: { label: 'Monitoring Unavailable', color: 'text-slate-500', bg: 'bg-slate-800/30', border: 'border-slate-800' }
};

export default function InfrastructureModal({ isOpen, onClose, deployment, onUpdated }) {
  const [infra, setInfra] = useState(null);
  const [currentDep, setCurrentDep] = useState(deployment);
  const [loading, setLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [showConfirmDestroy, setShowConfirmDestroy] = useState(false);
  const [activeTab, setActiveTab] = useState('ansible'); // 'ansible', 'puppet', 'terraform', 'monitoring'
  const [monitoringData, setMonitoringData] = useState(null);
  const [monitoringLoading, setMonitoringLoading] = useState(false);
  const logsEndRef = useRef(null);

  useEffect(() => {
    setCurrentDep(deployment);
  }, [deployment]);

  const fetchMonitoringStatus = async (infraId = null) => {
    const id = infraId || infra?._id;
    if (!id) return;
    setMonitoringLoading(true);
    try {
      const res = await api.get(`/infrastructure/${id}/monitoring/status`);
      setMonitoringData(res.data);
    } catch (err) {
      console.warn('Failed to fetch monitoring status:', err.message);
    } finally {
      setMonitoringLoading(false);
    }
  };

  const fetchInfra = async () => {
    if (!deployment?._id) return;
    try {
      const res = await api.get(`/infrastructure/by-deployment/${deployment._id}`);
      setInfra(res.data);
      // Auto-focus Ansible tab if terraform is already done
      if (res.data?.status === 'PROVISIONED' && res.data?.configurationStatus !== 'configured') {
        setActiveTab('ansible');
      } else if (res.data?.monitoringStatus === 'registered' || res.data?.monitoringStatus === 'healthy') {
        fetchMonitoringStatus(res.data._id);
      }
      try {
        const depRes = await api.get(`/deployments/${deployment._id}`);
        if (depRes.data) setCurrentDep(depRes.data);
      } catch (_) {}
    } catch (err) {
      console.error('Failed to fetch infrastructure:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && deployment) {
      setLoading(true);
      fetchInfra();
    }
  }, [isOpen, deployment]);

  // Polling for live status while provisioning, configuring, or destroying
  useEffect(() => {
    if (!isOpen || !infra) return;
    const isBusy =
      ['PENDING', 'INITIALIZING', 'PLANNING', 'PROVISIONING', 'DESTROYING'].includes(infra.status) ||
      infra.configurationStatus === 'configuring' ||
      infra.puppetStatus === 'applying';

    if (!isBusy) return;

    const interval = setInterval(fetchInfra, 3000);
    return () => clearInterval(interval);
  }, [isOpen, infra?.status, infra?.configurationStatus, infra?.puppetStatus]);

  // Scroll logs to bottom when active tab logs update
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [infra?.logs, infra?.configurationLogs, infra?.puppetLogs, activeTab]);

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(''), 2000);
  };

  const handleDestroy = async () => {
    if (!infra?._id) return;
    setActionLoading(true);
    try {
      await api.post(`/infrastructure/${infra._id}/destroy`);
      setShowConfirmDestroy(false);
      fetchInfra();
      if (onUpdated) onUpdated();
    } catch (err) {
      alert(err.response?.data?.msg || 'Failed to destroy infrastructure');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRetryTerraform = async () => {
    if (!infra?._id) return;
    setActionLoading(true);
    try {
      await api.post(`/infrastructure/${infra._id}/retry`);
      fetchInfra();
      if (onUpdated) onUpdated();
    } catch (err) {
      alert(err.response?.data?.msg || 'Failed to retry provisioning');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRunAnsible = async () => {
    if (!infra?._id) return;
    setActionLoading(true);
    try {
      await api.post(`/infrastructure/${infra._id}/configure`);
      setActiveTab('ansible');
      fetchInfra();
      if (onUpdated) onUpdated();
    } catch (err) {
      alert(err.response?.data?.msg || 'Failed to start Ansible configuration');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRetryAnsible = async () => {
    if (!infra?._id) return;
    setActionLoading(true);
    try {
      await api.post(`/infrastructure/${infra._id}/retry-configuration`);
      setActiveTab('ansible');
      fetchInfra();
      if (onUpdated) onUpdated();
    } catch (err) {
      alert(err.response?.data?.msg || 'Failed to retry Ansible configuration');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRunPuppet = async () => {
    if (!infra?._id) return;
    setActionLoading(true);
    try {
      await api.post(`/infrastructure/${infra._id}/puppet/apply`);
      setActiveTab('puppet');
      fetchInfra();
      if (onUpdated) onUpdated();
    } catch (err) {
      alert(err.response?.data?.msg || 'Failed to start Puppet desired-state enforcement');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRetryPuppet = async () => {
    if (!infra?._id) return;
    setActionLoading(true);
    try {
      await api.post(`/infrastructure/${infra._id}/puppet/retry`);
      setActiveTab('puppet');
      fetchInfra();
      if (onUpdated) onUpdated();
    } catch (err) {
      alert(err.response?.data?.msg || 'Failed to retry Puppet enforcement');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSimulateDrift = async () => {
    if (!infra?._id) return;
    if (!window.confirm('Simulate configuration drift on the dedicated host (chmod /etc/stackpilot to 0777 and remove stackpilot.conf) to demonstrate automated Puppet remediation?')) return;
    setActionLoading(true);
    try {
      await api.post(`/infrastructure/${infra._id}/puppet/simulate-drift`);
      setActiveTab('puppet');
      fetchInfra();
      if (onUpdated) onUpdated();
    } catch (err) {
      alert(err.response?.data?.msg || 'Failed to simulate drift');
    } finally {
      setActionLoading(false);
    }
  };

  const handleTriggerRemoteDeploy = async () => {
    if (!deployment?._id) return;
    setActionLoading(true);
    try {
      await api.post(`/deployments/${deployment._id}/trigger-remote-deploy`);
      fetchInfra();
      if (onUpdated) onUpdated();
    } catch (err) {
      alert(err.response?.data?.msg || 'Failed to trigger remote deployment');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRegisterMonitoring = async () => {
    if (!infra?._id) return;
    setActionLoading(true);
    try {
      await api.post(`/infrastructure/${infra._id}/monitoring/register`);
      setActiveTab('monitoring');
      fetchInfra();
      fetchMonitoringStatus();
      if (onUpdated) onUpdated();
    } catch (err) {
      alert(err.response?.data?.msg || 'Failed to register with Nagios');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeregisterMonitoring = async () => {
    if (!infra?._id) return;
    if (!window.confirm('Remove this host and its service checks from Nagios monitoring?')) return;
    setActionLoading(true);
    try {
      await api.post(`/infrastructure/${infra._id}/monitoring/deregister`);
      setMonitoringData(null);
      fetchInfra();
      if (onUpdated) onUpdated();
    } catch (err) {
      alert(err.response?.data?.msg || 'Failed to deregister from Nagios');
    } finally {
      setActionLoading(false);
    }
  };

  if (!isOpen) return null;

  const tfStatusConfig = TERRAFORM_STATUS_MAP[infra?.status] || TERRAFORM_STATUS_MAP.PENDING;
  const ansibleStatusConfig = ANSIBLE_STATUS_MAP[infra?.configurationStatus] || ANSIBLE_STATUS_MAP.pending;
  const puppetStatusConfig = PUPPET_STATUS_MAP[infra?.puppetStatus || 'pending'] || PUPPET_STATUS_MAP.pending;
  const currentRemoteStatus = currentDep?.remoteDeploymentStatus || 'idle';
  const jenkinsStatusConfig = JENKINS_STATUS_MAP[currentRemoteStatus] || JENKINS_STATUS_MAP.idle;
  const nagiosStatusConfig = NAGIOS_STATUS_MAP[infra?.monitoringStatus || 'pending'] || NAGIOS_STATUS_MAP.pending;

  const isFullyReady = infra?.status === 'PROVISIONED' && infra?.configurationStatus === 'configured';
  const sshUser = infra?.amiOs === 'ubuntu' ? 'ubuntu' : 'ec2-user';
  const sshCmd = infra?.publicIp
    ? `ssh -i <your-key.pem> ${sshUser}@${infra.publicIp}`
    : 'Waiting for Public IP...';

  const displayedLogs =
    activeTab === 'puppet' ? (infra?.puppetLogs || []) :
    activeTab === 'ansible' ? (infra?.configurationLogs || []) :
    (infra?.logs || []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-5xl bg-royal-950 border border-royal-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-royal-800/80 bg-royal-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-mint-500/10 border border-mint-500/20 flex items-center justify-center">
              <Cloud className="w-5 h-5 text-mint-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">Dedicated Infrastructure & Automation</h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-mono bg-royal-800 text-slate-300">
                  {deployment?.name}
                </span>
              </div>
              <p className="text-xs text-blue-200/60">Terraform AWS Provisioning, Ansible Configuration, Puppet Drift Control, Jenkins CI/CD & Nagios Monitoring</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchInfra}
              title="Refresh Status"
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-royal-800/60 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-royal-800/60 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Overall Readiness & Multi-Stage Cards (5-Stage DevOps Pipeline) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            {/* Stage 1: Terraform */}
            <div className={`p-3 rounded-xl border ${tfStatusConfig.border} ${tfStatusConfig.bg} relative`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <Cloud className="w-3.5 h-3.5 text-cyan-400" />
                  Stage 1: Terraform
                </span>
                <span className={`w-2.5 h-2.5 rounded-full ${tfStatusConfig.color.replace('text-', 'bg-')} ${tfStatusConfig.pulse ? 'animate-ping' : ''}`} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className={`font-bold text-xs ${tfStatusConfig.color}`}>{tfStatusConfig.label}</div>
                  <div className="text-[10px] text-slate-400">AWS EC2 Server</div>
                </div>
                {infra?.status === 'FAILED' && (
                  <button
                    onClick={handleRetryTerraform}
                    disabled={actionLoading}
                    className="px-2 py-0.5 text-xs font-semibold bg-mint-500 text-royal-950 rounded-lg hover:bg-mint-400 transition-colors flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Retry
                  </button>
                )}
              </div>
              {infra?.errorDetails && (
                <p className="text-[10px] text-red-300 mt-1.5 break-words">{infra.errorDetails}</p>
              )}
            </div>

            {/* Stage 2: Ansible */}
            <div className={`p-3 rounded-xl border ${ansibleStatusConfig.border} ${ansibleStatusConfig.bg} relative`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <Wrench className="w-3.5 h-3.5 text-mint-400" />
                  Stage 2: Ansible
                </span>
                <span className={`w-2.5 h-2.5 rounded-full ${ansibleStatusConfig.color.replace('text-', 'bg-')} ${ansibleStatusConfig.pulse ? 'animate-ping' : ''}`} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className={`font-bold text-xs ${ansibleStatusConfig.color}`}>{ansibleStatusConfig.label}</div>
                  <div className="text-[10px] text-slate-400">Docker CE Setup</div>
                </div>
                <div className="flex items-center gap-1">
                  {infra?.configurationStatus === 'failed' && (
                    <button
                      onClick={handleRetryAnsible}
                      disabled={actionLoading}
                      className="px-2 py-0.5 text-xs font-semibold bg-mint-500 text-royal-950 rounded-lg hover:bg-mint-400 transition-colors flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Retry
                    </button>
                  )}
                  {infra?.status === 'PROVISIONED' && infra?.configurationStatus === 'pending' && (
                    <button
                      onClick={handleRunAnsible}
                      disabled={actionLoading}
                      className="px-2 py-0.5 text-xs font-semibold bg-cyan-500 text-royal-950 rounded-lg hover:bg-cyan-400 transition-colors flex items-center gap-1"
                    >
                      <Play className="w-3 h-3" />
                      Config
                    </button>
                  )}
                </div>
              </div>
              {infra?.configurationError && (
                <p className="text-[10px] text-red-300 mt-1.5 break-words">{infra.configurationError}</p>
              )}
            </div>

            {/* Stage 3: Puppet */}
            <div className={`p-3 rounded-xl border ${puppetStatusConfig.border} ${puppetStatusConfig.bg} relative`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                  Stage 3: Puppet
                </span>
                <span className={`w-2.5 h-2.5 rounded-full ${puppetStatusConfig.color.replace('text-', 'bg-')} ${puppetStatusConfig.pulse ? 'animate-ping' : ''}`} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className={`font-bold text-xs ${puppetStatusConfig.color}`}>{puppetStatusConfig.label}</div>
                  <div className="text-[10px] text-slate-400">State & Drift</div>
                </div>
                <div className="flex items-center gap-1">
                  {infra?.puppetStatus === 'failed' && (
                    <button
                      onClick={handleRetryPuppet}
                      disabled={actionLoading}
                      className="px-2 py-0.5 text-xs font-semibold bg-mint-500 text-royal-950 rounded-lg hover:bg-mint-400 transition-colors flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Retry
                    </button>
                  )}
                  {infra?.configurationStatus === 'configured' && infra?.puppetStatus !== 'applying' && (
                    <button
                      onClick={handleRunPuppet}
                      disabled={actionLoading}
                      className="px-2 py-0.5 text-xs font-semibold bg-amber-500 text-royal-950 rounded-lg hover:bg-amber-400 transition-colors flex items-center gap-1"
                      title="Enforce desired state using masterless Puppet"
                    >
                      <Play className="w-3 h-3" />
                      {infra?.puppetStatus === 'applied' ? 'Re-apply' : 'Apply'}
                    </button>
                  )}
                </div>
              </div>
              {infra?.puppetStatus === 'applied' && (
                <div className="mt-1.5 pt-1.5 border-t border-slate-800/60 flex items-center justify-between">
                  <button
                    onClick={handleSimulateDrift}
                    disabled={actionLoading}
                    className="text-[9px] font-semibold text-amber-300 hover:text-amber-200 underline decoration-dotted"
                    title="Simulate drift on permissions and config to verify automated remediation"
                  >
                    Simulate Drift
                  </button>
                </div>
              )}
              {infra?.puppetError && (
                <p className="text-[10px] text-red-300 mt-1.5 break-words">{infra.puppetError}</p>
              )}
            </div>

            {/* Stage 4: Jenkins Remote Deployment */}
            <div className={`p-3 rounded-xl border ${jenkinsStatusConfig.border} ${jenkinsStatusConfig.bg} relative`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <Rocket className="w-3.5 h-3.5 text-purple-400" />
                  Stage 4: Jenkins
                </span>
                <span className={`w-2.5 h-2.5 rounded-full ${jenkinsStatusConfig.color.replace('text-', 'bg-')} ${jenkinsStatusConfig.pulse ? 'animate-ping' : ''}`} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className={`font-bold text-xs ${jenkinsStatusConfig.color}`}>{jenkinsStatusConfig.label}</div>
                  <div className="text-[10px] text-slate-400">SSH Deploy</div>
                </div>
                <div>
                  {isFullyReady && (
                    <button
                      onClick={handleTriggerRemoteDeploy}
                      disabled={actionLoading || currentRemoteStatus === 'building' || currentRemoteStatus === 'deploying' || currentRemoteStatus === 'transferring'}
                      className="px-2 py-0.5 text-xs font-semibold bg-purple-500 text-white rounded-lg hover:bg-purple-400 transition-colors flex items-center gap-1 disabled:opacity-50"
                      title="Trigger Jenkins deployment directly to this provisioned node"
                    >
                      <Play className="w-3 h-3" />
                      {currentRemoteStatus === 'running' ? 'Redeploy' : currentRemoteStatus === 'failed' ? 'Retry' : 'Deploy'}
                    </button>
                  )}
                </div>
              </div>
              {currentDep?.targetHost && (
                <div className="text-[9px] text-slate-400 mt-1.5 font-mono truncate">
                  Port: {currentDep.port || 3000}
                </div>
              )}
            </div>

            {/* Stage 5: Nagios Monitoring */}
            <div className={`p-3 rounded-xl border ${nagiosStatusConfig.border} ${nagiosStatusConfig.bg} relative`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  Stage 5: Nagios
                </span>
                <span className={`w-2.5 h-2.5 rounded-full ${nagiosStatusConfig.color.replace('text-', 'bg-')} ${nagiosStatusConfig.pulse ? 'animate-ping' : ''}`} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className={`font-bold text-xs ${nagiosStatusConfig.color}`}>{nagiosStatusConfig.label}</div>
                  <div className="text-[10px] text-slate-400">NRPE & Checks</div>
                </div>
                <div className="flex items-center gap-1">
                  {isFullyReady && (infra?.monitoringStatus === 'pending' || !infra?.monitoringStatus) && (
                    <button
                      onClick={handleRegisterMonitoring}
                      disabled={actionLoading}
                      className="px-2 py-0.5 text-xs font-semibold bg-cyan-500 text-royal-950 rounded-lg hover:bg-cyan-400 transition-colors flex items-center gap-1"
                      title="Register dedicated host with Nagios Core"
                    >
                      <Play className="w-3 h-3" />
                      Register
                    </button>
                  )}
                  {infra?.monitoringStatus && infra?.monitoringStatus !== 'pending' && (
                    <button
                      onClick={() => { setActiveTab('monitoring'); fetchMonitoringStatus(); }}
                      className="px-2 py-0.5 text-xs font-semibold bg-royal-800 text-slate-200 rounded-lg hover:bg-royal-700 transition-colors flex items-center gap-1"
                      title="View active monitoring dashboard"
                    >
                      <HeartPulse className="w-3 h-3 text-mint-400" />
                      View
                    </button>
                  )}
                </div>
              </div>
              {infra?.nagiosHostName && (
                <div className="text-[9px] text-slate-400 mt-1.5 font-mono truncate">
                  {infra.nagiosHostName}
                </div>
              )}
            </div>
          </div>

          {/* Overall Readiness Indicator */}
          <div className={`p-3 rounded-xl border flex items-center justify-between ${
            currentRemoteStatus === 'running'
              ? 'border-mint-500/30 bg-mint-500/10 text-mint-300'
              : infra?.puppetStatus === 'applied'
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
              : isFullyReady
              ? 'border-purple-500/30 bg-purple-500/10 text-purple-300'
              : 'border-royal-800 bg-royal-900/40 text-blue-200/80'
          }`}>
            <div className="flex items-center gap-2 text-xs font-medium">
              {currentRemoteStatus === 'running' ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-mint-400 shrink-0" />
                  <span>Pipeline complete! Application container is running live on dedicated EC2 node ({infra?.publicIp}).</span>
                </>
              ) : infra?.puppetStatus === 'applied' ? (
                <>
                  <ShieldCheck className="w-4 h-4 text-mint-400 shrink-0" />
                  <span>Puppet desired state enforced & Docker verified! Ready for Stage 4 Jenkins application deployment.</span>
                </>
              ) : isFullyReady ? (
                <>
                  <Wrench className="w-4 h-4 text-mint-400 shrink-0" />
                  <span>Infrastructure provisioned & Ansible configured! Ready for Puppet desired-state enforcement or Jenkins deployment.</span>
                </>
              ) : (
                <>
                  <Clock className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>
                    {infra?.status !== 'PROVISIONED'
                      ? 'Waiting for Terraform to complete EC2 provisioning...'
                      : 'Waiting for Ansible to verify Docker Engine and finish host configuration...'}
                  </span>
                </>
              )}
            </div>
            {['PROVISIONED', 'FAILED'].includes(infra?.status) && (
              <button
                onClick={() => setShowConfirmDestroy(true)}
                disabled={actionLoading}
                className="px-3 py-1 text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/20 transition-colors flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Destroy EC2
              </button>
            )}
          </div>

          {/* Infrastructure Metrics Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-royal-900/40 border border-royal-800">
              <div className="flex items-center gap-1.5 text-blue-200/60 text-xs mb-1">
                <Globe className="w-3.5 h-3.5" />
                AWS Region
              </div>
              <div className="text-sm font-semibold text-white font-mono">{infra?.awsRegion || 'us-east-1'}</div>
              <div className="text-[10px] text-slate-400">{infra?.availabilityZone || 'Zone pending'}</div>
            </div>

            <div className="p-3.5 rounded-xl bg-royal-900/40 border border-royal-800">
              <div className="flex items-center gap-1.5 text-blue-200/60 text-xs mb-1">
                <Cpu className="w-3.5 h-3.5" />
                Instance Type
              </div>
              <div className="text-sm font-semibold text-white font-mono">{infra?.instanceType || 't3.micro'}</div>
              <div className="text-[10px] text-slate-400 capitalize">{infra?.amiOs || 'Ubuntu'} 22.04</div>
            </div>

            <div className="p-3.5 rounded-xl bg-royal-900/40 border border-royal-800">
              <div className="flex items-center gap-1.5 text-blue-200/60 text-xs mb-1">
                <Server className="w-3.5 h-3.5" />
                EC2 Instance ID
              </div>
              <div className="text-sm font-semibold text-white font-mono truncate">
                {infra?.ec2InstanceId || 'Pending…'}
              </div>
              <div className="text-[10px] text-slate-400">AWS Virtual Server</div>
            </div>

            <div className="p-3.5 rounded-xl bg-royal-900/40 border border-royal-800">
              <div className="flex items-center gap-1.5 text-blue-200/60 text-xs mb-1">
                <Shield className="w-3.5 h-3.5" />
                Security Group
              </div>
              <div className="text-sm font-semibold text-white font-mono truncate">
                {infra?.securityGroupId || 'Auto-created'}
              </div>
              <div className="text-[10px] text-slate-400">SSH: {infra?.sshAllowedCidr || '0.0.0.0/0'}</div>
            </div>
          </div>

          {/* Public IP and URLs */}
          {infra?.publicIp && (
            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-royal-900/50 border border-royal-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-blue-200 font-medium">Public IPv4 Address</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-mint-400">{infra.publicIp}</span>
                    <button
                      onClick={() => copyToClipboard(infra.publicIp, 'ip')}
                      className="p-1 rounded hover:bg-royal-800 text-slate-400 hover:text-white transition-colors"
                      title="Copy Public IP"
                    >
                      {copiedKey === 'ip' ? <Check className="w-3.5 h-3.5 text-mint-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {infra.applicationUrl && (
                  <div className="flex items-center justify-between pt-2 border-t border-royal-800/60">
                    <span className="text-xs text-blue-200 font-medium">Dedicated Application URL</span>
                    <div className="flex items-center gap-2">
                      <a
                        href={infra.applicationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-cyan-400 hover:underline flex items-center gap-1"
                      >
                        {infra.applicationUrl}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      <button
                        onClick={() => copyToClipboard(infra.applicationUrl, 'url')}
                        className="p-1 rounded hover:bg-royal-800 text-slate-400 hover:text-white transition-colors"
                        title="Copy URL"
                      >
                        {copiedKey === 'url' ? <Check className="w-3.5 h-3.5 text-mint-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* SSH Connection Helper */}
              <div className="p-4 rounded-xl bg-royal-900/30 border border-royal-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-blue-200">
                    <Key className="w-3.5 h-3.5 text-mint-400" />
                    SSH Remote Access
                  </div>
                  <button
                    onClick={() => copyToClipboard(sshCmd, 'ssh')}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-white"
                  >
                    {copiedKey === 'ssh' ? <Check className="w-3 h-3 text-mint-400" /> : <Copy className="w-3.5 h-3.5" />}
                    Copy SSH Command
                  </button>
                </div>
                <div className="p-2.5 rounded-lg bg-black/40 font-mono text-xs text-slate-300 break-all select-all">
                  {sshCmd}
                </div>
              </div>
            </div>
          )}

          {/* Multi-Tab Execution Stream & Monitoring Dashboard */}
          <div className="space-y-2">
            <div className="flex items-center justify-between border-b border-royal-800 pb-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setActiveTab('monitoring'); fetchMonitoringStatus(); }}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === 'monitoring'
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Activity className="w-3.5 h-3.5" />
                  Nagios Monitoring ({monitoringData?.services?.length || infra?.monitoringServices?.length || 0})
                </button>
                <button
                  onClick={() => setActiveTab('puppet')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === 'puppet'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Puppet Logs ({infra?.puppetLogs?.length || 0})
                </button>
                <button
                  onClick={() => setActiveTab('ansible')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === 'ansible'
                      ? 'bg-mint-500/20 text-mint-400 border border-mint-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Wrench className="w-3.5 h-3.5" />
                  Ansible Logs ({infra?.configurationLogs?.length || 0})
                </button>
                <button
                  onClick={() => setActiveTab('terraform')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === 'terraform'
                      ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5" />
                  Terraform Logs ({infra?.logs?.length || 0})
                </button>
              </div>
              <span className="text-[11px] text-slate-500 font-mono">
                {activeTab === 'monitoring'
                  ? `Host: ${infra?.nagiosHostName || 'pending'}`
                  : activeTab === 'puppet'
                  ? `Manifest: ${infra?.puppetManifest || 'manifests/site.pp'}`
                  : activeTab === 'ansible'
                  ? `Playbook: ${infra?.ansiblePlaybook || 'configure-ec2.yml'}`
                  : `Workspace: ${infra?.stateIdentifier || 'pending'}`}
              </span>
            </div>

            {activeTab === 'monitoring' ? (
              <div className="bg-royal-950/70 border border-royal-800 rounded-xl p-4 min-h-[16rem] space-y-4">
                {/* Host Monitoring Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-royal-900/50 border border-royal-800 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className={`w-3 h-3 rounded-full shrink-0 ${
                      infra?.monitoringStatus === 'healthy' ? 'bg-mint-400' :
                      infra?.monitoringStatus === 'warning' ? 'bg-amber-400 animate-pulse' :
                      infra?.monitoringStatus === 'critical' ? 'bg-red-400 animate-pulse' :
                      infra?.monitoringStatus === 'registered' ? 'bg-cyan-400' : 'bg-slate-500'
                    }`} />
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-2">
                        <span>Host: {monitoringData?.hostName || infra?.nagiosHostName || 'Not Registered'}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono uppercase ${
                          infra?.monitoringStatus === 'healthy' ? 'bg-mint-500/20 text-mint-300' :
                          infra?.monitoringStatus === 'warning' ? 'bg-amber-500/20 text-amber-300' :
                          infra?.monitoringStatus === 'critical' ? 'bg-red-500/20 text-red-300' :
                          infra?.monitoringStatus === 'registered' ? 'bg-cyan-500/20 text-cyan-300' :
                          'bg-slate-800 text-slate-400'
                        }`}>
                          {monitoringData?.hostState || (infra?.monitoringStatus === 'registered' ? 'ACTIVE' : infra?.monitoringStatus || 'PENDING')}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {monitoringData?.lastCheck ? `Last Check: ${new Date(monitoringData.lastCheck).toLocaleTimeString()}` : 'Awaiting check cycle'}
                        {monitoringData?.isLive && <span className="ml-2 text-mint-400 font-semibold">• Live Nagios Daemon</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => fetchMonitoringStatus()}
                      disabled={monitoringLoading}
                      className="px-2.5 py-1 text-xs font-semibold bg-royal-800 text-slate-300 hover:text-white rounded-lg hover:bg-royal-700 transition-colors flex items-center gap-1.5"
                    >
                      <RefreshCw className={`w-3 h-3 ${monitoringLoading ? 'animate-spin' : ''}`} />
                      Refresh Checks
                    </button>
                    {infra?.monitoringStatus && infra?.monitoringStatus !== 'pending' ? (
                      <button
                        onClick={handleDeregisterMonitoring}
                        disabled={actionLoading}
                        className="px-2.5 py-1 text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3 h-3" />
                        Deregister
                      </button>
                    ) : (
                      <button
                        onClick={handleRegisterMonitoring}
                        disabled={actionLoading || !isFullyReady}
                        className="px-2.5 py-1 text-xs font-semibold bg-cyan-500 text-royal-950 hover:bg-cyan-400 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <Play className="w-3 h-3" />
                        Register with Nagios
                      </button>
                    )}
                  </div>
                </div>

                {/* Service Checks Grid */}
                {(!monitoringData?.services && (!infra?.monitoringServices || infra.monitoringServices.length === 0)) ? (
                  <div className="p-8 text-center border border-dashed border-royal-800 rounded-xl space-y-2">
                    <Activity className="w-8 h-8 text-slate-600 mx-auto" />
                    <p className="text-sm font-semibold text-slate-300">Nagios Monitoring Not Active Yet</p>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      Dedicated EC2 instance must be provisioned and configured before Nagios can monitor host reachability, SSH, disk space, CPU, memory, Docker, and application health.
                    </p>
                    {isFullyReady && (
                      <button
                        onClick={handleRegisterMonitoring}
                        disabled={actionLoading}
                        className="mt-3 px-3 py-1.5 text-xs font-semibold bg-cyan-500 text-royal-950 rounded-lg hover:bg-cyan-400 transition-colors inline-flex items-center gap-1.5"
                      >
                        <Play className="w-3.5 h-3.5" />
                        Register Host Now
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {(monitoringData?.services || infra?.monitoringServices || []).map((srv, idx) => {
                      const isOk = srv.status === 'OK';
                      const isWarn = srv.status === 'WARNING';
                      const isCrit = srv.status === 'CRITICAL';
                      const badgeBg = isOk ? 'bg-mint-500/10 text-mint-400 border-mint-500/30' :
                                      isWarn ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                                      isCrit ? 'bg-red-500/10 text-red-400 border-red-500/30' :
                                      'bg-slate-800/40 text-slate-400 border-slate-700';

                      return (
                        <div key={idx} className="p-3 bg-black/40 border border-royal-800/80 rounded-lg space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-200 truncate">{srv.name}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono border ${badgeBg}`}>
                              {srv.status}
                            </span>
                          </div>
                          <p className="text-[11px] font-mono text-slate-300 break-words leading-tight">
                            {srv.output || 'Check executed'}
                          </p>
                          {srv.perfData && (
                            <div className="text-[10px] font-mono text-slate-500 truncate" title={srv.perfData}>
                              Perf: {srv.perfData}
                            </div>
                          )}
                          <div className="text-[9px] text-slate-600 font-mono">
                            Checked: {srv.lastCheck ? new Date(srv.lastCheck).toLocaleTimeString() : 'Pending'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-black/80 border border-royal-800 rounded-xl p-4 font-mono text-xs h-64 overflow-y-auto space-y-1">
                {!displayedLogs || displayedLogs.length === 0 ? (
                  <div className="text-slate-500 italic">
                    {activeTab === 'puppet'
                      ? 'No Puppet execution logs captured yet. Logs will appear when Puppet enforcement begins.'
                      : activeTab === 'ansible'
                      ? 'No Ansible configuration logs captured yet. Logs will appear when configuration starts.'
                      : 'No Terraform provisioning logs captured yet.'}
                  </div>
                ) : (
                  displayedLogs.map((log, index) => {
                    const logColor =
                      log.type === 'error' ? 'text-red-400' :
                      log.type === 'warning' ? 'text-amber-400' :
                      log.type === 'success' ? 'text-mint-400' : 'text-slate-300';

                    return (
                      <div key={index} className="flex items-start gap-2 leading-relaxed">
                        <span className="text-slate-600 shrink-0 select-none">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                        <span className={logColor}>{log.message}</span>
                      </div>
                    );
                  })
                )}
                <div ref={logsEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-royal-800 bg-royal-900/60 flex items-center justify-between">
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span>Ansible: <code className="text-slate-300">{infra?.ansibleVersion || 'ready'}</code></span>
            <span>•</span>
            <span>Puppet: <code className={infra?.puppetStatus === 'applied' ? 'text-mint-400' : 'text-slate-300'}>{infra?.puppetStatus || 'pending'}</code></span>
            <span>•</span>
            <span>Nagios: <code className={infra?.monitoringStatus === 'healthy' ? 'text-mint-400' : infra?.monitoringStatus === 'registered' ? 'text-cyan-400' : 'text-slate-300'}>{infra?.monitoringStatus || 'pending'}</code></span>
            <span>•</span>
            <span>Ready for Jenkins: <strong className={isFullyReady ? 'text-mint-400' : 'text-slate-500'}>{isFullyReady ? 'YES' : 'PENDING'}</strong></span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-royal-800 hover:bg-royal-700 text-white rounded-xl text-xs font-semibold transition-colors"
          >
            Close
          </button>
        </div>

        {/* Confirmation Modal for Destroy */}
        {showConfirmDestroy && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80">
            <div className="bg-royal-950 border border-red-500/40 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
              <div className="flex items-center gap-3 text-red-400">
                <AlertTriangle className="w-6 h-6 shrink-0" />
                <h3 className="text-lg font-bold">Destroy Dedicated Infrastructure?</h3>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                This will trigger <code className="text-red-300 bg-red-950/60 px-1 py-0.5 rounded">terraform destroy</code> on AWS, permanently terminating EC2 instance <strong>{infra?.ec2InstanceId || 'assigned to this deployment'}</strong> and deleting its dedicated security group.
              </p>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  onClick={() => setShowConfirmDestroy(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-royal-900"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDestroy}
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-red-500 hover:bg-red-600 text-white flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Confirm Destruction
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
