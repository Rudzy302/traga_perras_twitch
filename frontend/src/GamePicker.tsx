import React, { useEffect, useState, useRef } from 'react';
import { Socket } from 'socket.io-client';

export interface VotedGameSummary {
  id: string;
  name: string;
  category: string;
  votesCount: number;
  voters: string[];
}

export interface GamePickerState {
  votingState: 'IDLE' | 'VOTING' | 'SPINNING' | 'WINNER' | 'COOLDOWN';
  duration: number;
  timeRemaining: number;
  totalVotes: number;
  votedGames: VotedGameSummary[];
  previouslyWonGames: string[];
  enabledGameIds: string[];
  enabledGames: { id: string; name: string; category: string; platform?: string }[];
  winningGame: {
    id: string;
    name: string;
    category: string;
    votedBy: string[];
  } | null;
  activeTheme: string;
}

interface GamePickerProps {
  socket: Socket | null;
  isOverlay?: boolean;
}

export const GAME_PICKER_THEMES = [
  { id: 'cyber-arcade', name: 'Cyber Arcade', icon: '⚡', color: '#00f0ff' },
  { id: 'retro-16bit', name: 'Retro 16-Bit', icon: '🕹️', color: '#ffaa00' },
  { id: 'halloween-terror', name: 'Halloween Terror', icon: '🎃', color: '#39ff14' },
  { id: 'christmas-magic', name: 'Navidad Mágica', icon: '🎄', color: '#ffd700' },
  { id: 'dark-stealth', name: 'Dark Stealth', icon: '🌌', color: '#a855f7' },
];

