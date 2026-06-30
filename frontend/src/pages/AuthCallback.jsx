import React, { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import api from '../api';

export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const hasFetched = useRef(false);

  useEffect(() => {
    if (hasFetched.current) return;
    
    const params = new URLSearchParams(location.search);
    const token = params.get('token');

    if (token) {
      hasFetched.current = true;
      localStorage.setItem('token', token);
      // Fetch user profile immediately
      api.get('/auth/me').then(res => {
        localStorage.setItem('user', JSON.stringify(res.data));
        navigate('/dashboard', { replace: true });
      }).catch(err => {
        console.error(err);
        navigate('/login', { replace: true });
      });
    } else {
      navigate('/login', { replace: true });
    }
  }, [location, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-royal-950">
      <div className="text-center flex flex-col items-center">
        <Loader2 className="w-10 h-10 animate-spin text-mint-400 mb-4" />
        <p className="text-slate-400">Authenticating with GitHub...</p>
      </div>
    </div>
  );
}
