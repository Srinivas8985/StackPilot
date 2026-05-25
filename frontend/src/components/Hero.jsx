import React from 'react';
import { motion } from 'framer-motion';
import { Terminal, ArrowRight, Play, GitBranch } from 'lucide-react';

export default function Hero() {
  return (
    <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="flex flex-col lg:flex-row items-center gap-16">
          
          {/* Text Content */}
          <div className="flex-1 text-center lg:text-left">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-white font-semibold text-lg mb-4"
            >
              Automated CI/CD Deployment
            </motion.div>

            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-5xl lg:text-7xl font-extrabold tracking-tight mb-8 text-white leading-[1.1]"
            >
              Deploy faster,<br className="hidden lg:block" />
              <span className="text-mint-500">
                scale effortlessly.
              </span>
            </motion.h1>

            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-lg lg:text-xl text-slate-100 mb-10 max-w-2xl mx-auto lg:mx-0 font-medium"
            >
              From startup to enterprise. We are your DevOps partners who will make your infrastructure stand out.
              <br/><br/>
              How? <span className="text-mint-500 font-bold uppercase tracking-wide text-sm">Based in Automation and Scale</span>
            </motion.p>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4"
            >
              <button className="w-full sm:w-auto flex items-center justify-center gap-2 bg-mint-500 hover:bg-mint-400 text-royal-900 px-10 py-4 rounded-full font-extrabold tracking-wide uppercase transition-all shadow-xl">
                Start Deployment
              </button>
            </motion.div>
          </div>

          {/* Abstract / Code Component */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="flex-1 w-full max-w-2xl relative"
          >
            {/* Mint Circle Decoration */}
            <div className="absolute -top-12 -right-12 w-32 h-32 border-[16px] border-mint-500 rounded-full opacity-80 mix-blend-screen" />
            <div className="absolute -bottom-8 -left-8 w-48 h-48 border-[24px] border-cyan-400 rounded-full opacity-60 mix-blend-screen" />

            <div className="flat-panel overflow-hidden shadow-2xl relative z-10">
              <div className="bg-royal-900 px-4 py-3 flex items-center gap-2 border-b border-royal-800">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <div className="ml-4 flex items-center text-xs text-slate-300 font-mono font-medium">
                  <GitBranch className="w-3 h-3 mr-2 text-mint-500" />
                  stackpilot/deploy.yml
                </div>
              </div>
              <div className="p-6 bg-royal-800 font-mono text-sm sm:text-base text-slate-200 leading-relaxed overflow-x-auto">
                <div className="flex">
                  <span className="text-royal-900/50 mr-4 select-none">1</span>
                  <span><span className="text-mint-400">name</span>: Production Deploy</span>
                </div>
                <div className="flex">
                  <span className="text-royal-900/50 mr-4 select-none">2</span>
                  <span><span className="text-mint-400">on</span>:</span>
                </div>
                <div className="flex">
                  <span className="text-royal-900/50 mr-4 select-none">3</span>
                  <span>  <span className="text-mint-400">push</span>:</span>
                </div>
                <div className="flex">
                  <span className="text-royal-900/50 mr-4 select-none">4</span>
                  <span>    <span className="text-mint-400">branches</span>: [ <span className="text-cyan-400">"main"</span> ]</span>
                </div>
                <div className="flex mt-2">
                  <span className="text-royal-900/50 mr-4 select-none">5</span>
                  <span className="text-mint-500 flex items-center font-bold">
                    <span className="mr-2">&gt;</span> Deploying to cluster... <span className="animate-pulse ml-1">_</span>
                  </span>
                </div>
              </div>
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}
