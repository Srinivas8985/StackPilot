import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LayoutDashboard, Server, Activity, Terminal, 
  Settings, Zap, Box, Cloud, Rocket
} from 'lucide-react';
import Navbar from './Navbar';

export default function SidebarLayout({ children }) {
  const location = useLocation();
  
  const SIDEBAR_LINKS = [
    { label: 'Overview', path: '/dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
    { label: 'Deployments', path: '/deployments', icon: <Server className="w-5 h-5" /> },
    { label: 'New Deployment', path: '/deploy', icon: <Rocket className="w-5 h-5" /> },
  ];

  return (
    <div className="min-h-screen bg-royal-900 flex flex-col overflow-hidden text-slate-50">
      <Navbar />
      
      <div className="flex flex-1 pt-24 pb-4 px-4 gap-4 h-screen">
        {/* SIDEBAR */}
        <motion.div 
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          className="w-64 bg-royal-950/80 backdrop-blur-xl border border-royal-800 rounded-2xl flex-col hidden lg:flex shadow-2xl relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-mint-500/5 rounded-full blur-3xl pointer-events-none"></div>
          
          <div className="p-4 flex-1">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 px-2 mt-4">Platform</div>
            <nav className="space-y-1.5">
              {SIDEBAR_LINKS.map((link) => {
                const isActive = location.pathname === link.path;
                return (
                  <Link 
                    key={link.path}
                    to={link.path} 
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-300 relative ${
                      isActive 
                        ? 'bg-mint-500/10 text-mint-400' 
                        : 'text-slate-400 hover:text-white hover:bg-royal-800/50'
                    }`}
                  >
                    {isActive && (
                      <motion.div 
                        layoutId="activeTab"
                        className="absolute left-0 w-1 h-6 bg-mint-500 rounded-r-full"
                      />
                    )}
                    {link.icon}
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="p-4 mt-auto">
            <div className="bg-gradient-to-br from-royal-800 to-royal-900 border border-royal-700 p-4 rounded-xl relative overflow-hidden group hover:border-mint-500/30 transition-colors">
              <div className="absolute -top-6 -right-6 w-24 h-24 bg-mint-500 blur-3xl opacity-20 group-hover:opacity-40 transition-opacity"></div>
              <Zap className="w-5 h-5 text-mint-500 mb-2 relative z-10" />
              <div className="font-bold text-sm mb-1 relative z-10 text-white">Pro Plan Active</div>
              <div className="text-xs text-slate-400 mb-3 relative z-10">Running 2 of 10 containers</div>
              <div className="w-full h-1.5 bg-royal-950 rounded-full overflow-hidden relative z-10">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: '20%' }}
                  className="h-full bg-mint-500 shadow-[0_0_10px_rgba(13,240,163,0.8)]" 
                />
              </div>
            </div>
          </div>
        </motion.div>

        {/* MAIN CONTENT AREA */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="flex-1 bg-royal-950/40 backdrop-blur-md border border-royal-800 rounded-2xl overflow-y-auto relative shadow-inner"
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}
