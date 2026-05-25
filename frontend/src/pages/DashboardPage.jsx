import React from 'react';

import Dashboard from '../components/Dashboard';

export default function DashboardPage() {
  // Force HMR update
  return (
    <main className="relative z-10 h-full">
      <Dashboard />
    </main>
  );
}
