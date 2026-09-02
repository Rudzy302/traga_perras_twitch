import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import SlotMachine, { SlotTheme } from './SlotMachine';
import { GamePicker } from './GamePicker';
import StreamerDashboard from './StreamerDashboard';
import './App.css';

export const App: React.FC = () => {
  const [isOverlayMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('overlay') === 'true' || params.has('obs');
  });

  const [isGamePickerMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('gamepicker') === 'true';
  });

  const [overlaySocket, setOverlaySocket] = useState<Socket | null>(null);

  const [syncedTheme, setSyncedTheme] = useState<SlotTheme>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlTheme = params.get('theme') as SlotTheme;
      if (urlTheme) return urlTheme;
      try {
        const saved = localStorage.getItem('casino_streamer_config_v1');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.selectedTheme) return parsed.selectedTheme;
        }
      } catch {}
    }
    return 'carnival-green';
  });

  useEffect(() => {
    if (isOverlayMode) {
      document.body.classList.add('overlay-mode');
      document.body.classList.remove('dashboard-mode');
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      document.body.style.background = 'transparent';

      // Conectar socket para sincronizar tema y eventos en OBS
      const wsUrl =
        typeof window !== 'undefined'
          ? window.location.port === '5173'
            ? 'http://localhost:3000'
            : window.location.origin
          : 'http://localhost:3000';

      const s: Socket = io(wsUrl, {
        transports: ['websocket', 'polling'],
      });

      setOverlaySocket(s);

      s.on('theme-change', (newTheme: SlotTheme) => {
        if (newTheme) {
          const params = new URLSearchParams(window.location.search);
          if (!params.has('theme')) {
            setSyncedTheme(newTheme);
          }
        }
      });

      s.on('twitch-status', (status: { theme?: SlotTheme }) => {
        if (status?.theme) {
          const params = new URLSearchParams(window.location.search);
          if (!params.has('theme')) {
            setSyncedTheme(status.theme);
          }
        }
      });

      return () => {
        s.disconnect();
      };
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
    if (isGamePickerMode) {
      return (
        <main className="obs-overlay-main">
          <GamePicker socket={overlaySocket} isOverlay={true} />
        </main>
      );
    }

    const params = new URLSearchParams(window.location.search);
    const themeParam = (params.get('theme') as SlotTheme) || syncedTheme;

    return (
      <main className="obs-overlay-main">
        <SlotMachine isOverlayMode={true} theme={themeParam} />
      </main>
    );
  }

  return <StreamerDashboard />;
};

export default App;

