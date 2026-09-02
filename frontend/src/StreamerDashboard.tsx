import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import SlotMachine, { SlotTheme, THEMES_LIST } from './SlotMachine';

export interface TwitchStatusPayload {
  channel: string;
  botUsername: string;
  oauthToken?: string;
  isAuthenticated: boolean;
  authError?: string | null;
  isSpinActive: boolean;
  cooldownSeconds: number;
  pointsCommand?: string;
  theme?: SlotTheme;
  announceCountdown?: boolean;
  isConfigured?: boolean;
  lastConsecutiveUser?: string | null;
  consecutiveSpinsCount?: number;
  maxConsecutiveSpins?: number;
}

const LOCAL_STORAGE_KEY = 'casino_streamer_config_v1';

export type DashboardTab = 'connect' | 'rudzy-fest' | 'more-games';

export const StreamerDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<DashboardTab>('connect');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [twitchStatus, setTwitchStatus] = useState<TwitchStatusPayload | null>(null);

  // Helper para leer del localStorage inmediatamente
  const getStoredConfig = () => {
    try {
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (raw) return JSON.parse(raw);
      }
    } catch {}
    return null;
  };

  const stored = getStoredConfig();

  // Formulario de configuración
  const [channel, setChannel] = useState<string>(stored?.channel || 'Rudzy_tv');
  const [botUsername, setBotUsername] = useState<string>(stored?.botUsername || 'Rudzy_tv');
  const [oauthToken, setOauthToken] = useState<string>(stored?.oauthToken || '');
  const [showToken, setShowToken] = useState<boolean>(false);
  const [commandType, setCommandType] = useState<string>(stored?.commandType || 'botrix');
  const [customCommand, setCustomCommand] = useState<string>(stored?.customCommand || '!points add {user} {prize}');
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(stored?.cooldownSeconds ?? 300);

  // Estado Anti-Campeo
  const [consecutiveUser, setConsecutiveUser] = useState<string | null>(null);
  const [consecutiveCount, setConsecutiveCount] = useState<number>(0);
  const [maxConsecutive, setMaxConsecutive] = useState<number>(2);

  // Tema de la máquina y aviso de cuenta regresiva
  const [selectedTheme, setSelectedTheme] = useState<SlotTheme>(stored?.selectedTheme || 'carnival-green');
  const [announceCountdown, setAnnounceCountdown] = useState<boolean>(stored?.announceCountdown ?? true);

  // Estado de mensajes y copiado
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error' | 'info' | ''; message: string }>({
    type: '',
    message: '',
  });
  const [copiedObsUrl, setCopiedObsUrl] = useState<boolean>(false);

  const socketRef = useRef<Socket | null>(null);

  // Helper para guardar datos en localStorage de manera persistente
  const saveToStorage = (updatedFields: Record<string, any>) => {
    try {
      if (typeof window !== 'undefined') {
        const currentRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
        const current = currentRaw ? JSON.parse(currentRaw) : {};
        const merged = { ...current, ...updatedFields };
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(merged));
      }
    } catch {}
  };

  // Determinar URL del backend WebSocket
  const getBackendUrl = () => {
    const envUrl = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_WS_URL;
    if (envUrl) return envUrl;
    if (typeof window !== 'undefined') {
      if (window.location.port === '5173') return 'http://localhost:3000';
      return window.location.origin;
    }
    return 'http://localhost:3000';
  };

  useEffect(() => {
    const wsUrl = getBackendUrl();
    const s: Socket = io(wsUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 15,
      reconnectionDelay: 2000,
    });

    socketRef.current = s;

    s.on('connect', () => {
      setIsConnected(true);
      s.emit('get-twitch-status');

      // Si el navegador ya tiene configuración almacenada, sincronizarla con el backend
      if (stored?.channel) {
        let finalCmd = '!points add {user} {prize}';
        if (stored.commandType === 'short') finalCmd = '!p @{user} {prize}';
        else if (stored.commandType === 'custom' && stored.customCommand) finalCmd = stored.customCommand;

        s.emit('set-twitch-credentials', {
          channel: stored.channel,
          botUsername: stored.botUsername || stored.channel,
          oauthToken: stored.oauthToken || '',
          pointsCommand: finalCmd,
          cooldownSeconds: stored.cooldownSeconds || 300,
          theme: stored.selectedTheme || 'carnival-green',
          announceCountdown: stored.announceCountdown !== undefined ? stored.announceCountdown : true,
        });
      }
    });

    s.on('disconnect', () => {
      setIsConnected(false);
    });

    s.on('twitch-status', (status: TwitchStatusPayload) => {
      setTwitchStatus(status);
      if (status.channel) {
        setChannel(status.channel);
      }
      if (status.botUsername) {
        setBotUsername(status.botUsername);
      }
      if (status.oauthToken) {
        setOauthToken(status.oauthToken);
      }
      if (status.cooldownSeconds !== undefined) {
        setCooldownSeconds(status.cooldownSeconds);
      }
      if (status.theme) {
        setSelectedTheme(status.theme);
      }
      if (status.announceCountdown !== undefined) {
        setAnnounceCountdown(status.announceCountdown);
      }
      if (status.lastConsecutiveUser !== undefined) {
        setConsecutiveUser(status.lastConsecutiveUser);
      }
      if (status.consecutiveSpinsCount !== undefined) {
        setConsecutiveCount(status.consecutiveSpinsCount);
      }
      if (status.maxConsecutiveSpins !== undefined) {
        setMaxConsecutive(status.maxConsecutiveSpins);
      }
    });

    return () => {
      s.disconnect();
    };
  }, []);

  const handleResetConsecutiveSpins = () => {
    if (!socketRef.current) return;
    socketRef.current.emit('reset-consecutive-spins');
    setConsecutiveUser(null);
    setConsecutiveCount(0);
    setSaveStatus({
      type: 'info',
      message: '🔄 Racha anti-campeo reseteada exitosamente. Cualquier usuario puede tirar.',
    });
    setTimeout(() => setSaveStatus({ type: '', message: '' }), 3000);
  };

  // Guardar configuración completa en el servidor y en almacenamiento permanente
  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    if (!channel.trim()) {
      setSaveStatus({
        type: 'error',
        message: 'Por favor ingresa el nombre de tu canal de Twitch.',
      });
      return;
    }

    let finalCommand = '!points add {user} {prize}';
    if (commandType === 'short') {
      finalCommand = '!p @{user} {prize}';
    } else if (commandType === 'custom') {
      finalCommand = customCommand.trim() || '!points add {user} {prize}';
    }

    const cleanChannel = channel.trim().replace(/^#/, '');

    // Persistir de inmediato en localStorage del navegador
    saveToStorage({
      channel: cleanChannel,
      botUsername: botUsername.trim() || cleanChannel,
      oauthToken: oauthToken.trim(),
      commandType,
      customCommand,
      cooldownSeconds: Number(cooldownSeconds) || 300,
      selectedTheme,
      announceCountdown,
    });

    if (!socketRef.current) {
      setSaveStatus({
        type: 'error',
        message: 'No hay conexión con el backend (puerto 3000).',
      });
      return;
    }

    setSaveStatus({
      type: 'info',
      message: 'Guardando configuración permanentemente y conectando a Twitch...',
    });

    socketRef.current.emit(
      'set-twitch-credentials',
      {
        channel: cleanChannel,
        botUsername: botUsername.trim() || cleanChannel,
        oauthToken: oauthToken.trim(),
        pointsCommand: finalCommand,
        cooldownSeconds: Number(cooldownSeconds) || 300,
        theme: selectedTheme,
        announceCountdown,
      },
      (res: { success: boolean; message: string }) => {
        if (res?.success) {
          setSaveStatus({
            type: 'success',
            message: res.message || '¡Datos guardados con persistencia total y conexión establecida!',
          });
          setTimeout(() => setSaveStatus({ type: '', message: '' }), 4000);
        } else {
          setSaveStatus({
            type: 'error',
            message: res?.message || 'Error al conectar con Twitch. Verifica el canal o token.',
          });
        }
      },
    );
  };

  // Modificar tiempo de cooldown directamente
  const handleUpdateCooldown = (newSeconds: number) => {
    const val = Math.max(0, Math.round(newSeconds));
    setCooldownSeconds(val);
    saveToStorage({ cooldownSeconds: val });

    if (!socketRef.current) return;

    socketRef.current.emit(
      'set-cooldown',
      { cooldownSeconds: val },
      (res: { success: boolean; message: string }) => {
        if (res?.success) {
          setSaveStatus({
            type: 'success',
            message: `⏱️ ${res.message || `Cooldown cambiado a ${val} segundos`}`,
          });
          setTimeout(() => setSaveStatus({ type: '', message: '' }), 3500);
        } else {
          setSaveStatus({
            type: 'error',
            message: res?.message || 'Error al cambiar cooldown.',
          });
        }
      },
    );
  };

  // Seleccionar tema y guardarlo de inmediato
  const handleSelectTheme = (newTheme: SlotTheme) => {
    setSelectedTheme(newTheme);
    saveToStorage({ selectedTheme: newTheme });

    if (socketRef.current) {
      socketRef.current.emit('set-theme', { theme: newTheme });
    }
  };

  // Activar o desactivar cuenta regresiva en el chat
  const handleToggleCountdown = (enabled: boolean) => {
    setAnnounceCountdown(enabled);
    saveToStorage({ announceCountdown: enabled });

    if (socketRef.current) {
      socketRef.current.emit('set-countdown-announcement', { enabled });
    }
  };

  // Disparar prueba de ruleta
  const handleTriggerTest = (prize = 500, user = 'ViewerPrueba') => {
    if (!socketRef.current) return;
    socketRef.current.emit('test-spin', {
      username: user || 'ViewerPrueba',
      prize: Number(prize) || 500,
    });
  };

  // Resetear cooldown inmediatamente
  const handleResetCooldown = () => {
    if (!socketRef.current) return;
    socketRef.current.emit('reset-cooldown', {}, () => {
      setSaveStatus({
        type: 'success',
        message: '🔄 Cooldown reiniciado. ¡La ruleta puede jugarse de inmediato con !spin!',
      });
      setTimeout(() => setSaveStatus({ type: '', message: '' }), 3000);
    });
  };

  // Disparar cuenta regresiva de prueba en el chat de Twitch
  const handleTestCountdown = () => {
    if (!socketRef.current) return;
    socketRef.current.emit('test-countdown', {}, (res: { success: boolean; message: string }) => {
      setSaveStatus({
        type: res?.success ? 'success' : 'error',
        message: res?.message || 'Cuenta regresiva ejecutada en chat.',
      });
      setTimeout(() => setSaveStatus({ type: '', message: '' }), 4000);
    });
  };

  // URL para OBS (Limpia, transparente y sincronizada)
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const obsUrlString = `${baseUrl}/?overlay=true`;

  const handleCopyObsUrl = () => {
    navigator.clipboard.writeText(obsUrlString);
    setCopiedObsUrl(true);
    setTimeout(() => setCopiedObsUrl(false), 3000);
  };

  const isAuth = Boolean(twitchStatus?.isAuthenticated);
  const isSpinning = Boolean(twitchStatus?.isSpinActive);
  const currentThemeMeta = THEMES_LIST.find((t) => t.id === selectedTheme) || THEMES_LIST[0];

  return (
    <div className="streamer-dashboard-container">
      {/* Barra de cabecera superior */}
      <header className="dashboard-header">
        <div className="header-left">
          <span className="brand-badge">🎰</span>
          <div className="brand-titles">
            <h1>RUDZY FEST - CASINO & RULETA TWITCH</h1>
            <span className="brand-subtitle">Panel de Control Multijuegos & Overlays para OBS</span>
          </div>
        </div>

        <div className="header-right">
          <div className={`status-pill ${isConnected ? 'online' : 'offline'}`}>
            <span className="status-dot" />
            <span className="status-text">
              {isConnected ? 'Servidor Conectado' : 'Conectando al Servidor...'}
            </span>
          </div>

          <div className={`status-pill ${isAuth ? 'twitch-online' : 'twitch-offline'}`}>
            <span className="status-dot" />
            <span className="status-text">
              {twitchStatus?.channel
                ? isAuth
                  ? `🟢 Canal: #${twitchStatus.channel} (Autenticado)`
                  : `⚠️ Canal: #${twitchStatus.channel} (Sólo Lectura)`
                : 'Twitch: Desconectado'}
            </span>
          </div>
        </div>
      </header>

      {/* Barra de Navegación por Pestañas Claras (Preparada para nuevos juegos) */}
      <nav className="dashboard-tabs-nav">
        <button
          type="button"
          className={`tab-nav-btn ${activeTab === 'connect' ? 'active' : ''}`}
          onClick={() => setActiveTab('connect')}
        >
          <span className="tab-icon">🔌</span>
          <div className="tab-label-group">
            <span className="tab-title">1. Conexión Twitch</span>
            <span className="tab-sub">Canal, Bot y Token OAuth</span>
          </div>
        </button>

        <button
          type="button"
          className={`tab-nav-btn ${activeTab === 'rudzy-fest' ? 'active' : ''}`}
          onClick={() => setActiveTab('rudzy-fest')}
        >
          <span className="tab-icon">🎰</span>
          <div className="tab-label-group">
            <span className="tab-title">2. Ruleta Rudzy Fest</span>
            <span className="tab-sub">Tragaperras, OBS, Estilos & Cooldown</span>
          </div>
        </button>

        <button
          type="button"
          className={`tab-nav-btn ${activeTab === 'more-games' ? 'active' : ''}`}
          onClick={() => setActiveTab('more-games')}
        >
          <span className="tab-icon">✨</span>
          <div className="tab-label-group">
            <span className="tab-title">3. Próximos Juegos (+)</span>
            <span className="tab-sub">Catálogo en desarrollo</span>
          </div>
        </button>
      </nav>

      {/* Banner de alerta si la ruleta está girando en OBS */}
      {isSpinning && (
        <div className="banner-spinning">
          <span className="spin-pulse" />
          <span>¡RULETA GIRANDO EN OBS EN ESTE MOMENTO!</span>
        </div>
      )}

      {/* Alerta flotante de guardado */}
      {saveStatus.message && (
        <div className={`save-status-toast ${saveStatus.type}`}>
          {saveStatus.message}
        </div>
      )}

      {/* Contenedor Principal de la Pestaña Activa */}
      <main className="tab-content-wrapper">
        {/* =========================================================================
            PESTAÑA 1: CONEXIÓN & INICIO (Configuración de Twitch)
            ========================================================================= */}
        {activeTab === 'connect' && (
          <div className="tab-pane-container connect-pane">
            {/* Banner de Estado de Autenticación */}
            {!isAuth && (
              <div className="auth-alert-card">
                <div className="auth-alert-icon">⚠️</div>
                <div className="auth-alert-body">
                  <h4 className="auth-alert-title">
                    {twitchStatus?.authError
                      ? 'Token OAuth Vencido o Inválido (Modo Sólo Lectura)'
                      : 'Conectado en Modo Sólo Lectura (Sin Entrega de Puntos)'}
                  </h4>
                  <p className="auth-alert-desc">
                    En este modo la ruleta visual funciona en OBS cuando un espectador usa <code>!spin</code>, pero <b>no puede enviar <code>!points add</code> para entregar los puntos ni mandar los avisos de cooldown en el chat</b>.
                  </p>
                  <p className="auth-alert-solution">
                    👉 <b>Solución rápida (tarda 10 segundos):</b> Genera un token nuevo y pégalo abajo:
                  </p>
                  <div className="auth-alert-actions">
                    <a
                      href="https://twitchapps.com/tmi/"
                      target="_blank"
                      rel="noreferrer"
                      className="btn-token-action primary"
                    >
                      🔑 1. Generar Token en TwitchApps.com (Recomendado - Oficial e Indefinido)
                    </a>
                    <a
                      href="https://twitchtokengenerator.com"
                      target="_blank"
                      rel="noreferrer"
                      className="btn-token-action secondary"
                    >
                      🔗 2. TwitchTokenGenerator.com
                    </a>
                  </div>
                </div>
              </div>
            )}

            {isAuth && (
              <div className="auth-success-card">
                <div className="auth-success-icon">🟢</div>
                <div className="auth-success-body">
                  <h4>¡Conexión Totalmente Autenticada!</h4>
                  <p>
                    El bot está conectado como <b>@{botUsername || channel}</b> en <b>#{channel}</b>.
                    Entregará puntos automáticamente con <code>!points add</code> tras cada tirada y enviará los avisos en el chat.
                  </p>
                </div>
              </div>
            )}

            {/* Tarjeta de Formulario */}
            <div className="dash-card card-credentials">
              <div className="card-header">
                <h2>⚙️ Datos de Conexión a Twitch</h2>
                <p className="card-desc">
                  Configura tu canal y tu token OAuth. Los datos se guardan de forma permanente en tu equipo aunque reinicies o apagues el ordenador.
                </p>
              </div>

              <form onSubmit={handleSave} className="credentials-form">
                {/* TWITCH_CHANNEL */}
                <div className="form-group">
                  <label htmlFor="twitch-channel">
                    Canal de Twitch (TWITCH_CHANNEL):
                    <span className="label-required">*</span>
                  </label>
                  <div className="input-prefix-wrapper">
                    <span className="input-prefix">twitch.tv/</span>
                    <input
                      id="twitch-channel"
                      type="text"
                      placeholder="TuNombreDeCanal"
                      value={channel}
                      onChange={(e) => setChannel(e.target.value)}
                      required
                      className="form-input"
                    />
                  </div>
                  <span className="input-help">
                    Es el canal donde se activará la ruleta con el comando <code>!spin</code> (o canjes de BotRix).
                  </span>
                </div>

                {/* TWITCH_BOT_USERNAME */}
                <div className="form-group">
                  <label htmlFor="bot-username">
                    Usuario del Bot / Streamer (TWITCH_BOT_USERNAME):
                  </label>
                  <div className="input-prefix-wrapper">
                    <span className="input-prefix">@</span>
                    <input
                      id="bot-username"
                      type="text"
                      placeholder="TuCanal (o bot autorizado)"
                      value={botUsername}
                      onChange={(e) => setBotUsername(e.target.value)}
                      className="form-input"
                    />
                  </div>
                  <span className="input-help">
                    Cuenta desde la que se enviará el comando de entrega de puntos al ganador en el chat.
                  </span>
                </div>

                {/* TWITCH_OAUTH_TOKEN */}
                <div className="form-group">
                  <div className="token-label-row">
                    <label htmlFor="oauth-token">
                      Token OAuth de Twitch (TWITCH_OAUTH_TOKEN):
                    </label>
                    <a
                      href="https://twitchapps.com/tmi/"
                      target="_blank"
                      rel="noreferrer"
                      className="btn-quick-token"
                    >
                      🔑 Generar Token en 1 Clic
                    </a>
                  </div>
                  <div className="input-password-wrapper">
                    <input
                      id="oauth-token"
                      type={showToken ? 'text' : 'password'}
                      placeholder="oauth:xxxxxxxxxxxxxxxxxxxx"
                      value={oauthToken}
                      onChange={(e) => setOauthToken(e.target.value)}
                      className="form-input"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="btn-toggle-show"
                      title={showToken ? 'Ocultar token' : 'Mostrar token'}
                    >
                      {showToken ? '👁️ Ocultar' : '🔒 Ver'}
                    </button>
                  </div>
                  <span className="input-help">
                    Permite que el bot pueda escribir en tu chat para premiar con puntos y avisar del cooldown.
                  </span>
                </div>

                {/* POINTS_COMMAND */}
                <div className="form-group">
                  <label>Comando para Entregar Puntos al Ganador:</label>
                  <div className="radio-options">
                    <label className={`radio-card ${commandType === 'botrix' ? 'selected' : ''}`}>
                      <input
                        type="radio"
                        name="cmd-type"
                        value="botrix"
                        checked={commandType === 'botrix'}
                        onChange={() => setCommandType('botrix')}
                      />
                      <div className="radio-content">
                        <strong>BotRix / StreamElements (Recomendado)</strong>
                        <code>!points add &#123;user&#125; &#123;prize&#125;</code>
                      </div>
                    </label>

                    <label className={`radio-card ${commandType === 'short' ? 'selected' : ''}`}>
                      <input
                        type="radio"
                        name="cmd-type"
                        value="short"
                        checked={commandType === 'short'}
                        onChange={() => setCommandType('short')}
                      />
                      <div className="radio-content">
                        <strong>Comando Corto (!p)</strong>
                        <code>!p @&#123;user&#125; &#123;prize&#125;</code>
                      </div>
                    </label>

                    <label className={`radio-card ${commandType === 'custom' ? 'selected' : ''}`}>
                      <input
                        type="radio"
                        name="cmd-type"
                        value="custom"
                        checked={commandType === 'custom'}
                        onChange={() => setCommandType('custom')}
                      />
                      <div className="radio-content">
                        <strong>Personalizado</strong>
                        <span>Define tu propio comando</span>
                      </div>
                    </label>
                  </div>

                  {commandType === 'custom' && (
                    <div className="custom-cmd-input">
                      <input
                        type="text"
                        placeholder="Ej: !addpoints {user} {prize}"
                        value={customCommand}
                        onChange={(e) => setCustomCommand(e.target.value)}
                        className="form-input"
                      />
                      <span className="input-help">
                        Usa <code>&#123;user&#125;</code> para el ganador y <code>&#123;prize&#125;</code> para la cantidad de puntos.
                      </span>
                    </div>
                  )}
                </div>

                {/* Botones de Acción */}
                <div className="form-actions-row">
                  <button type="submit" className="btn-save-credentials">
                    💾 Guardar y Conectar a Twitch
                  </button>

                  <button
                    type="button"
                    className="btn-next-tab"
                    onClick={() => setActiveTab('rudzy-fest')}
                  >
                    👉 Ir a la Ruleta Rudzy Fest (Paso 2)
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* =========================================================================
            PESTAÑA 2: RULETA RUDZY FEST (Tragaperras, OBS, Estilos & Cooldown Integrados)
            ========================================================================= */}
        {activeTab === 'rudzy-fest' && (
          <div className="tab-pane-container slot-pane">
            {/* Card de OBS Overlay */}
            <div className="dash-card card-obs-link">
              <div className="obs-header">
                <div className="obs-title-group">
                  <span className="obs-badge">🎬 OBS Studio</span>
                  <h3>URL para tu Fuente de Navegador en OBS</h3>
                </div>
                <div className="obs-action-buttons">
                  <button
                    type="button"
                    onClick={handleCopyObsUrl}
                    className={`btn-copy-obs ${copiedObsUrl ? 'copied' : ''}`}
                  >
                    {copiedObsUrl ? '✅ ¡URL Copiada!' : '📋 Copiar URL para OBS'}
                  </button>
                  <a
                    href={obsUrlString}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-open-obs-preview"
                  >
                    🔗 Abrir Ruleta en Pestaña Limpia
                  </a>
                </div>
              </div>

              <div className="obs-input-row">
                <input
                  type="text"
                  readOnly
                  value={obsUrlString}
                  className="obs-url-input"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
              </div>

              <div className="obs-guide-pills">
                <span>Resolución en OBS: <b>1920 x 1080</b></span>
                <span>•</span>
                <span>Fondo: <b>100% Transparente</b></span>
                <span>•</span>
                <span>Marcar: <b>Controlar audio vía OBS</b></span>
              </div>
            </div>

            {/* Barra Compacta de Selector de Estilo (Dropdown Select) & Pruebas */}
            <div className="dash-card card-style-bar">
              <div className="style-bar-content">
                {/* Selector Dropdown de Estilo Visual */}
                <div className="theme-dropdown-group">
                  <label htmlFor="theme-select-picker" className="theme-dropdown-label">
                    🎨 Estilo Visual de la Ruleta:
                  </label>
                  <div className="theme-dropdown-control">
                    <select
                      id="theme-select-picker"
                      value={selectedTheme}
                      onChange={(e) => handleSelectTheme(e.target.value as SlotTheme)}
                      className="theme-dropdown-select"
                    >
                      {THEMES_LIST.map((theme) => (
                        <option key={theme.id} value={theme.id}>
                          {theme.icon} {theme.name} — {theme.tag}
                        </option>
                      ))}
                    </select>
                    <div
                      className="theme-current-badge"
                      style={{ background: currentThemeMeta.colorPreview }}
                      title={currentThemeMeta.subtitle}
                    >
                      <span>{currentThemeMeta.icon}</span>
                      <strong>{currentThemeMeta.name}</strong>
                    </div>
                  </div>
                </div>

                {/* Botones de Prueba Rápida de Tiradas */}
                <div className="quick-test-inline">
                  <span className="test-bar-label">Probar Tirada:</span>
                  <div className="test-pills-row">
                    <button
                      type="button"
                      className="btn-prize-pill"
                      onClick={() => handleTriggerTest(50, 'Viewer50')}
                    >
                      🎰 50 pts
                    </button>
                    <button
                      type="button"
                      className="btn-prize-pill"
                      onClick={() => handleTriggerTest(500, 'Viewer500')}
                    >
                      ⭐ 500 pts
                    </button>
                    <button
                      type="button"
                      className="btn-prize-pill"
                      onClick={() => handleTriggerTest(2500, 'Viewer2500')}
                    >
                      💎 2,500 pts
                    </button>
                    <button
                      type="button"
                      className="btn-prize-pill jackpot-pill"
                      onClick={() => handleTriggerTest(100000, 'JACKPOT_WINNER')}
                    >
                      🔥 ¡100,000 pts!
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Escenario de la Tragaperras en Vivo */}
            <div className="dash-card card-live-machine">
              <div className="stage-header-bar">
                <div className="stage-title">
                  <span className="stage-dot" />
                  <h4>Escenario en Vivo: Rudzy Fest ({currentThemeMeta.name})</h4>
                </div>
                <span className="stage-subtitle-hint">{currentThemeMeta.subtitle}</span>
              </div>

              <div className="stage-canvas-wrapper">
                <SlotMachine theme={selectedTheme} />
              </div>
            </div>

            {/* =========================================================================
                SECCIÓN DE COOLDOWN & AVISOS EN CHAT (Integrada en la misma pestaña)
                ========================================================================= */}
            <div className="dash-card card-cooldown-control">
              <div className="cooldown-card-header">
                <div className="cooldown-title-group">
                  <span className="cooldown-icon">⏱️</span>
                  <div>
                    <h3 className="cooldown-title">Tiempo de Espera (Cooldown) & Avisos en Chat</h3>
                    <p className="cooldown-desc">
                      Define cuánto tiempo debe transcurrir antes de que otro espectador pueda volver a activar la ruleta con <code>!spin</code>.
                    </p>
                  </div>
                </div>

                <div className="cooldown-active-pill">
                  Actual: <b>{cooldownSeconds}s</b> ({Math.floor(cooldownSeconds / 60)}m {cooldownSeconds % 60}s)
                </div>
              </div>

              {/* Presets Rápidos */}
              <div className="cooldown-presets-section">
                <span className="presets-label">Tiempos rápidos:</span>
                <div className="cooldown-presets-grid">
                  <button
                    type="button"
                    className={`preset-btn ${cooldownSeconds === 10 ? 'active' : ''}`}
                    onClick={() => handleUpdateCooldown(10)}
                  >
                    ⚡ 10s (Pruebas)
                  </button>
                  <button
                    type="button"
                    className={`preset-btn ${cooldownSeconds === 30 ? 'active' : ''}`}
                    onClick={() => handleUpdateCooldown(30)}
                  >
                    30 segundos
                  </button>
                  <button
                    type="button"
                    className={`preset-btn ${cooldownSeconds === 60 ? 'active' : ''}`}
                    onClick={() => handleUpdateCooldown(60)}
                  >
                    1 minuto
                  </button>
                  <button
                    type="button"
                    className={`preset-btn ${cooldownSeconds === 120 ? 'active' : ''}`}
                    onClick={() => handleUpdateCooldown(120)}
                  >
                    2 minutos
                  </button>
                  <button
                    type="button"
                    className={`preset-btn ${cooldownSeconds === 300 ? 'active' : ''}`}
                    onClick={() => handleUpdateCooldown(300)}
                  >
                    🎯 5 minutos (BotRix)
                  </button>
                  <button
                    type="button"
                    className={`preset-btn ${cooldownSeconds === 600 ? 'active' : ''}`}
                    onClick={() => handleUpdateCooldown(600)}
                  >
                    10 minutos
                  </button>
                </div>
              </div>

              {/* Ajuste personalizado */}
              <div className="cooldown-custom-row">
                <span className="custom-cd-label">Ajuste manual en segundos:</span>
                <div className="cd-stepper-wrap">
                  <button
                    type="button"
                    className="btn-cd-step"
                    onClick={() => handleUpdateCooldown(Math.max(5, cooldownSeconds - 10))}
                  >
                    -10s
                  </button>
                  <input
                    type="number"
                    min="1"
                    max="86400"
                    value={cooldownSeconds}
                    onChange={(e) => setCooldownSeconds(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="input-cd-custom"
                  />
                  <span className="cd-unit">seg</span>
                  <button
                    type="button"
                    className="btn-cd-step"
                    onClick={() => handleUpdateCooldown(cooldownSeconds + 10)}
                  >
                    +10s
                  </button>
                  <button
                    type="button"
                    className="btn-apply-cd"
                    onClick={() => handleUpdateCooldown(cooldownSeconds)}
                  >
                    Aplicar
                  </button>
                </div>
              </div>

              {/* Toggle de Avisos de Cuenta Regresiva */}
              <div className="countdown-toggle-row">
                <label className="toggle-checkbox-label">
                  <input
                    type="checkbox"
                    checked={announceCountdown}
                    onChange={(e) => handleToggleCountdown(e.target.checked)}
                  />
                  <span className="toggle-checkbox-text">
                    📢 Enviar avisos de cuenta regresiva en el chat de Twitch (3, 2, 1... ¡RULETA YA DISPONIBLE!)
                  </span>
                </label>
                <span className="toggle-checkbox-hint">
                  Tu cuenta de streamer enviará automáticamente el conteo al chat de Twitch cuando el cooldown esté por terminar para que los viewers se preparen para el próximo <code>!spin</code>.
                </span>
              </div>

              {/* Acciones de prueba y reseteo */}
              <div className="cooldown-actions-group">
                <button
                  type="button"
                  onClick={handleTestCountdown}
                  className="btn-test-countdown"
                  title="Envía una simulación de los avisos 3, 2, 1 al chat"
                >
                  📢 Probar Conteo en el Chat Ahora (3, 2, 1...)
                </button>

                <button
                  type="button"
                  onClick={handleResetCooldown}
                  className="btn-reset-now"
                >
                  🔄 Resetear Cooldown Inmediatamente
                </button>
              </div>
            </div>

            {/* Tarjeta de Protección Anti-Campeo (Máximo 2 tiradas consecutivas) */}
            <div className="dash-card card-anticamp">
              <div className="anticamp-header-bar">
                <div className="anticamp-title-group">
                  <span className="anticamp-icon">🛡️</span>
                  <div>
                    <h3 className="anticamp-title">Protección Anti-Campeo (Anti-Ratas 🐀)</h3>
                    <span className="anticamp-sub">Límite estricto: Máximo {maxConsecutive} tiradas seguidas por usuario</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleResetConsecutiveSpins}
                  className="btn-reset-anticamp"
                  title="Permite que cualquier usuario vuelva a tirar inmediatamente"
                >
                  🔄 Resetear Racha
                </button>
              </div>

              <div className="anticamp-status-box">
                <div className="anticamp-info-col">
                  <span className="anticamp-label">Usuario en Racha Consecutiva:</span>
                  {consecutiveUser ? (
                    <div className="anticamp-player-badge">
                      <span className="player-avatar-icon">👤</span>
                      <span className="player-name">@{consecutiveUser}</span>
                      <span className={`player-count-badge ${consecutiveCount >= maxConsecutive ? 'badge-blocked' : 'badge-active'}`}>
                        {consecutiveCount} / {maxConsecutive} tiradas {consecutiveCount >= maxConsecutive ? '⛔ BLOQUEADO' : '✅ En juego'}
                      </span>
                    </div>
                  ) : (
                    <div className="anticamp-player-badge badge-free">
                      <span className="player-avatar-icon">✨</span>
                      <span className="player-name">Nadie en racha (Ruleta libre para cualquiera)</span>
                      <span className="player-count-badge badge-active">0 / {maxConsecutive}</span>
                    </div>
                  )}
                </div>

                <div className="anticamp-rule-note">
                  <p>
                    🔒 <b>Regla automática:</b> Si un viewer tira <b>{maxConsecutive} veces seguidas</b>, la 3ª tirada se le bloqueará automáticamente hasta que <b>otro viewer diferente</b> juegue. En cuanto otro usuario tire, se le restablece su turno al primero.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            PESTAÑA 3: PRÓXIMOS JUEGOS (+) (Arquitectura Multijuegos a Futuro)
            ========================================================================= */}
        {activeTab === 'more-games' && (
          <div className="tab-pane-container games-pane">
            <div className="dash-card card-more-games-intro">
              <div className="more-games-header">
                <span className="future-badge">🚀 Próximamente</span>
                <h2>Catálogo de Minijuegos para tu Stream</h2>
                <p>
                  Esta arquitectura modular permite integrar nuevos juegos interactivos que tus espectadores podrán canjear con puntos de canal o BotRix.
                </p>
              </div>

              <div className="games-preview-grid">
                {/* Juego 1: Coinflip */}
                <div className="game-teaser-card">
                  <div className="game-teaser-icon">🪙</div>
                  <div className="game-teaser-body">
                    <h3>Lanzamiento de Moneda (Coinflip)</h3>
                    <p>
                      Doble o nada animado en pantalla para duelos entre viewers o apuestas rápidas con el streamer.
                    </p>
                    <span className="game-status-badge">En desarrollo</span>
                  </div>
                </div>

                {/* Juego 2: Ruleta de la Fortuna */}
                <div className="game-teaser-card">
                  <div className="game-teaser-icon">🎡</div>
                  <div className="game-teaser-body">
                    <h3>La Rueda de la Fortuna (Lucky Wheel)</h3>
                    <p>
                      Ruleta circular gigante personalizable con retos de stream, multiplicadores y castigos divertidos.
                    </p>
                    <span className="game-status-badge">En desarrollo</span>
                  </div>
                </div>

                {/* Juego 3: Cofre del Tesoro */}
                <div className="game-teaser-card">
                  <div className="game-teaser-icon">📦</div>
                  <div className="game-teaser-body">
                    <h3>Cajas Sorpresa (Mystery Box)</h3>
                    <p>
                      Apertura de cofres animados en 3D con cartas y recompensas coleccionables para tus suscriptores.
                    </p>
                    <span className="game-status-badge">Planeado</span>
                  </div>
                </div>

                {/* Juego 4: Blackjack Twitch */}
                <div className="game-teaser-card">
                  <div className="game-teaser-icon">🃏</div>
                  <div className="game-teaser-body">
                    <h3>Blackjack 21 Twitch</h3>
                    <p>
                      Mesa interactiva de cartas contra la casa controlada directamente por comandos del chat.
                    </p>
                    <span className="game-status-badge">Planeado</span>
                  </div>
                </div>
              </div>

              <div className="future-note-box">
                <span>💡 Cada nuevo juego que se agregue tendrá su propia URL limpia para OBS y sus propios comandos de BotRix independientes.</span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default StreamerDashboard;