export const GamePicker: React.FC<GamePickerProps> = ({ socket, isOverlay = false }) => {
  const [pickerState, setPickerState] = useState<GamePickerState>({
    votingState: 'IDLE',
    duration: 120,
    timeRemaining: 0,
    totalVotes: 0,
    votedGames: [],
    previouslyWonGames: [],
    enabledGameIds: [],
    enabledGames: [],
    winningGame: null,
    activeTheme: 'cyber-arcade',
  });

  const [spinItems, setSpinItems] = useState<VotedGameSummary[]>([]);
  const [isSpinningLocal, setIsSpinningLocal] = useState<boolean>(false);
  const [targetOffset, setTargetOffset] = useState<number>(0);
  const [winnerCardIndex, setWinnerCardIndex] = useState<number>(280);
  const [showConfetti, setShowConfetti] = useState<boolean>(false);
  const [needleActive, setNeedleActive] = useState<boolean>(false);

  const viewportFrameRef = useRef<HTMLDivElement>(null);
  const reelContainerRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Helper para obtener AudioContext
  const getAudioContext = () => {
    try {
      if (!audioContextRef.current) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) audioContextRef.current = new AudioCtx();
      }
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }
      return audioContextRef.current;
    } catch {
      return null;
    }
  };

  // Sonido de "TAC" mecánico de la aguja al chocar con cada divisor de casilla
  const playNeedleTick = () => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      // Ruido percusivo de aguja plástica / madera ("TAC" seco y definido)
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(680, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(70, ctx.currentTime + 0.016);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1400, ctx.currentTime);
      filter.Q.setValueAtTime(3.0, ctx.currentTime);

      gain.gain.setValueAtTime(0.38, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.016);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.018);
    } catch {}
  };

  // Helper para construir la cinta de tarjetas garantizando al ganador en la posición exacta
  const buildReelItems = (winner: any, pool: VotedGameSummary[], totalCount = 350, winnerIdx = 280): VotedGameSummary[] => {
    const safePool: VotedGameSummary[] =
      pool && pool.length > 0
        ? pool
        : winner
        ? [{ id: winner.id, name: winner.name, category: winner.category || 'Juego Sugerido', votesCount: 1, voters: winner.votedBy || [] }]
        : [{ id: 'default', name: 'Juego Sorpresa', category: 'Aleatorio', votesCount: 1, voters: [] }];

    const list: VotedGameSummary[] = [];
    for (let i = 0; i < totalCount; i++) {
      const item = safePool[i % safePool.length];
      list.push({ ...item });
    }

    if (winner) {
      list[winnerIdx] = {
        id: winner.id,
        name: winner.name,
        category: winner.category || 'Juego Ganador',
        votesCount: 1,
        voters: winner.votedBy || [],
      };
    }

    return list;
  };

  // Escuchar eventos de WebSockets
  useEffect(() => {
    if (!socket) return;

    const WINNER_INDEX = 280;
    const TOTAL_CARDS = 350;

    // Pedir estado inicial
    socket.emit('get-game-picker-state', (state: GamePickerState) => {
      if (state) {
        setPickerState(state);
        if (state.votingState === 'WINNER' && state.winningGame) {
          const list = buildReelItems(state.winningGame, state.votedGames, TOTAL_CARDS, WINNER_INDEX);
          setSpinItems(list);
          setWinnerCardIndex(WINNER_INDEX);
          const vpWidth = viewportFrameRef.current?.getBoundingClientRect().width || 700;
          const offset = Math.round(WINNER_INDEX * 256 + 120 - vpWidth / 2);
          setTargetOffset(offset);
          setShowConfetti(true);
        }
      }
    });

    const handleStateChange = (state: GamePickerState) => {
      setPickerState(state);
      if (state.votingState === 'WINNER') {
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        setIsSpinningLocal(false);
        setShowConfetti(true);
        if (state.winningGame) {
          const list = buildReelItems(state.winningGame, state.votedGames, TOTAL_CARDS, WINNER_INDEX);
          setSpinItems(list);
          setWinnerCardIndex(WINNER_INDEX);
          const vpWidth = viewportFrameRef.current?.getBoundingClientRect().width || 700;
          const offset = Math.round(WINNER_INDEX * 256 + 120 - vpWidth / 2);
          setTargetOffset(offset);
          if (reelContainerRef.current) {
            reelContainerRef.current.style.transition = 'transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)';
            reelContainerRef.current.style.transform = `translateX(-${offset}px)`;
          }
        }
      } else if (state.votingState === 'IDLE') {
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        setShowConfetti(false);
        setIsSpinningLocal(false);
      }
    };

    const handleSpinStarted = (payload: { durationMs: number; votedPool: VotedGameSummary[]; winner: any }) => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

      setIsSpinningLocal(true);
      setShowConfetti(false);

      const winnerIdx = WINNER_INDEX;
      setWinnerCardIndex(winnerIdx);

      const list = buildReelItems(payload.winner, payload.votedPool, TOTAL_CARDS, winnerIdx);
      setSpinItems(list);

      const vpWidth = viewportFrameRef.current?.getBoundingClientRect().width || 700;
      const exactFinalOffset = Math.round(winnerIdx * 256 + 120 - vpWidth / 2);
      setTargetOffset(exactFinalOffset);

      // Resetear posición
      if (reelContainerRef.current) {
        reelContainerRef.current.style.transition = 'none';
        reelContainerRef.current.style.transform = 'translateX(0px)';
      }

      // FÍSICA Y SINCRONIZACIÓN EXACTA EN EL BORDE IZQUIERDO DE CADA CASILLA
      const startTime = performance.now();
      const totalDuration = payload.durationMs || 60000;
      const spinDuration = totalDuration - 800; // 59.2s de giro + 0.8s de rebote magnético al centro

      const needleCenterScreenX = vpWidth / 2;
      // Inicializar con la casilla que ya está presente bajo la aguja en offset 0 para evitar falsos golpes al arrancar
      let lastTriggeredCard = Math.floor(needleCenterScreenX / 256);

      // Curva física de desaceleración gradual
      const getWheelEase = (t: number): number => {
        return 1 - Math.pow(1 - t, 4.2);
      };

      const animateWheel = (now: number) => {
        const elapsed = now - startTime;

        if (elapsed < spinDuration) {
          const progress = elapsed / spinDuration;
          const easedProgress = getWheelEase(progress);
          // Permitir una leve inercia hacia adelante antes del rebote al centro exacto
          const currentOffset = easedProgress * (exactFinalOffset + 35);

          if (reelContainerRef.current) {
            reelContainerRef.current.style.transition = 'none';
            reelContainerRef.current.style.transform = `translateX(-${currentOffset}px)`;
          }

          // Medir el paso físico exacto del borde izquierdo de cada casilla
          // (Cada casilla K empieza en K * 256px y su borde izquierdo choca con la aguja en currentOffset + needleCenterScreenX >= K * 256)
          const currentVpW = viewportFrameRef.current?.getBoundingClientRect().width || vpWidth;
          const currentNeedleX = currentVpW / 2;
          const needleXOnStrip = currentOffset + currentNeedleX;
          const currentCardLeftEdge = Math.floor(needleXOnStrip / 256);

          if (currentCardLeftEdge > lastTriggeredCard) {
            lastTriggeredCard = currentCardLeftEdge;
            playNeedleTick();
            setNeedleActive(true);
            setTimeout(() => setNeedleActive(false), 40);
          }

          animFrameRef.current = requestAnimationFrame(animateWheel);
        } else {
          // FASE DE REBOTE MAGNÉTICO AL CENTRO EXACTO (Sin sonido en la línea central, suave y silencioso)
          if (reelContainerRef.current) {
            // Rebote elástico que clava la casilla ganadora en todo el centro
            reelContainerRef.current.style.transition = 'transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)';
            reelContainerRef.current.style.transform = `translateX(-${exactFinalOffset}px)`;
          }

          setTimeout(() => {
            setIsSpinningLocal(false);
          }, 800);
        }
      };

      animFrameRef.current = requestAnimationFrame(animateWheel);
    };

    socket.on('game-picker-state', handleStateChange);
    socket.on('game-picker-spin-started', handleSpinStarted);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      socket.off('game-picker-state', handleStateChange);
      socket.off('game-picker-spin-started', handleSpinStarted);
    };
  }, [socket]);

  // Si estamos en modo Overlay de OBS y el estado es IDLE (apagado), ser 100% invisible
  if (isOverlay && pickerState.votingState === 'IDLE') {
    return null;
  }

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const themeClass = `gp-theme-${pickerState.activeTheme || 'cyber-arcade'}`;

  return (
    <div className={`game-picker-root ${themeClass} ${isOverlay ? 'overlay-obs-mode' : 'dashboard-preview-mode'}`}>
      {/* Contenedor Principal del Gabinete Horizontal */}
      <div className="gp-cabinet-housing">
        {/* Cabecera / Marquesina Gamer */}
        <div className="gp-marquee-header">
          <div className="gp-crown-icon">🎮</div>
          <div className="gp-marquee-title">LA SELECTORA DE JUEGOS</div>
          <div className="gp-crown-icon">🎮</div>
        </div>

        {/* Barra de Estado del Ciclo de Vida */}
        <div className="gp-status-bar">
          {pickerState.votingState === 'VOTING' && (
            <div className="gp-status-badge badge-voting">
              <span className="gp-pulse-dot"></span>
              <span className="gp-status-text">🟢 RECIBIENDO JUEGOS EN CHAT (!juego)</span>
              <span className="gp-timer-pill">⏱️ {formatSeconds(pickerState.timeRemaining)}</span>
              <span className="gp-votes-counter">🗳️ {pickerState.totalVotes} votos</span>
            </div>
          )}

          {pickerState.votingState === 'SPINNING' && (
            <div className="gp-status-badge badge-spinning">
              <span className="gp-pulse-dot pulse-fast"></span>
              <span className="gp-status-text">🎰 GIRANDO SELECTORA ENTRE JUEGOS VOTADOS...</span>
            </div>
          )}

          {pickerState.votingState === 'WINNER' && (
            <div className="gp-status-badge badge-winner">
              <span className="gp-status-text">🏆 ¡JUEGO GANADOR SELECCIONADO! 🏆</span>
            </div>
          )}

          {pickerState.votingState === 'COOLDOWN' && (
            <div className="gp-status-badge badge-closed">
              <span className="gp-status-text">🔒 COLA CERRADA — MODO SILENCIO</span>
            </div>
          )}

          {pickerState.votingState === 'IDLE' && !isOverlay && (
            <div className="gp-status-badge badge-idle">
              <span className="gp-status-text">⏸️ SELECTORA EN ESPERA (Presiona Activar)</span>
            </div>
          )}
        </div>

        {/* VISOR HORIZONTAL DEL CARRUSEL */}
        <div ref={viewportFrameRef} className="gp-viewport-frame">
          {/* Mira central de selección con deflexión física en cada tick */}
          <div className={`gp-center-pointer top-pointer ${needleActive ? 'needle-tick-active' : ''}`}>▼</div>
          <div className={`gp-center-pointer bottom-pointer ${needleActive ? 'needle-tick-active' : ''}`}>▲</div>
          <div className={`gp-center-target-line ${pickerState.votingState === 'WINNER' ? 'target-line-winner' : ''}`}></div>

          {/* Si está girando o mostrando ganador, renderizamos el carrusel horizontal */}
          {(pickerState.votingState === 'SPINNING' || pickerState.votingState === 'WINNER') && (
            <div className="gp-reel-track-wrapper">
              <div
                ref={reelContainerRef}
                className={`gp-reel-strip ${isSpinningLocal ? 'is-spinning-active' : ''}`}
                style={{
                  transform: `translateX(-${targetOffset}px)`,
                  transition: 'none',
                }}
              >
                {spinItems.map((item, idx) => {
                  const isWinnerCard =
                    (pickerState.votingState === 'WINNER' || !isSpinningLocal) &&
                    idx === winnerCardIndex &&
                    Boolean(pickerState.winningGame);

                  return (
                    <div key={idx} className={`gp-game-card ${isWinnerCard ? 'winner-card-glow' : ''}`}>
                      {/* Diente/Pasador físico izquierdo que golpea la aguja */}
                      <div className="gp-card-left-peg"></div>
                      <div className="gp-card-glow-border"></div>
                      <div className="gp-card-icon">{isWinnerCard ? '🏆' : '🎮'}</div>
                      <div className="gp-card-title">{item.name}</div>
                      <div className="gp-card-category">{item.category}</div>
                      {item.voters && item.voters.length > 0 && item.voters[0] !== 'Ruleta Automática' && (
                        <div className="gp-card-voter-badge">
                          👤 Votos: {item.votesCount}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Si está en fase de votación, mostrar tarjetas de los juegos que van recibiendo votos */}
          {pickerState.votingState === 'VOTING' && (
            <div className="gp-voted-preview-row">
              {pickerState.votedGames.length === 0 ? (
                <div className="gp-empty-hint">
                  <div className="gp-hint-icon">💬</div>
                  <div className="gp-hint-text">Escribe <b>!juego [Nombre]</b> en el chat de Twitch para sugerir tu juego</div>
                </div>
              ) : (
                <div className="gp-active-voted-scroll">
                  {pickerState.votedGames.map((g) => (
                    <div key={g.id} className="gp-mini-voted-card">
                      <div className="gp-mini-name">{g.name}</div>
                      <div className="gp-mini-badge">{g.votesCount} {g.votesCount === 1 ? 'voto' : 'votos'}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Si está en IDLE (preview del panel), mostrar mensaje informativo */}
          {pickerState.votingState === 'IDLE' && !isOverlay && (
            <div className="gp-idle-preview-box">
              <div className="gp-idle-icon">🕹️</div>
              <div className="gp-idle-text">Gabinete Horizontal Listo. Activa la votación para recibir juegos de tu chat.</div>
            </div>
          )}
        </div>

        {/* CARTEL DE CELEBRACIÓN DE GANADOR (FASE 3: Solo una vez que la máquina se ha detenido por completo) */}
        {pickerState.votingState === 'WINNER' && !isSpinningLocal && pickerState.winningGame && (
          <div className="gp-winner-announcement-overlay">
            <div className="gp-winner-trophy">🏆</div>
            <div className="gp-winner-label">¡EL JUEGO GANADOR ES!</div>
            <div className="gp-winner-title">{pickerState.winningGame.name}</div>
            <div className="gp-winner-category">{pickerState.winningGame.category}</div>
            {pickerState.winningGame.votedBy && pickerState.winningGame.votedBy.length > 0 && pickerState.winningGame.votedBy[0] !== 'Ruleta Automática' && (
              <div className="gp-winner-voters">
                <span>Votado por:</span>{' '}
                <b>{pickerState.winningGame.votedBy.slice(0, 5).map((v) => '@' + v).join(', ')}</b>
              </div>
            )}
          </div>
        )}

        {/* Efecto de confeti visual en pantalla */}
        {showConfetti && !isSpinningLocal && (
          <div className="gp-confetti-container">
            {Array.from({ length: 40 }).map((_, i) => (
              <div
                key={i}
                className="gp-confetti-particle"
                style={{
                  left: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 1.5}s`,
                  backgroundColor: ['#ffd700', '#00f0ff', '#ff007f', '#39ff14', '#ffffff'][i % 5],
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
