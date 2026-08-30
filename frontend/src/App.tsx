import React, { useState, useEffect } from 'react';
import SlotMachine from './SlotMachine';
import StreamerDashboard from './StreamerDashboard';
import './App.css';

export const App: React.FC = () => {
  const [isOverlayMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('overlay') === 'true' || params.has('obs');
  });

  useEffect(() => {
    if (isOverlayMode) {
      document.body.classList.add('overlay-mode');
      document.body.classList.remove('dashboard-mode');
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      document.body.style.background = 'transparent';
    } else {
      document.body.classList.add('dashboard-mode');
      document.body.classList.remove('overlay-mode');
      document.body.style.overflowY = 'auto';
      document.body.style.overflowX = 'hidden';
      document.documentElement.style.overflowY = 'auto';
      document.body.style.background = '#0b0c10';
    }
  }, [isOverlayMode]);

  if (isOverlayMode) {
    const params = new URLSearchParams(window.location.search);
    const themeParam = params.get('theme') as any;

    return (
      <main className="obs-overlay-main">
        <SlotMachine isOverlayMode={true} theme={themeParam || 'carnival-green'} />
      </main>
    );
  }

  return <StreamerDashboard />;
};

export default App;
