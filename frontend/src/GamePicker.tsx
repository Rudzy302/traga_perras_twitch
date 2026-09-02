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
  const [winnerCardIndex, setWinnerCardIndex] = useState<number>(120);
  const [showConfetti, setShowConfetti] = useState<boolean>(false);

  const viewportFrameRef = useRef<HTMLDivElement>(null);
  const reelContainerRef = useRef<HTMLDivElement>(null);

  // Helper para construir la cinta de tarjetas garantizando al ganador en la posición exacta
  const buildReelItems = (winner: any, pool: VotedGameSummary[], totalCount = 150, winnerIdx = 120): VotedGameSummary[] => {
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

    const WINNER_INDEX = 120;
    const TOTAL_CARDS = 150;

    // Pedir estado inicial
    socket.emit('get-game-picker-state', (state: GamePickerState) => {
      if (state) {
        setPickerState(state);
        if (state.votingState === 'WINNER' && state.winningGame) {
          const list = buildReelItems(state.winningGame, state.votedGames, TOTAL_CARDS, WINNER_INDEX);
          setSpinItems(list);
          setWinnerCardIndex(WINNER_INDEX);
          const vpWidth = viewportFrameRef.current?.clientWidth || 700;
          const offset = Math.round(WINNER_INDEX * 256 + 120 - vpWidth / 2);
          setTargetOffset(offset);
          setShowConfetti(true);
        }
      }
    });

    const handleStateChange = (state: GamePickerState) => {
      setPickerState(state);
      if (state.votingState === 'WINNER') {
        setIsSpinningLocal(false);
        setShowConfetti(true);
        if (state.winningGame) {
          const list = buildReelItems(state.winningGame, state.votedGames, TOTAL_CARDS, WINNER_INDEX);
          setSpinItems(list);
          setWinnerCardIndex(WINNER_INDEX);
          const vpWidth = viewportFrameRef.current?.clientWidth || 700;
          const offset = Math.round(WINNER_INDEX * 256 + 120 - vpWidth / 2);
          setTargetOffset(offset);
        }
      } else if (state.votingState === 'IDLE') {
        setShowConfetti(false);
        setIsSpinningLocal(false);
      }
    };

    const handleSpinStarted = (payload: { durationMs: number; votedPool: VotedGameSummary[]; winner: any }) => {
      setIsSpinningLocal(true);
      setShowConfetti(false);

      const winnerIdx = WINNER_INDEX;
      setWinnerCardIndex(winnerIdx);

      const list = buildReelItems(payload.winner, payload.votedPool, TOTAL_CARDS, winnerIdx);
      setSpinItems(list);

      // Calcular el desplazamiento en píxeles
      // Ancho de tarjeta 240px + gap 16px = 256px por paso
      // Centro de tarjeta = winnerIdx * 256 + 120px
      // Para alinear con centro de viewport (vpWidth / 2): offset = centerCard - vpWidth/2
      const vpWidth = viewportFrameRef.current?.clientWidth || 700;
      const finalOffset = Math.round(winnerIdx * 256 + 120 - vpWidth / 2);

      // Resetear posición primero
      setTargetOffset(0);

      // Timeout para iniciar el impulso cinético
      setTimeout(() => {
        setTargetOffset(finalOffset);
      }, 50);

      // Temporizador visual del giro cinético de 20 segundos
      const totalDuration = payload.durationMs || 20000;
      setTimeout(() => {
        setIsSpinningLocal(false);
      }, totalDuration);
    };

    socket.on('game-picker-state', handleStateChange);
    socket.on('game-picker-spin-started', handleSpinStarted);

    return () => {
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
          {/* Mira central de selección */}
          <div className="gp-center-pointer top-pointer">▼</div>
          <div className="gp-center-pointer bottom-pointer">▲</div>
          <div className="gp-center-target-line"></div>

          {/* Si está girando o mostrando ganador, renderizamos el carrusel horizontal */}
          {(pickerState.votingState === 'SPINNING' || pickerState.votingState === 'WINNER') && (
            <div className="gp-reel-track-wrapper">
              <div
                ref={reelContainerRef}
                className={`gp-reel-strip ${isSpinningLocal ? 'is-spinning-active' : ''}`}
                style={{
                  transform: `translateX(-${targetOffset}px)`,
                  transition: isSpinningLocal ? 'transform 20s cubic-bezier(0.05, 0.88, 0.1, 1)' : 'none',
                }}
              >
                {spinItems.map((item, idx) => {
                  const isWinnerCard = pickerState.votingState === 'WINNER' && idx === winnerCardIndex && !isSpinningLocal;
                  return (
                    <div key={idx} className={`gp-game-card ${isWinnerCard ? 'winner-card-glow' : ''}`}>
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
