import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import './App.css';

// Payload enviado desde el backend NestJS
export interface StartSpinPayload {
  username: string;
  prize: number;
  duration: number; // 15000 ms
  prizesList?: number[];
}

export type SlotTheme =
  | 'carnival-green'
  | 'gold-classic'
  | 'cyber-neon'
  | 'inferno-flame'
  | 'ice-frost'
  | 'vaporwave-sunset'
  | 'steampunk-brass'
  | 'galactic-void';

export interface ThemeMeta {
  id: SlotTheme;
  name: string;
  subtitle: string;
  icon: string;
  headerIcon: string;
  colorPreview: string;
  tag: string;
}

export const THEMES_LIST: ThemeMeta[] = [
  {
    id: 'carnival-green',
    name: 'Carnaval Vintage',
    subtitle: 'Chasis esmeralda, latón biselado y bombillas de feria circense',
    icon: '🎪',
    headerIcon: '🎪',
    colorPreview: 'linear-gradient(135deg, #073a21, #0f7544 50%, #ffd700)',
    tag: 'DEFAULT FEST',
  },
  {
    id: 'gold-classic',
    name: 'Oro Real Casino',
    subtitle: 'Ébano negro pulido, molduras de oro 24k y gemas de diamantes',
    icon: '👑',
    headerIcon: '👑',
    colorPreview: 'linear-gradient(135deg, #141416, #2d2612 50%, #ffc837)',
    tag: 'LUXURY VIP',
  },
  {
    id: 'cyber-neon',
    name: 'Cyber Synthwave',
    subtitle: 'Fibra de carbono, tubos de neón magenta, cian y láser futurista',
    icon: '⚡',
    headerIcon: '⚡',
    colorPreview: 'linear-gradient(135deg, #0d061c, #00f0ff 50%, #ff007f)',
    tag: 'CYBERPUNK',
  },
  {
    id: 'inferno-flame',
    name: 'Infierno Arcade',
    subtitle: 'Hierro de forja, brasas al rojo vivo, remaches y fuego ardiente',
    icon: '🔥',
    headerIcon: '🔥',
    colorPreview: 'linear-gradient(135deg, #2b0606, #d63009 50%, #ff9900)',
    tag: 'HELLFIRE',
  },
  {
    id: 'ice-frost',
    name: 'Glaciar Ártico',
    subtitle: 'Zafiro polar translúcido, escarcha de cristal y luces aurora',
    icon: '❄️',
    headerIcon: '❄️',
    colorPreview: 'linear-gradient(135deg, #041426, #00b4d8 50%, #ffffff)',
    tag: 'FROSTBITE',
  },
  {
    id: 'vaporwave-sunset',
    name: 'Retro Miami 80s',
    subtitle: 'Carcasa curvada CRT, gradiente violeta coral y palmeras synthwave',
    icon: '🌴',
    headerIcon: '🌴',
    colorPreview: 'linear-gradient(135deg, #20083b, #d91b83 50%, #ff7700)',
    tag: 'RETRO 80S',
  },
  {
    id: 'steampunk-brass',
    name: 'Steampunk Clockwork',
    subtitle: 'Cobre martillado a mano, engranajes victorianos y lámparas nixie',
    icon: '⚙️',
    headerIcon: '⚙️',
    colorPreview: 'linear-gradient(135deg, #2a160d, #a05a2c 50%, #f4b266)',
    tag: 'VICTORIAN',
  },
  {
    id: 'galactic-void',
    name: 'Cosmos Galáctico',
    subtitle: 'Vacío interestelar, nebulosa púrpura y supernovas centelleantes',
    icon: '🌌',
    headerIcon: '🌌',
    colorPreview: 'linear-gradient(135deg, #0a011a, #6d28d9 50%, #ec4899)',
    tag: 'ASTRONOMICAL',
  },
];

// Pool variado tipo Jackpot desde 0 hasta 100,000 puntos
const DEFAULT_PRIZES: number[] = [
  0, 1, 2, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50,
  60, 75, 80, 100, 125, 150, 200, 250, 300, 350, 400, 450, 500,
  600, 750, 1000, 1250, 1500, 2000, 2500, 3000,
  4000, 5000, 7500, 10000, 15000, 20000, 25000,
  50000, 100000,
];

