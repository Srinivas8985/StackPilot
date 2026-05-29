import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, Link } from 'react-router-dom';
import api, { API_URL } from '../api';
import { Eye, EyeOff, Terminal, Rocket, Loader2 } from 'lucide-react';
import { FaGithub } from "react-icons/fa";

export default function Login() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { email, password } = formData;

  const onChange = e => setFormData({ ...formData, [e.target.name]: e.target.value });

  const onSubmit = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.post('/auth/login', formData);
      localStorage.setItem('token', res.data.token);
      
      // Fetch user details to get the role
      const userRes = await api.get('/auth/me');
      localStorage.setItem('user', JSON.stringify(userRes.data));

      setLoading(false);
      navigate('/dashboard');
    } catch (err) {
      setLoading(false);
      setError(err.response?.data?.errors?.[0]?.msg || 'Login failed. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-royal-900 flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md flat-panel p-8 relative overflow-hidden"
      >
        {/* Background shapes */}
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-mint-500 rounded-full opacity-10" />
        <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-cyan-500 rounded-full opacity-10" />

        <div className="relative z-10">
          <div className="flex justify-center mb-8">
            <Link to="/" className="flex items-center gap-2 group">
              <Rocket className="w-8 h-8 text-mint-500 group-hover:-translate-y-1 transition-transform" />
              <span className="text-2xl font-extrabold text-white">StackPilot</span>
            </Link>
          </div>

          <h2 className="text-2xl font-bold text-center text-white mb-2">Welcome Back</h2>
          <p className="text-center text-slate-400 mb-8 text-sm">Sign in to your DevOps dashboard</p>

          {error && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg mb-6 text-sm flex items-center gap-2"
            >
              <Terminal className="w-4 h-4 shrink-0" />
              {error}
            </motion.div>
          )}

          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Email Address</label>
              <input
                type="email"
                name="email"
                value={email}
                onChange={onChange}
                required
                className="w-full px-4 py-3 bg-royal-900/50 border border-royal-800 rounded-xl focus:outline-none focus:border-mint-500 focus:ring-1 focus:ring-mint-500 text-white placeholder-slate-500 transition-all"
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={password}
                  onChange={onChange}
                  required
                  className="w-full px-4 py-3 bg-royal-900/50 border border-royal-800 rounded-xl focus:outline-none focus:border-mint-500 focus:ring-1 focus:ring-mint-500 text-white placeholder-slate-500 transition-all"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input type="checkbox" className="w-4 h-4 rounded border-royal-800 text-mint-500 focus:ring-mint-500 focus:ring-offset-royal-900 bg-royal-900/50 cursor-pointer" />
                <span className="text-slate-400 group-hover:text-slate-300 transition-colors">Remember me</span>
              </label>
              <a href="#" className="text-mint-400 hover:text-mint-300 transition-colors">Forgot password?</a>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-mint-500 hover:bg-mint-400 text-royal-900 font-bold py-3.5 rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign In'}
            </button>
          </form>

          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-royal-800/50"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-royal-950/80 text-slate-500">Or continue with</span>
            </div>
          </div>

          <button
            onClick={() => {
              const envUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
              // Clean the URL to ensure it works whether /api was included in Vercel or not
              const baseUrl = envUrl.replace(/\/api\/?$/, '').replace(/\/$/, '');
              window.location.href = `${baseUrl}/api/auth/github`;
            }}
            className="w-full bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 text-white font-semibold py-3.5 rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-3 group"
          >
            <FaGithub className="w-5 h-5 group-hover:text-mint-400 transition-colors" />
            Continue with GitHub
          </button>

          <p className="text-center text-slate-400 text-sm mt-8">
            Don't have an account?{' '}
            <Link to="/signup" className="text-mint-400 hover:text-mint-300 font-semibold transition-colors">
              Create one now
            </Link>
            <br />
            Click Here{' '}
            <Link to="/" className="text-mint-400 hover:text-mint-300 font-semibold transition-colors">
              Home Page
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
