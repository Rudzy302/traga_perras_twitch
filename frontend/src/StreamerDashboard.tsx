import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import SlotMachine, { SlotTheme, THEMES_LIST } from './SlotMachine';

export interface TwitchStatusPayload {
  channel: string;
  botUsername: string;
  oauthToken?: string;
  isAuthenticated: boolean;
  isSpinActive: boolean;
  cooldownSeconds: number;
  pointsCommand?: string;
  theme?: SlotTheme;
  announceCountdown?: boolean;
  isConfigured?: boolean;
}

const LOCAL_STORAGE_KEY = 'casino_streamer_config_v1';

export const StreamerDashboard: React.FC = () => {
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

  // Formulario de configuración (iniciado con lo guardado en el navegador)
  const [channel, setChannel] = useState<string>(stored?.channel || 'Rudzy_tv');
  const [botUsername, setBotUsername] = useState<string>(stored?.botUsername || 'Rudzy_tv');
  const [oauthToken, setOauthToken] = useState<string>(stored?.oauthToken || '');
  const [showToken, setShowToken] = useState<boolean>(false);
  const [commandType, setCommandType] = useState<string>(stored?.commandType || 'botrix');
  const [customCommand, setCustomCommand] = useState<string>(stored?.customCommand || '!points add {user} {prize}');
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(stored?.cooldownSeconds ?? 300);

  // Tema de la máquina y aviso de cuenta regresiva
  const [selectedTheme, setSelectedTheme] = useState<SlotTheme>(stored?.selectedTheme || 'carnival-green');
  const [announceCountdown, setAnnounceCountdown] = useState<boolean>(stored?.announceCountdown ?? false);

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

      if (status.pointsCommand) {
        if (status.pointsCommand.startsWith('!points add')) {
          setCommandType('botrix');
        } else if (status.pointsCommand.startsWith('!p')) {
          setCommandType('short');
        } else {
          setCommandType('custom');
          setCustomCommand(status.pointsCommand);
        }
      }

      // Sincronizar en localStorage lo que el backend confirmó
      saveToStorage({
        channel: status.channel,
        botUsername: status.botUsername,
        oauthToken: status.oauthToken,
        cooldownSeconds: status.cooldownSeconds,
        selectedTheme: status.theme,
        announceCountdown: status.announceCountdown,
      });

      // Si el backend viene sin token pero localStorage tiene credenciales guardadas, restaurar automáticamente
      const storedData = getStoredConfig();
      if (storedData?.oauthToken && (!status.oauthToken || !status.isAuthenticated)) {
        s.emit('set-twitch-credentials', {
          channel: storedData.channel || status.channel || 'Rudzy_tv',
          botUsername: storedData.botUsername || status.botUsername || 'Rudzy_tv',
          oauthToken: storedData.oauthToken,
          pointsCommand: storedData.customCommand || status.pointsCommand || '!points add {user} {prize}',
          cooldownSeconds: storedData.cooldownSeconds ?? status.cooldownSeconds ?? 300,
          theme: storedData.selectedTheme || status.theme || 'carnival-green',
          announceCountdown: storedData.announceCountdown ?? false,
        });
      }
    });

    return () => {
      s.disconnect();
    };
  }, []);

  // Guardar configuración (.env y casino_config.json)
  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socketRef.current) return;

    const cleanChannel = channel.trim().replace(/^#/, '');
    if (!cleanChannel) {
      setSaveStatus({
        type: 'error',
        message: 'Por favor ingresa TWITCH_CHANNEL (el nombre de tu canal).',
      });
      return;
    }

    let finalCommand = '!points add {user} {prize}';
    if (commandType === 'botrix') {
      finalCommand = '!points add {user} {prize}';
    } else if (commandType === 'short') {
      finalCommand = '!p @{user} {prize}';
    } else if (commandType === 'custom') {
      finalCommand = customCommand.trim() || '!points add {user} {prize}';
    }

    // Guardar inmediatamente en localStorage
    saveToStorage({
      channel: cleanChannel,
      botUsername: botUsername.trim() || cleanChannel,
      oauthToken: oauthToken.trim(),
      commandType,
      customCommand: finalCommand,
      cooldownSeconds: Number(cooldownSeconds) || 300,
      selectedTheme,
      announceCountdown,
    });

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

  // URL para OBS
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const obsUrlString = `${baseUrl}/?overlay=true&theme=${selectedTheme}`;

  const handleCopyObsUrl = () => {
    navigator.clipboard.writeText(obsUrlString);
    setCopiedObsUrl(true);
    setTimeout(() => setCopiedObsUrl(false), 3000);
  };

  const isAuth = twitchStatus?.isAuthenticated;
  const isSpinning = twitchStatus?.isSpinActive;

  return (
    <div className="streamer-dashboard-container">
      {/* Barra de cabecera */}
      <header className="dashboard-header">
        <div className="header-left">
          <span className="brand-badge">🎰</span>
          <div className="brand-titles">
            <h1>RUDZY FEST - RULETA TWITCH</h1>
            <span className="brand-subtitle">Panel de Control & Configuración OBS</span>
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
                  ? `Canal: #${twitchStatus.channel} (Autenticado)`
                  : `Canal: #${twitchStatus.channel} (Sólo Lectura)`
                : 'Twitch: Desconectado'}
            </span>
          </div>
        </div>
      </header>

      {/* Banner de alerta de estado de la tirada */}
      {isSpinning && (
        <div className="banner-spinning">
          <span className="spin-pulse" />
          <span>¡RULETA GIRANDO EN OBS EN ESTE MOMENTO!</span>
        </div>
      )}

      {/* Alerta de guardado */}
      {saveStatus.message && (
        <div className={`save-status-toast ${saveStatus.type}`}>
          {saveStatus.message}
        </div>
      )}

      {/* Contenido principal */}
      <main className="dashboard-main-content">
        {/* =========================================================================
            COLUMNA IZQUIERDA: CONFIGURACIÓN (.ENV)
            ========================================================================= */}
        <section className="column-config">
          <div className="dash-card card-credentials">
            <div className="card-header">
              <h2>⚙️ Configuración de Twitch</h2>
              <p className="card-desc">
                Configura tu canal para que la ruleta reconozca a tus espectadores y entregue puntos. Se guarda de forma permanente aunque apagues el PC.
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
                  Es el canal donde se activará la ruleta con el comando <code>!spin</code> (o <code>!ruleta</code>).
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
                  Cuenta desde la que se enviará el comando de recompensa al ganador.
                </span>
              </div>

              {/* TWITCH_OAUTH_TOKEN */}
              <div className="form-group">
                <label htmlFor="oauth-token">
                  Token OAuth de Twitch (TWITCH_OAUTH_TOKEN):
                </label>
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

                <div className="token-helper-box">
                  <span className="helper-title">¿Cómo encontrar tu Token OAuth en 10 segundos?</span>
                  <p>
                    1. Entra a la web oficial y segura de Twitch Token Generator.
                    <br />
                    2. Inicia sesión con la cuenta de <b>{botUsername || channel || 'tu canal'}</b>.
                    <br />
                    3. Copia el token que empieza por <code>oauth:...</code> y pégalo arriba.
                  </p>
                  <a
                    href="https://twitchtokengenerator.com"
                    target="_blank"
                    rel="noreferrer"
                    className="btn-open-token-gen"
                  >
                    🔗 Encontrar mi Token OAuth en TwitchTokenGenerator.com
                  </a>
                </div>
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
                      <strong>BotRix / StreamElements</strong>
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
                      Usa <code>&#123;user&#125;</code> para el nombre del ganador y <code>&#123;prize&#125;</code> para la cantidad de puntos.
                    </span>
                  </div>
                )}
              </div>

              {/* Botón de Guardado */}
              <div className="form-actions">
                <button type="submit" className="btn-save-credentials">
                  💾 Guardar y Aplicar Cambios
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* =========================================================================
            COLUMNA DERECHA: OBS Y PRUEBAS EN VIVO
            ========================================================================= */}
        <section className="column-live">
          {/* Card de OBS Overlay */}
          <div className="dash-card card-obs-link">
            <div className="obs-header">
              <span className="obs-badge">🎬 OBS Studio</span>
              <h3>URL para Pegar en tu OBS</h3>
            </div>
            <p className="obs-desc">
              Esta URL genera la ruleta transparente lista para integrarse como <b>Navegador (Browser Source)</b> en tu OBS Studio. Solo se mostrará cuando un espectador juegue con <code>!spin</code>.
            </p>

            <div className="obs-input-row">
              <input
                type="text"
                readOnly
                value={obsUrlString}
                className="obs-url-input"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                type="button"
                onClick={handleCopyObsUrl}
                className={`btn-copy-obs ${copiedObsUrl ? 'copied' : ''}`}
              >
                {copiedObsUrl ? '✅ ¡Copiada!' : '📋 Copiar URL'}
              </button>
              <a
                href={obsUrlString}
                target="_blank"
                rel="noreferrer"
                className="btn-open-obs-preview"
                title="Abrir ruleta limpia en pestaña nueva para verificar transparencia"
              >
                🔗 Ver Ruleta Limpia
              </a>
            </div>

            <div className="obs-guide-pills">
              <span>Resolución sugerida: <b>1920 x 1080</b></span>
              <span>•</span>
              <span>Marcar: <b>Controlar audio vía OBS</b></span>
              <span>•</span>
              <span>Fondo: <b>100% Transparente</b></span>
            </div>
          </div>

          {/* Configuración de Cooldown */}
          <div className="dash-card card-cooldown">
            <div className="cooldown-header">
              <span className="cooldown-badge">⏱️ Cooldown de Tiradas</span>
              <h3>Tiempo de Espera entre Ruletas</h3>
            </div>
            <p className="cooldown-desc">
              Define cuánto tiempo debe transcurrir entre cada ruleta. Ajusta los minutos o segundos a tu gusto:
            </p>

            {/* Presets rápidos */}
            <div className="cooldown-presets">
              <span className="presets-label">Tiempos rápidos:</span>
              <button
                type="button"
                className={`btn-cd-preset ${cooldownSeconds === 10 ? 'active' : ''}`}
                onClick={() => handleUpdateCooldown(10)}
              >
                ⚡ 10s (Pruebas)
              </button>
              <button
                type="button"
                className={`btn-cd-preset ${cooldownSeconds === 30 ? 'active' : ''}`}
                onClick={() => handleUpdateCooldown(30)}
              >
                30 seg
              </button>
              <button
                type="button"
                className={`btn-cd-preset ${cooldownSeconds === 60 ? 'active' : ''}`}
                onClick={() => handleUpdateCooldown(60)}
              >
                1 min
              </button>
              <button
                type="button"
                className={`btn-cd-preset ${cooldownSeconds === 120 ? 'active' : ''}`}
                onClick={() => handleUpdateCooldown(120)}
              >
                2 min
              </button>
              <button
                type="button"
                className={`btn-cd-preset ${cooldownSeconds === 300 ? 'active' : ''}`}
                onClick={() => handleUpdateCooldown(300)}
              >
                🎯 5 min (BotRix)
              </button>
              <button
                type="button"
                className={`btn-cd-preset ${cooldownSeconds === 600 ? 'active' : ''}`}
                onClick={() => handleUpdateCooldown(600)}
              >
                10 min
              </button>
            </div>

            {/* Selector manual en segundos */}
            <div className="cooldown-adjuster">
              <div className="cooldown-current-display">
                <span className="cd-label">Tiempo configurado:</span>
                <span className="cd-val-highlight">
                  {Math.floor(cooldownSeconds / 60)} min {cooldownSeconds % 60} seg ({cooldownSeconds}s)
                </span>
              </div>

              <div className="cooldown-inputs-row">
                <div className="cd-stepper">
                  <button
                    type="button"
                    className="btn-step"
                    onClick={() => handleUpdateCooldown(Math.max(5, cooldownSeconds - 10))}
                    title="Restar 10 segundos"
                  >
                    -10s
                  </button>
                  <input
                    type="number"
                    min="0"
                    max="7200"
                    value={cooldownSeconds}
                    onChange={(e) => setCooldownSeconds(Number(e.target.value))}
                    className="input-cd-custom"
                  />
                  <span className="cd-unit">seg</span>
                  <button
                    type="button"
                    className="btn-step"
                    onClick={() => handleUpdateCooldown(cooldownSeconds + 10)}
                    title="Sumar 10 segundos"
                  >
                    +10s
                  </button>
                </div>

                <button
                  type="button"
                  className="btn-apply-cd"
                  onClick={() => handleUpdateCooldown(cooldownSeconds)}
                >
                  💾 Aplicar Cooldown
                </button>
              </div>

              {/* Checkbox para activar/desactivar avisos de cuenta regresiva en el chat */}
              <div className="countdown-toggle-row">
                <label className="toggle-checkbox-label">
                  <input
                    type="checkbox"
                    checked={announceCountdown}
                    onChange={(e) => handleToggleCountdown(e.target.checked)}
                  />
                  <span className="toggle-checkbox-text">
                    📢 Avisar cuenta regresiva en el chat de Twitch (3, 2, 1... ¡RULETA YA DISPONIBLE!)
                  </span>
                </label>
                <span className="toggle-checkbox-hint">
                  Desactivado por defecto para mantener el chat limpio y no ser invasivo.
                </span>
              </div>

              <div className="cooldown-actions-group">
                <button
                  type="button"
                  className="btn-test-countdown"
                  onClick={handleTestCountdown}
                  title="Prueba el envío de la cuenta regresiva (3, 2, 1... ¡¡¡¡¡RULETA YA DISPONIBLE!!!!!) en tu chat de Twitch"
                >
                  📢 Probar Aviso en Chat (3, 2, 1...)
                </button>
                <button
                  type="button"
                  className="btn-reset-now"
                  onClick={handleResetCooldown}
                  title="Reiniciar el tiempo de espera ahora mismo"
                >
                  🔄 Resetear Cooldown Ahora
                </button>
              </div>
            </div>
          </div>

          {/* Selector de Tema de la Tragaperras */}
          <div className="dash-card card-theme-picker">
            <div className="theme-picker-header">
              <div className="theme-header-left">
                <span className="theme-picker-title">🎨 Estilos para "Rudzy Fest" (8 Temas Únicos):</span>
                <p className="theme-picker-subtitle">
                  Elige el diseño que prefieras. Cada tema modifica su estética, molduras, bombillas y colores.
                </p>
              </div>
              <span className="theme-active-tag">
                Tema activo: <b>{THEMES_LIST.find((t) => t.id === selectedTheme)?.name || selectedTheme}</b>
              </span>
            </div>

            <div className="theme-options-grid grid-8-themes">
              {THEMES_LIST.map((th) => (
                <button
                  key={th.id}
                  type="button"
                  className={`theme-card-btn theme-btn-${th.id} ${selectedTheme === th.id ? 'active' : ''}`}
                  onClick={() => handleSelectTheme(th.id)}
                >
                  <div className="theme-badge-row">
                    <span className="theme-icon">{th.icon}</span>
                    <span className="theme-tag-pill">{th.tag}</span>
                    {selectedTheme === th.id && <span className="theme-checkmark">✓</span>}
                  </div>
                  <div className="theme-card-info">
                    <strong>{th.name}</strong>
                    <span>{th.subtitle}</span>
                  </div>
                  <div className="theme-color-preview-bar" style={{ background: th.colorPreview }} />
                </button>
              ))}
            </div>
          </div>

          {/* Vista Previa en Vivo y Pruebas */}
          <div className="dash-card card-live-machine">
            <div className="stage-header-bar">
              <span className="stage-title">
                🔴 Vista en Vivo de la Máquina (Se activa en tu stream con <code>!spin</code> o <code>!ruleta</code>)
              </span>

              <div className="stage-quick-actions">
                <button
                  type="button"
                  className="btn-quick-spin"
                  onClick={() => handleTriggerTest(500, 'ViewerPrueba')}
                >
                  🎰 Probar Tirada
                </button>
                <button
                  type="button"
                  className="btn-quick-reset"
                  onClick={handleResetCooldown}
                >
                  ⏱️ Reset Cooldown
                </button>
              </div>
            </div>

            {/* Escenario de la máquina con el tema seleccionado */}
            <div className="stage-canvas-wrapper">
              <SlotMachine isOverlayMode={false} isPreviewEmbedded={true} theme={selectedTheme} />
            </div>

            {/* Selector de premios para prueba rápida */}
            <div className="quick-test-bar">
              <span className="test-bar-label">Probar premio específico:</span>
              <button
                type="button"
                className="btn-prize-pill"
                onClick={() => handleTriggerTest(50, 'Viewer50')}
              >
                50 pts
              </button>
              <button
                type="button"
                className="btn-prize-pill"
                onClick={() => handleTriggerTest(500, 'Viewer500')}
              >
                500 pts
              </button>
              <button
                type="button"
                className="btn-prize-pill"
                onClick={() => handleTriggerTest(2500, 'Viewer2500')}
              >
                2,500 pts
              </button>
              <button
                type="button"
                className="btn-prize-pill jackpot-pill"
                onClick={() => handleTriggerTest(100000, 'ViewerJackpot')}
              >
                🌟 100,000 pts (JACKPOT)
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default StreamerDashboard;