export interface SlotMachineProps {
  isOverlayMode?: boolean;
  isPreviewEmbedded?: boolean;
  theme?: SlotTheme;
}

export const SlotMachine: React.FC<SlotMachineProps> = ({
  isOverlayMode = false,
  isPreviewEmbedded = false,
  theme,
}) => {
  // Determinar tema activo (por prop, por URL o por defecto carnival-green)
  const [activeTheme, setActiveTheme] = useState<SlotTheme>(() => {
    if (theme) return theme;
    if (typeof window !== 'undefined') {
      const urlTheme = new URLSearchParams(window.location.search).get('theme') as SlotTheme;
      if (urlTheme && THEMES_LIST.some((t) => t.id === urlTheme)) {
        return urlTheme;
      }
    }
    return 'carnival-green';
  });

  useEffect(() => {
    if (theme) {
      setActiveTheme(theme);
    }
  }, [theme]);

  // Metadatos del tema activo
  const currentThemeMeta = THEMES_LIST.find((t) => t.id === activeTheme) || THEMES_LIST[0];

  // Estados de visualización
  const [isVisible, setIsVisible] = useState<boolean>(isPreviewEmbedded ? true : false);
  const [isSpinning, setIsSpinning] = useState<boolean>(false);
  const [isWinnerRevealed, setIsWinnerRevealed] = useState<boolean>(false);

  // Datos de la tirada
  const [username, setUsername] = useState<string>('Viewer');
  const [winningPrize, setWinningPrize] = useState<number>(500);

  // Valores visibles en el carrete vertical: [superior, central (ganador), inferior]
  const [reelDisplay, setReelDisplay] = useState<[number, number, number]>([250, 500, 1000]);

  // Audio Web API
  const [audioEnabled] = useState<boolean>(true);

  // Referencias para timers y Web Audio API
  const socketRef = useRef<Socket | null>(null);
  const spinIntervalRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Inicializar o reanudar AudioContext
  const getAudioContext = useCallback((): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    try {
      if (!audioCtxRef.current) {
        const AudioCtxClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtxClass) {
          audioCtxRef.current = new AudioCtxClass();
        }
      }
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
      return audioCtxRef.current;
    } catch {
      return null;
    }
  }, []);

  // Sonido de clic mecánico
  const playMechanicalTick = useCallback(
    (pitchMultiplier = 1.0) => {
      if (!audioEnabled) return;
      try {
        const ctx = getAudioContext();
        if (!ctx) return;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(420 * pitchMultiplier, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(70 * pitchMultiplier, ctx.currentTime + 0.045);

        gain.gain.setValueAtTime(0.35, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.045);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.048);
      } catch {}
    },
    [audioEnabled, getAudioContext],
  );

  // Sonido de freno y parada en seco
  const playHardStopSound = useCallback(() => {
    if (!audioEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(35, ctx.currentTime + 0.35);

      gain.gain.setValueAtTime(0.85, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.36);
    } catch {}
  }, [audioEnabled, getAudioContext]);

  // Fanfarria ganadora
  const playWinnerFanfare = useCallback(
    (isJackpot: boolean) => {
      if (!audioEnabled) return;
      try {
        const ctx = getAudioContext();
        if (!ctx) return;

        const chordFreqs = isJackpot
          ? [523.25, 659.25, 783.99, 1046.5, 1318.51]
          : [440.0, 554.37, 659.25, 880.0];

        chordFreqs.forEach((freq, index) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = isJackpot ? 'sawtooth' : 'sine';
          osc.frequency.setValueAtTime(freq, ctx.currentTime + index * 0.07);

          gain.gain.setValueAtTime(0.001, ctx.currentTime);
          gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + index * 0.07 + 0.04);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.6);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(ctx.currentTime + index * 0.07);
          osc.stop(ctx.currentTime + 1.65);
        });
      } catch {}
    },
    [audioEnabled, getAudioContext],
  );

  // Ejecución de la animación de 15 segundos con parada en seco
  const startSpinSequence = useCallback(
    (targetPrize: number, user: string, pool: number[] = DEFAULT_PRIZES) => {
      if (spinIntervalRef.current) {
        clearInterval(spinIntervalRef.current);
      }

      setIsVisible(true);
      setIsSpinning(true);
      setIsWinnerRevealed(false);
      setUsername(user || 'Viewer');
      setWinningPrize(targetPrize);

      const startTime = Date.now();
      const TOTAL_SPIN_TIME_MS = 14500;
      let currentTickInterval = 45;

      const runSpinLoop = () => {
        const elapsed = Date.now() - startTime;

        if (elapsed < TOTAL_SPIN_TIME_MS) {
          const randIdx = Math.floor(Math.random() * pool.length);
          const prev = pool[(randIdx - 1 + pool.length) % pool.length];
          const curr = pool[randIdx];
          const next = pool[(randIdx + 1) % pool.length];
          setReelDisplay([prev, curr, next]);

          if (elapsed > 11500) {
            const decelProgress = (elapsed - 11500) / 3000;
            currentTickInterval = 45 + decelProgress * 250;
            playMechanicalTick(0.85);
          } else {
            playMechanicalTick(1.15);
          }

          spinIntervalRef.current = window.setTimeout(runSpinLoop, currentTickInterval);
        } else {
          // PARADA EN SECO
          const prizeIdx = pool.indexOf(targetPrize);
          const safeIdx = prizeIdx !== -1 ? prizeIdx : 15;
          const prevPrize = pool[(safeIdx - 1 + pool.length) % pool.length] ?? 250;
          const nextPrize = pool[(safeIdx + 1) % pool.length] ?? 1000;

          setReelDisplay([prevPrize, targetPrize, nextPrize]);
          setIsSpinning(false);
          setIsWinnerRevealed(true);

          playHardStopSound();
          setTimeout(() => {
            playWinnerFanfare(targetPrize >= 10000);
          }, 180);

          // Desvanecer máquina tras 6 segundos (a los 21s en total)
          if (!isPreviewEmbedded) {
            setTimeout(() => {
              setIsVisible(false);
              setIsWinnerRevealed(false);
            }, 6500);
          }
        }
      };

      runSpinLoop();
    },
    [playMechanicalTick, playHardStopSound, playWinnerFanfare, isPreviewEmbedded],
  );

  // Conexión WebSocket al backend
  useEffect(() => {
    const envUrl = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_WS_URL;
    let wsUrl = envUrl;
    if (!wsUrl && typeof window !== 'undefined') {
      if (window.location.port === '5173') {
        wsUrl = 'http://localhost:3000';
      } else {
        wsUrl = window.location.origin;
      }
    }

    const socket: Socket = io(wsUrl || 'http://localhost:3000', {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
    });

    socketRef.current = socket;

    socket.on('start-spin', (payload: StartSpinPayload) => {
      startSpinSequence(payload.prize, payload.username, payload.prizesList || DEFAULT_PRIZES);
    });

    return () => {
      socket.disconnect();
      if (spinIntervalRef.current) {
        clearTimeout(spinIntervalRef.current);
      }
    };
  }, [startSpinSequence]);

  // Si estamos en modo Overlay transparente para OBS y no hay tirada activa, NO RENDERIZAR NADA
  if (isOverlayMode && !isVisible) {
    return null;
  }

  return (
    <div
      className={`slot-master-root theme-${activeTheme} ${
        isOverlayMode ? 'overlay-clean-canvas' : 'preview-canvas'
      }`}
    >
      {/* Marco de la Máquina Tragaperras */}
      <div
        className={`slot-cabinet-housing ${isSpinning ? 'cabinet-shaking' : ''} ${
          isWinnerRevealed ? 'cabinet-jackpot-pulse' : ''
        }`}
      >
        {/* Luces perimetrales superiores */}
        <div className="carnival-marquee-bulbs bulbs-top">
          {[...Array(7)].map((_, i) => (
            <span
              key={`bulb-t-${i}`}
              className={`carnival-bulb bulb-${i % 3} ${isSpinning ? 'bulb-chase' : ''}`}
              style={{ animationDelay: `${i * 0.12}s` }}
            />
          ))}
        </div>

        {/* Luces laterales */}
        <div className="carnival-marquee-bulbs bulbs-left">
          {[...Array(6)].map((_, i) => (
            <span
              key={`bulb-l-${i}`}
              className={`carnival-bulb bulb-${(i + 1) % 3} ${isSpinning ? 'bulb-chase' : ''}`}
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>

        <div className="carnival-marquee-bulbs bulbs-right">
          {[...Array(6)].map((_, i) => (
            <span
              key={`bulb-r-${i}`}
              className={`carnival-bulb bulb-${(i + 2) % 3} ${isSpinning ? 'bulb-chase' : ''}`}
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>

        {/* Cabecera / Placa de Marquesina: RUDZY FEST EN TODOS LOS TEMAS */}
        <div className="slot-header">
          <div className="carnival-plaque">
            <span className="carnival-crown">{currentThemeMeta.headerIcon}</span>
            <span className="carnival-title">Rudzy Fest</span>
            <span className="carnival-crown">{currentThemeMeta.headerIcon}</span>
          </div>

          {/* Tarjeta de Jugador: TIRADA POR PARTE DE */}
          <div className="spin-by-card">
            <span className="spin-by-label">TIRADA POR PARTE DE</span>
            <div className="spin-by-user-row">
              <span className="spin-by-icon">{currentThemeMeta.icon}</span>
              <span className="spin-by-username">
                @{username ? username.replace(/^@/, '') : 'Viewer'}
              </span>
            </div>
          </div>
        </div>

        {/* Marco de Carrete Mecánico */}
        <div className="slot-viewport-frame">
          <div className="payline-marker marker-left">▶</div>
          <div className="payline-marker marker-right">◀</div>

          <div className="drum-vignette vignette-top" />
          <div className="drum-vignette vignette-bottom" />

          <div className={`payline-laser-bar ${isWinnerRevealed ? 'laser-blast' : ''}`} />

          {/* Tira vertical del carrete */}
          <div
            className={`reel-vertical-strip ${
              isSpinning ? 'spinning-blur' : ''
            } ${isWinnerRevealed ? 'slam-impact' : ''}`}
          >
            <div className="reel-slot-number slot-prev">
              <span className="point-val">{reelDisplay[0].toLocaleString()}</span>
              <span className="pts-label">PTS</span>
            </div>

            {/* Fila Central: Premio Ganador */}
            <div
              className={`reel-slot-number slot-winner-row ${
                isWinnerRevealed ? 'prize-revealed' : ''
              }`}
            >
              <span className="currency-symbol">💎</span>
              <span className="point-val winner-number">
                {reelDisplay[1].toLocaleString()}
              </span>
              <span className="pts-label winner-label">PUNTOS</span>
            </div>

            <div className="reel-slot-number slot-next">
              <span className="point-val">{reelDisplay[2].toLocaleString()}</span>
              <span className="pts-label">PTS</span>
            </div>
          </div>
        </div>

        {/* Pie de la Máquina: Estado o Ganador */}
        <div className="slot-footer">
          {isSpinning && (
            <div className="spinning-status-bar">
              <span className="spinner-gear">⚙️</span>
              <span className="spinning-text">¡GIRANDO CARRETE!</span>
              <span className="spinner-gear">⚙️</span>
            </div>
          )}

          {isWinnerRevealed && (
            <div className="winner-celebration-banner">
              <div className="winner-banner-ribbon">
                <span className="ribbon-stars">⭐ 🏆 ⭐</span>
                <span className="winner-title">¡PREMIO GANADO!</span>
                <span className="winner-amount">+{winningPrize.toLocaleString()} PUNTOS</span>
              </div>
            </div>
          )}
        </div>

        {/* Luces perimetrales inferiores */}
        <div className="carnival-marquee-bulbs bulbs-bottom">
          {[...Array(7)].map((_, i) => (
            <span
              key={`bulb-b-${i}`}
              className={`carnival-bulb bulb-${(i + 2) % 3} ${isSpinning ? 'bulb-chase' : ''}`}
              style={{ animationDelay: `${i * 0.12}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default SlotMachine;
