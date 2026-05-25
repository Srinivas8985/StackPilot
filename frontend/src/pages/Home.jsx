import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { 
  Rocket, Terminal, GitBranch, Server, Cpu, Database, 
  ArrowRight, Play, CheckCircle2, Cloud, 
  Zap, Lock, Globe, Code, Box, Activity, ChevronRight, BarChart3, Clock, XCircle
} from 'lucide-react';
import Navbar from '../components/Navbar';

export default function Home() {
  const features = [
    {
      icon: <Rocket className="w-6 h-6 text-mint-500" />,
      title: "One-Click Deployments",
      description: "Connect your GitHub, pick a folder, and go live instantly. No complex configuration required."
    },
    {
      icon: <Terminal className="w-6 h-6 text-mint-500" />,
      title: "Automated Dockerfile Generation",
      description: "Our build engine scans your repository and writes a highly-optimized, multi-stage Dockerfile for you."
    },
    {
      icon: <Globe className="w-6 h-6 text-mint-500" />,
      title: "Nginx Reverse Proxy",
      description: "Automatic port routing, HTTPS, and Nginx proxying for production-ready live URLs."
    },
    {
      icon: <Activity className="w-6 h-6 text-mint-500" />,
      title: "Real-time Monitoring",
      description: "Live CPU, memory, and network metrics streamed directly from the Docker Daemon."
    },
    {
      icon: <Code className="w-6 h-6 text-mint-500" />,
      title: "Multi-Framework Support",
      description: "Native support for React, Vite, Next.js, Flask, Django, Spring Boot, and custom Dockerfiles."
    },
    {
      icon: <Lock className="w-6 h-6 text-mint-500" />,
      title: "Secure Env Management",
      description: "Inject environment variables dynamically into your containers at build and runtime."
    }
  ];

  const workflowSteps = [
    { label: 'GitHub Repo', icon: <GitBranch className="w-5 h-5" /> },
    { label: 'Repo Analysis', icon: <Terminal className="w-5 h-5" /> },
    { label: 'Docker Build', icon: <Box className="w-5 h-5" /> },
    { label: 'Container Launch', icon: <Server className="w-5 h-5" /> },
    { label: 'Live URL', icon: <Globe className="w-5 h-5" /> }
  ];

  return (
    <div className="min-h-screen bg-royal-900 text-slate-50 selection:bg-mint-500 selection:text-royal-900">
      <Navbar />

      {/* HERO SECTION */}
      <section className="relative pt-32 pb-32 lg:pt-48 lg:pb-48 overflow-hidden bg-gradient-to-b from-royal-950 to-royal-900">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5 mix-blend-overlay"></div>
        {/* Floating DevOps Shapes */}
        <div className="absolute top-20 left-10 w-64 h-64 bg-mint-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
        
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="flex flex-col lg:flex-row items-center gap-16">
            
            {/* Text Content */}
            <div className="flex-1 text-center lg:text-left">
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-royal-800/80 border border-royal-700 text-mint-500 text-sm font-semibold mb-6"
              >
                <Zap className="w-4 h-4" /> StackPilot 2.0 is Live
              </motion.div>

              <motion.h1 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-5xl lg:text-7xl font-extrabold tracking-tight mb-8 leading-[1.1]"
              >
                Deploy faster,<br className="hidden lg:block" />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-mint-400 to-cyan-400">
                  scale effortlessly.
                </span>
              </motion.h1>

              <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-lg lg:text-xl text-slate-300 mb-10 max-w-2xl mx-auto lg:mx-0 font-medium leading-relaxed"
              >
                The high-performance DevOps platform that turns your GitHub repositories into production-ready containers in seconds. Stop wrestling with infrastructure.
              </motion.p>

              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4"
              >
                <Link to="/deploy" className="w-full sm:w-auto flex items-center justify-center gap-2 bg-mint-500 hover:bg-mint-400 text-royal-900 px-8 py-4 rounded-xl font-bold transition-all shadow-[0_0_40px_rgba(13,240,163,0.3)] hover:shadow-[0_0_60px_rgba(13,240,163,0.5)]">
                  Start Deploying <ArrowRight className="w-5 h-5" />
                </Link>
                <Link to="/dashboard" className="w-full sm:w-auto flex items-center justify-center gap-2 bg-royal-800 hover:bg-royal-700 text-white px-8 py-4 rounded-xl font-bold transition-all border border-royal-700">
                  <Play className="w-5 h-5" /> View Dashboard
                </Link>
              </motion.div>
            </div>

            {/* Animated Terminal */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="flex-1 w-full relative"
            >
              <div className="absolute -inset-1 bg-gradient-to-r from-mint-500 to-cyan-500 rounded-2xl blur opacity-20 animate-pulse"></div>
              <div className="relative bg-[#0d1117] rounded-2xl border border-slate-800 shadow-2xl overflow-hidden">
                <div className="bg-[#161b22] px-4 py-3 flex items-center gap-2 border-b border-slate-800">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500/80" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                    <div className="w-3 h-3 rounded-full bg-green-500/80" />
                  </div>
                  <div className="ml-4 flex items-center text-xs text-slate-400 font-mono">
                    <Terminal className="w-3 h-3 mr-2 text-mint-500" />
                    stackpilot deploy
                  </div>
                </div>
                <div className="p-6 font-mono text-sm text-slate-300 leading-relaxed overflow-x-auto">
                  <div className="text-mint-400">$ stackpilot analyze https://github.com/user/repo</div>
                  <div className="text-slate-500 mt-1">&gt; Analyzing repository...</div>
                  <div className="text-cyan-400 mt-1">✓ Detected React/Vite project</div>
                  <div className="text-slate-500 mt-2">&gt; Generating Dockerfile...</div>
                  <div className="text-green-400 mt-1">✓ Multi-stage Dockerfile generated</div>
                  <div className="text-slate-500 mt-2">&gt; Building container image...</div>
                  <div className="text-slate-500">  Step 1/8: FROM node:20-alpine AS builder</div>
                  <div className="text-slate-500">  Step 2/8: COPY package*.json ./</div>
                  <div className="text-slate-500">  Step 3/8: RUN npm ci</div>
                  <div className="text-mint-500 font-bold mt-3 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> Deployment successful!
                  </div>
                  <div className="text-cyan-400 mt-1 underline cursor-pointer">https://repo-production.stackpilot.live</div>
                  <div className="mt-2 flex items-center">
                    <span className="w-2 h-4 bg-mint-500 animate-pulse inline-block"></span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* TRUSTED BY MARQUEE */}
      <section className="py-10 border-y border-royal-800 bg-royal-900/50">
        <div className="max-w-7xl mx-auto px-6 overflow-hidden flex flex-col items-center">
          <p className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-6">Trusted by innovative teams worldwide</p>
          <div className="flex gap-12 sm:gap-24 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
            {['Acme Corp', 'GlobalTech', 'Nexus Systems', 'Quantum Data', 'Stark Industries'].map((company, i) => (
              <div key={i} className="text-xl font-bold text-slate-300 tracking-tight flex items-center gap-2">
                <Box className="w-6 h-6 text-mint-500" /> {company}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CURVED DIVIDER */}
      <div className="w-full overflow-hidden leading-none bg-royal-950">
        <svg viewBox="0 0 1200 120" preserveAspectRatio="none" className="w-full h-12 lg:h-24 fill-royal-900">
          <path d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V0H0V27.35A600.21,600.21,0,0,0,321.39,56.44Z"></path>
        </svg>
      </div>

      {/* WORKFLOW SECTION */}
      <section className="py-24 bg-royal-900 relative">
        <div className="absolute top-1/2 left-0 w-72 h-72 bg-mint-500/5 rounded-full blur-3xl -translate-y-1/2"></div>
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">From Code to URL in seconds</h2>
            <p className="text-slate-400 text-lg">Our automated pipeline handles the complexity of DevOps.</p>
          </div>

          <div className="flex flex-col lg:flex-row items-center justify-between relative">
            <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-royal-800 lg:hidden"></div>
            <div className="hidden lg:block absolute top-1/2 left-0 right-0 h-0.5 bg-royal-800 -translate-y-1/2 z-0"></div>
            
            {workflowSteps.map((step, index) => (
              <motion.div 
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="relative z-10 flex flex-col items-center gap-4 my-6 lg:my-0 bg-royal-900 lg:px-4"
              >
                <div className="w-16 h-16 rounded-2xl bg-royal-800 border border-royal-700 flex items-center justify-center text-mint-500 shadow-lg relative group">
                  <div className="absolute inset-0 bg-mint-500/20 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  {step.icon}
                </div>
                <div className="font-semibold text-slate-200">{step.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES GRID */}
      <section className="py-24 bg-royal-900 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-royal-900 via-royal-800/30 to-royal-900 pointer-events-none"></div>
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">Everything you need to ship</h2>
            <p className="text-slate-400 text-lg max-w-2xl">Enterprise-grade infrastructure packed into a beautiful, intuitive developer experience.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <motion.div 
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="bg-royal-800/50 border border-royal-700 hover:border-mint-500/50 p-8 rounded-3xl transition-colors group"
              >
                <div className="w-12 h-12 bg-royal-900 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                <p className="text-slate-400 leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CURVED DIVIDER (Upside Down) */}
      <div className="w-full overflow-hidden leading-none bg-royal-900">
        <svg viewBox="0 0 1200 120" preserveAspectRatio="none" className="w-full h-12 lg:h-24 fill-royal-950 rotate-180">
          <path d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V0H0V27.35A600.21,600.21,0,0,0,321.39,56.44Z"></path>
        </svg>
      </div>

      {/* METRICS SECTION */}
      <section className="py-20 bg-royal-950 border-y border-royal-800">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 divide-x divide-royal-800/50">
            {[
              { label: 'Deployments', value: '12,540' },
              { label: 'Containers', value: '4,210' },
              { label: 'Uptime', value: '99.99%' },
              { label: 'Avg Build Speed', value: '42s' }
            ].map((metric, i) => (
              <div key={i} className="text-center">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.5 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  className="text-4xl lg:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-mint-400 to-cyan-400 mb-2"
                >
                  {metric.value}
                </motion.div>
                <div className="text-slate-400 font-medium uppercase tracking-wider text-sm">{metric.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CURVED DIVIDER */}
      <div className="w-full overflow-hidden leading-none bg-royal-950">
        <svg viewBox="0 0 1200 120" preserveAspectRatio="none" className="w-full h-12 lg:h-24 fill-royal-900">
          <path d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V0H0V27.35A600.21,600.21,0,0,0,321.39,56.44Z"></path>
        </svg>
      </div>

      {/* ENGINE SHOWCASE */}
      <section className="py-24 bg-royal-900 relative">
        <div className="absolute right-0 top-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl -translate-y-1/2 pointer-events-none"></div>
        <div className="max-w-7xl mx-auto px-6 flex flex-col lg:flex-row items-center gap-16 relative z-10">
          <div className="flex-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-mint-500/10 text-mint-500 text-sm font-semibold mb-6">
              <Terminal className="w-4 h-4" /> Build Engine
            </div>
            <h2 className="text-3xl lg:text-4xl font-bold mb-6">Stop writing Dockerfiles.</h2>
            <p className="text-slate-300 text-lg mb-8 leading-relaxed">
              StackPilot uses an advanced build engine to deeply analyze your repository structure. We automatically generate perfectly optimized, multi-stage Dockerfiles tailored to your specific framework, dependencies, and environment.
            </p>
            <ul className="space-y-4 mb-8">
              {['Detects React, Next.js, Django, Flask, Java', 'Implements multi-stage builds automatically', 'Generates Nginx configurations for SPAs', 'Handles package manager fallbacks'].map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-slate-300">
                  <CheckCircle2 className="w-5 h-5 text-mint-500 shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          
          <div className="flex-1 w-full">
            <div className="bg-[#0d1117] rounded-2xl border border-slate-800 shadow-2xl overflow-hidden">
              <div className="bg-[#161b22] px-4 py-3 flex items-center gap-2 border-b border-slate-800">
                 <span className="text-xs text-slate-400 font-mono">Dockerfile (Auto-Generated)</span>
              </div>
              <div className="p-6 font-mono text-sm text-slate-300 leading-relaxed">
                <div className="text-slate-500"># Stage 1: Build</div>
                <div><span className="text-mint-400">FROM</span> node:20-alpine <span className="text-mint-400">AS</span> builder</div>
                <div><span className="text-mint-400">WORKDIR</span> /app</div>
                <div><span className="text-mint-400">COPY</span> package*.json ./</div>
                <div><span className="text-mint-400">RUN</span> npm ci</div>
                <div><span className="text-mint-400">COPY</span> . .</div>
                <div><span className="text-mint-400">RUN</span> npm run build</div>
                <div className="text-slate-500 mt-4"># Stage 2: Serve</div>
                <div><span className="text-mint-400">FROM</span> nginx:alpine</div>
                <div><span className="text-mint-400">COPY</span> --from=builder /app/dist /usr/share/nginx/html</div>
                <div><span className="text-mint-400">EXPOSE</span> 3000</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DASHBOARD PREVIEW */}
      <section className="py-24 bg-royal-800/30 border-y border-royal-800">
        <div className="max-w-7xl mx-auto px-6 text-center mb-16">
          <h2 className="text-3xl lg:text-4xl font-bold mb-4">Full Control Center</h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">Monitor containers, view live logs, and manage environments from a beautiful dashboard.</p>
        </div>
        
        <div className="max-w-5xl mx-auto px-6">
          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="rounded-3xl border border-royal-700 bg-royal-900 shadow-2xl overflow-hidden p-2"
          >
            <div className="rounded-2xl border border-royal-800 bg-royal-800/50 p-6">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-bold flex items-center gap-2"><Server className="w-5 h-5 text-mint-500"/> Active Deployments</h3>
                <button className="bg-royal-700 text-sm px-4 py-2 rounded-lg font-medium">View All</button>
              </div>
              
              <div className="space-y-4">
                {[
                  { name: 'production-api', type: 'Node.js', status: 'running', uptime: '12d 4h', cpu: '2.4%' },
                  { name: 'client-dashboard', type: 'React/Vite', status: 'running', uptime: '5d 12h', cpu: '0.1%' },
                  { name: 'ai-microservice', type: 'Flask', status: 'building', uptime: '-', cpu: '-' }
                ].map((dep, i) => (
                  <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-royal-900 border border-royal-700">
                    <div className="flex items-center gap-4">
                      <div className={`w-2 h-2 rounded-full ${dep.status === 'running' ? 'bg-mint-500' : 'bg-amber-400 animate-pulse'}`}></div>
                      <div>
                        <div className="font-bold text-white">{dep.name}</div>
                        <div className="text-xs text-slate-400">{dep.type}</div>
                      </div>
                    </div>
                    <div className="hidden sm:flex items-center gap-8 text-sm text-slate-400">
                      <div className="flex items-center gap-1"><Activity className="w-4 h-4"/> {dep.cpu}</div>
                      <div className="flex items-center gap-1"><Clock className="w-4 h-4"/> {dep.uptime}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="text-mint-500 hover:text-mint-400 text-sm font-medium flex items-center gap-1">
                        Logs <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="py-24 bg-gradient-to-b from-royal-900 to-royal-950 relative">
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">Loved by engineering teams</h2>
            <p className="text-slate-400 text-lg">Don't just take our word for it.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { name: 'Sarah Jenkins', role: 'CTO at TechFlow', quote: 'StackPilot completely replaced our Jenkins pipeline. What used to take hours of configuration now takes one click.' },
              { name: 'David Chen', role: 'Lead Architect', quote: 'The automated Dockerfile generation is flawless. It perfectly handled our complex Python monorepo on the first try.' },
              { name: 'Elena Rodriguez', role: 'VP Engineering', quote: 'We moved 50 microservices to StackPilot in a weekend. The automated Nginx routing saved us weeks of DevOps work.' }
            ].map((t, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-royal-800/80 border border-royal-700 p-8 rounded-3xl relative"
              >
                <div className="text-mint-500 text-4xl font-serif absolute top-4 right-6 opacity-30">"</div>
                <p className="text-slate-300 italic mb-6 relative z-10">"{t.quote}"</p>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-royal-700 rounded-full flex items-center justify-center font-bold text-lg text-white">
                    {t.name[0]}
                  </div>
                  <div>
                    <div className="font-bold text-white">{t.name}</div>
                    <div className="text-xs text-mint-500">{t.role}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="py-24 bg-royal-950">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">Simple, transparent pricing</h2>
            <p className="text-slate-400 text-lg">Start for free, scale when you need to.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Hobby */}
            <div className="bg-royal-800 border border-royal-700 rounded-3xl p-8">
              <h3 className="text-xl font-bold mb-2">Hobby</h3>
              <div className="text-3xl font-extrabold mb-6">$0<span className="text-lg text-slate-400 font-normal">/mo</span></div>
              <ul className="space-y-3 mb-8 text-slate-300 text-sm">
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-mint-500"/> 3 Active Deployments</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-mint-500"/> Automated Dockerfile Generation</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-mint-500"/> Shared Infrastructure</li>
                <li className="flex items-center gap-2 text-slate-500"><XCircle className="w-4 h-4"/> Custom Domains</li>
              </ul>
              <button className="w-full bg-royal-700 hover:bg-royal-600 text-white font-bold py-3 rounded-xl transition-colors">Start Free</button>
            </div>

            {/* Pro */}
            <div className="bg-royal-800 border-2 border-mint-500 rounded-3xl p-8 relative transform md:-translate-y-4 shadow-2xl shadow-mint-500/10">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-mint-500 text-royal-900 font-bold text-xs px-3 py-1 rounded-full uppercase tracking-wider">Most Popular</div>
              <h3 className="text-xl font-bold mb-2">Pro</h3>
              <div className="text-3xl font-extrabold mb-6">$20<span className="text-lg text-slate-400 font-normal">/mo</span></div>
              <ul className="space-y-3 mb-8 text-slate-300 text-sm">
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-mint-500"/> Unlimited Deployments</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-mint-500"/> Advanced Analytics</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-mint-500"/> Custom Domains</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-mint-500"/> Priority Support</li>
              </ul>
              <button className="w-full bg-mint-500 hover:bg-mint-400 text-royal-900 font-bold py-3 rounded-xl transition-colors">Upgrade to Pro</button>
            </div>

            {/* Enterprise */}
            <div className="bg-royal-800 border border-royal-700 rounded-3xl p-8">
              <h3 className="text-xl font-bold mb-2">Enterprise</h3>
              <div className="text-3xl font-extrabold mb-6">Custom</div>
              <ul className="space-y-3 mb-8 text-slate-300 text-sm">
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-mint-500"/> Dedicated Clusters</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-mint-500"/> VPC Peering</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-mint-500"/> SSO & SAML</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-mint-500"/> SLA 99.99%</li>
              </ul>
              <button className="w-full bg-royal-700 hover:bg-royal-600 text-white font-bold py-3 rounded-xl transition-colors">Contact Sales</button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA SECTION */}
      <section className="py-32 bg-gradient-to-r from-royal-900 via-royal-800 to-royal-900 border-t border-royal-700 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl h-64 bg-mint-500/20 rounded-full blur-[100px] pointer-events-none"></div>
        
        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <h2 className="text-5xl lg:text-6xl font-extrabold mb-6 text-white tracking-tight">Ready to deploy smarter?</h2>
          <p className="text-xl text-slate-300 mb-10 max-w-2xl mx-auto">
            Join thousands of developers shipping production-ready applications without touching infrastructure.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link to="/deploy" className="bg-mint-500 hover:bg-mint-400 text-royal-900 font-bold px-10 py-5 rounded-full text-lg shadow-[0_0_50px_rgba(13,240,163,0.4)] hover:shadow-[0_0_80px_rgba(13,240,163,0.6)] transition-all flex items-center justify-center gap-3">
              <Rocket className="w-6 h-6" /> Start Deploying Now
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-royal-950 pt-16 pb-8 border-t border-royal-800 relative z-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div>
              <div className="flex items-center gap-2 mb-6">
                <Cloud className="w-6 h-6 text-mint-500" />
                <span className="text-xl font-bold tracking-tight text-white">StackPilot</span>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">
                Making DevOps invisible. Deploy your code in seconds, not hours.
              </p>
            </div>
            <div>
              <h4 className="font-bold mb-4 text-white">Product</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li><a href="#" className="hover:text-mint-500 transition-colors">Features</a></li>
                <li><a href="#" className="hover:text-mint-500 transition-colors">Integrations</a></li>
                <li><a href="#" className="hover:text-mint-500 transition-colors">Pricing</a></li>
                <li><a href="#" className="hover:text-mint-500 transition-colors">Changelog</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4 text-white">Resources</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li><a href="#" className="hover:text-mint-500 transition-colors">Documentation</a></li>
                <li><a href="#" className="hover:text-mint-500 transition-colors">API Reference</a></li>
                <li><a href="#" className="hover:text-mint-500 transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-mint-500 transition-colors">Community</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4 text-white">Company</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li><a href="#" className="hover:text-mint-500 transition-colors">About</a></li>
                <li><a href="#" className="hover:text-mint-500 transition-colors">Careers</a></li>
                <li><a href="#" className="hover:text-mint-500 transition-colors">Contact</a></li>
                <li><a href="#" className="hover:text-mint-500 transition-colors">Partners</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-royal-800 pt-8 flex flex-col md:flex-row items-center justify-between text-sm text-slate-500">
            <p>© {new Date().getFullYear()} StackPilot Inc. All rights reserved.</p>
            <div className="flex gap-4 mt-4 md:mt-0">
              <a href="#" className="hover:text-white transition-colors">Privacy</a>
              <a href="#" className="hover:text-white transition-colors">Terms</a>
              <a href="#" className="hover:text-white transition-colors">Security</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
