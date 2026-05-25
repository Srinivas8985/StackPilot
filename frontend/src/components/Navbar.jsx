import React from 'react';
import { Rocket, User, LogOut, Plus } from 'lucide-react';
import { Link, useNavigate, useLocation } from 'react-router-dom';

const NAV_LINKS = [
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Deployments', path: '/deployments' },
];

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const token = localStorage.getItem('token');

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  return (
    <nav className="fixed top-4 left-0 right-0 z-50 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between bg-white/10 backdrop-blur-md border border-white/20 shadow-xl rounded-full px-6 py-3">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <div className="text-white">
              <Rocket className="w-8 h-8" />
            </div>
            <span className="text-2xl font-extrabold tracking-tight text-white">
              StackPilot
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden lg:flex items-center gap-8">
            {NAV_LINKS.map((item) => (
              <Link
                key={item.label}
                to={item.path}
                className={`text-sm font-medium transition-colors ${
                  location.pathname === item.path
                    ? 'text-mint-400'
                    : 'text-slate-100 hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            {token ? (
              <>
                <Link
                  to="/deploy"
                  className="flex items-center gap-1.5 bg-mint-500 hover:bg-mint-400 text-royal-900 px-5 py-2 rounded-full font-bold text-sm transition-all shadow-lg hover:shadow-xl"
                >
                  <Plus className="w-4 h-4" />
                  Deploy
                </Link>
                <button
                  onClick={handleLogout}
                  className="hidden sm:flex items-center gap-2 text-sm font-medium text-slate-100 hover:text-white transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="hidden sm:flex items-center gap-2 text-sm font-medium text-slate-100 hover:text-white transition-colors">
                  <User className="w-4 h-4" />
                  Login
                </Link>
                <Link to="/signup" className="flex items-center gap-2 bg-mint-500 hover:bg-mint-400 text-royal-900 px-6 py-2.5 rounded-full font-bold transition-all shadow-lg hover:shadow-xl">
                  Sign Up
                </Link>
              </>
            )}
          </div>

        </div>
      </div>
    </nav>
  );
}
