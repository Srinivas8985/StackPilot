import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import api from '../api';
import { Terminal, Loader2, CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-react';

const ICON_MAP = {
  info:    <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />,
  success: <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />,
  error:   <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />,
  warning: <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />,
};

const COLOR_MAP = {
  info:    'text-slate-300',
  success: 'text-green-400',
  error:   'text-red-400',
  warning: 'text-amber-400',
};

export default function DeploymentLogs({ deploymentId }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef(null);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await api.get(`/deployments/${deploymentId}/logs`);
        setLogs(res.data);
      } catch (err) {
        console.error('Failed to fetch logs', err);
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, [deploymentId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="mt-4 bg-royal-900 rounded-xl border border-slate-800/50 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800/50">
        <Terminal className="w-4 h-4 text-mint-400" />
        <span className="text-xs font-medium text-slate-300">Deployment Logs</span>
        {loading && <Loader2 className="w-3 h-3 text-slate-500 animate-spin ml-auto" />}
      </div>
      <div className="p-4 max-h-64 overflow-y-auto font-mono text-xs space-y-1.5">
        {logs.length === 0 && !loading && (
          <p className="text-slate-500 text-center py-4">No logs available yet.</p>
        )}
        {logs.map((log, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.02 }}
            className="flex items-start gap-2"
          >
            {ICON_MAP[log.type] || ICON_MAP.info}
            <span className="text-slate-600 shrink-0">
              {new Date(log.timestamp).toLocaleTimeString()}
            </span>
            <span className={COLOR_MAP[log.type] || 'text-slate-300'}>
              {log.message}
            </span>
          </motion.div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
