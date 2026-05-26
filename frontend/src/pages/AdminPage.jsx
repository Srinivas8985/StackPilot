import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminDashboard from '../components/AdminDashboard';

export default function AdminPage() {
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is admin
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user.role !== 'admin') {
          navigate('/dashboard');
        }
      } catch (err) {
        navigate('/dashboard');
      }
    } else {
      navigate('/login');
    }
  }, [navigate]);

  return <AdminDashboard />;
}
