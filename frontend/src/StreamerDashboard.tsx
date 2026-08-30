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
  isConfigured?: boolean;
}

export const StreamerDashboard: React.FC = () => {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [twitchStatus, setTwitchStatus] = useState<TwitchStatusPayload | null>(null);

  // Formulario .env
  const [channel, setChannel] = useState<string>('Rudzy_tv');
  const [botUsername, setBotUsername] = useState<string>('Rudzy_tv');
  const [oauthToken, setOauthToken] = useState<string>('');
  const [showToken, setShowToken] = useState<boolean>(false);
  const [commandType, setCommandType] = useState<string>('botrix');
  const [customCommand, setCustomCommand] = useState<string>('!points add {user} {prize}');
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(300);

  // Tema de la máquina
  const [selectedTheme, setSelectedTheme] = useState<SlotTheme>('carnival-green');

  // Estado de mensajes y copiado
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error' | 'info' | ''; message: string }>({
    type: '',
    message: '',
  });
  const [copiedObsUrl, setCopiedObsUrl] = useState<boolean>(false);

  const socketRef = useRef<Socket | null>(null);

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
    });

    return () => {
      s.disconnect();
    };
  }, []);

  // Guardar configuración (.env)
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

    setSaveStatus({
      type: 'info',
      message: 'Guardando configuración en .env y conectando a Twitch...',
    });

    socketRef.current.emit(
      'set-twitch-credentials',
      {
        channel: cleanChannel,
        botUsername: botUsername.trim() || cleanChannel,
        oauthToken: oauthToken.trim(),
        pointsCommand: finalCommand,
        cooldownSeconds: Number(cooldownSeconds) || 300,
      },
      (res: { success: boolean; message: string }) => {
        if (res?.success) {
          setSaveStatus({
            type: 'success',
            message: res.message || '¡Datos guardados en .env y conexión establecida con éxito!',
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
        message: '🔄 Cooldown reiniciado. ¡La ruleta puede jugarse de inmediato!',
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

  const handleOpenOverlayTab = () => {
    window.open(obsUrlString, '_blank');
  };

  return (
    <div className="dashboard-container">
      {/* HEADER SUPERIOR */}
      <header className="dashboard-header">
        <div className="header-left">
          <div className="brand-logo">
            <span className="logo-icon">🎪</span>
            <div className="brand-titles">
              <h1>RUDZY FEST - RULETA TWITCH</h1>
              <span className="brand-subtitle">Launcher & Panel de Control para Streamers</span>
            </div>
          </div>
        </div>

        <div className="header-right">
          {/* Badge de conexión de Twitch */}
          <div className={`connection-badge ${isConnected ? 'connected' : 'disconnected'}`}>
            <span className="pulse-indicator" />
            <span className="badge-text">
              {isConnected
                ? twitchStatus?.isAuthenticated
                  ? `CONECTADO A #${twitchStatus.channel.toUpperCase()} (MODO PAGO ACTIVO)`
                  : twitchStatus?.channel
                  ? `MODO LECTURA (#${twitchStatus.channel})`
                  : 'ESPERANDO CANAL'
                : 'DESCONECTADO DEL SERVIDOR'}
            </span>
          </div>

          {/* Botón Abrir Overlay en ventana aparte */}
          <button
            type="button"
            className="btn-open-overlay"
            onClick={handleOpenOverlayTab}
            title="Abre la URL limpia del slot en una pestaña o ventana independiente"
          >
            🔗 Abrir Overlay en Ventana Aparte
          </button>

          {/* Botón copiar OBS */}
          <button
            type="button"
            className={`btn-copy-obs ${copiedObsUrl ? 'copied' : ''}`}
            onClick={handleCopyObsUrl}
          >
            {copiedObsUrl ? '✅ ¡URL Copiada!' : '📋 Copiar URL para OBS'}
          </button>
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL EN CUADRÍCULA DIRECTA */}
      <main className="dashboard-main dashboard-grid-main">
        {/* =========================================================================
            COLUMNA IZQUIERDA: CONFIGURACIÓN DE PARÁMETROS .ENV
            ========================================================================= */}
        <section className="dashboard-col col-config">
          <div className="dash-card card-twitch-config">
            <div className="card-header">
              <div className="card-icon twitch-icon">⚙️</div>
              <div>
                <h2>Configurar Canal de Twitch (.env)</h2>
                <p>Ingresa tus atributos aquí. Se guardan en tu archivo .env automáticamente.</p>
              </div>
            </div>

            <form onSubmit={handleSave} className="dash-form">
              {/* TWITCH_CHANNEL */}
              <div className="form-field">
                <div className="field-label-row">
                  <label htmlFor="cfg-channel">
                    <code>TWITCH_CHANNEL</code> <span className="req">*</span>
                  </label>
                  <span className="field-desc-tag">Canal donde transmites</span>
                </div>
                <div className="input-with-prefix">
                  <span className="input-prefix">twitch.tv/</span>
                  <input
                    id="cfg-channel"
                    type="text"
                    value={channel}
                    onChange={(e) => setChannel(e.target.value)}
                    placeholder="ej: Rudzy_tv"
                    required
                  />
                </div>
                <small className="field-hint">
                  El nombre de usuario de Twitch del canal donde se leerá el comando <code>!ruleta</code>.
                </small>
              </div>

              {/* TWITCH_BOT_USERNAME */}
              <div className="form-field">
                <div className="field-label-row">
                  <label htmlFor="cfg-bot">
                    <code>TWITCH_BOT_USERNAME</code> <span className="opt">(Opcional)</span>
                  </label>
                  <span className="field-desc-tag">Cuenta que enviará los puntos</span>
                </div>
                <div className="input-with-prefix">
                  <span className="input-prefix">@</span>
                  <input
                    id="cfg-bot"
                    type="text"
                    value={botUsername}
                    onChange={(e) => setBotUsername(e.target.value)}
                    placeholder={channel || 'ej: Rudzy_tv'}
                  />
                </div>
                <small className="field-hint">
                  Si usas tu misma cuenta para pagar en el chat, pon el mismo usuario que en TWITCH_CHANNEL.
                </small>
              </div>

              {/* TWITCH_OAUTH_TOKEN */}
              <div className="form-field token-field-highlight">
                <div className="token-label-row">
                  <label htmlFor="cfg-token">
                    <code>TWITCH_OAUTH_TOKEN</code> <span className="req">*</span>
                  </label>

                  {/* BOTÓN DIRECTO ENCONTRAR MI TOKEN */}
                  <a
                    href="https://twitchtokengenerator.com/quick/chat:read+chat:edit"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-find-my-token"
                    title="Abre la página oficial de Twitch para autorizar y obtener tu token en 10 segundos"
                  >
                    👉 Encontrar mi token
                  </a>
                </div>

                <div className="input-with-action">
                  <input
                    id="cfg-token"
                    type={showToken ? 'text' : 'password'}
                    value={oauthToken}
                    onChange={(e) => setOauthToken(e.target.value)}
                    placeholder="oauth:tu_token_aqui..."
                  />
                  <button
                    type="button"
                    className="btn-toggle-eye"
                    onClick={() => setShowToken(!showToken)}
                    title={showToken ? 'Ocultar contraseña' : 'Ver token'}
                  >
                    {showToken ? '👁️‍🗨️' : '👁️'}
                  </button>
                </div>

                <div className="token-help-bar">
                  <span>¿Prefieres la alternativa de TMI?</span>
                  <a
                    href="https://twitchapps.com/tmi/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link-tmi-alt"
                  >
                    🔗 TwitchApps TMI
                  </a>
                </div>
              </div>

              {/* Comando de Puntos */}
              <div className="form-field">
                <label>Formato del comando para pagar puntos en el chat:</label>
                <div className="radio-cards-group">
                  <label className={`radio-card ${commandType === 'botrix' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="cmdType"
                      value="botrix"
                      checked={commandType === 'botrix'}
                      onChange={() => setCommandType('botrix')}
                    />
                    <div className="radio-card-body">
                      <span className="radio-title">BotRix / StreamElements</span>
                      <code>!points add &#123;user&#125; &#123;prize&#125;</code>
                    </div>
                  </label>

                  <label className={`radio-card ${commandType === 'short' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="cmdType"
                      value="short"
                      checked={commandType === 'short'}
                      onChange={() => setCommandType('short')}
                    />
                    <div className="radio-card-body">
                      <span className="radio-title">Comando Corto</span>
                      <code>!p @&#123;user&#125; &#123;prize&#125;</code>
                    </div>
                  </label>

                  <label className={`radio-card ${commandType === 'custom' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="cmdType"
                      value="custom"
                      checked={commandType === 'custom'}
                      onChange={() => setCommandType('custom')}
                    />
                    <div className="radio-card-body">
                      <span className="radio-title">Personalizado</span>
                      <span className="radio-sub">Personalizar sintaxis</span>
                    </div>
                  </label>
                </div>

                {commandType === 'custom' && (
                  <div className="custom-cmd-input-wrap">
                    <input
                      type="text"
                      value={customCommand}
                      onChange={(e) => setCustomCommand(e.target.value)}
                      placeholder="!givepoints {user} {prize}"
                    />
                  </div>
                )}
              </div>

              {/* Feedback de guardado */}
              {saveStatus.message && (
                <div className={`dash-alert ${saveStatus.type}`}>
                  {saveStatus.type === 'success' && '✅ '}
                  {saveStatus.type === 'error' && '❌ '}
                  {saveStatus.type === 'info' && '⏳ '}
                  {saveStatus.message}
                </div>
              )}

              <button type="submit" className="btn-submit-save">
                💾 Guardar y Aplicar Cambios (.env)
              </button>
            </form>
          </div>
        </section>

        {/* =========================================================================
            COLUMNA DERECHA: CONTROL DE LA MÁQUINA, TEMAS, OBS, COOLDOWN Y VISTA EN VIVO
            ========================================================================= */}
        <section className="dashboard-col col-preview">
          {/* Tarjeta de Control para OBS */}
          <div className="dash-card card-obs-bar">
            <div className="obs-bar-top">
              <div>
                <span className="obs-tag-badge">🎬 ENLACE DIRECTO PARA OBS STUDIO</span>
                <p className="obs-bar-subtitle">
                  Fondo 100% transparente. En reposo es invisible; solo aparece la máquina cuando juegan.
                </p>
              </div>

              <div className="obs-action-buttons">
                <button
                  type="button"
                  className="btn-open-new-window"
                  onClick={handleOpenOverlayTab}
                  title="Abrir la tragaperras en una ventana/pestaña limpia aparte"
                >
                  🔗 Abrir en Ventana Aparte
                </button>
                <button
                  type="button"
                  className={`btn-hero-copy ${copiedObsUrl ? 'copied' : ''}`}
                  onClick={handleCopyObsUrl}
                >
                  {copiedObsUrl ? '✅ ¡URL Copiada!' : '📋 Copiar URL para OBS'}
                </button>
              </div>
            </div>

            <div className="obs-url-input-group">
              <input
                type="text"
                readOnly
                value={obsUrlString}
                onClick={handleCopyObsUrl}
                className="obs-readonly-url"
                title="Haz clic para copiar"
              />
            </div>
          </div>

          {/* NUEVO: Tarjeta de Modificación y Control de Cooldown */}
          <div className="dash-card card-cooldown-control">
            <div className="cooldown-card-header">
              <div className="cooldown-title-group">
                <span className="cooldown-icon">⏱️</span>
                <div>
                  <h3 className="cooldown-title">Modificar Tiempo de Cooldown (Espera entre Tiradas)</h3>
                  <p className="cooldown-desc">
                    Elige un valor rápido o escribe los segundos que quieras. Se guarda automáticamente en tu .env:
                  </p>
                </div>
              </div>
              <span className="cooldown-active-pill">
                Activo: <b>{cooldownSeconds}s ({Math.floor(cooldownSeconds / 60)}m {cooldownSeconds % 60}s)</b>
              </span>
            </div>

            {/* Presets de Cooldown rápidos */}
            <div className="cooldown-presets-grid">
              <button
                type="button"
                className={`preset-btn ${cooldownSeconds === 10 ? 'active' : ''}`}
                onClick={() => handleUpdateCooldown(10)}
              >
                ⚡ 10 seg (Pruebas)
              </button>
              <button
                type="button"
                className={`preset-btn ${cooldownSeconds === 30 ? 'active' : ''}`}
                onClick={() => handleUpdateCooldown(30)}
              >
                ⏱️ 30 seg
              </button>
              <button
                type="button"
                className={`preset-btn ${cooldownSeconds === 60 ? 'active' : ''}`}
                onClick={() => handleUpdateCooldown(60)}
              >
                ⏱️ 1 min (60s)
              </button>
              <button
                type="button"
                className={`preset-btn ${cooldownSeconds === 120 ? 'active' : ''}`}
                onClick={() => handleUpdateCooldown(120)}
              >
                ⏱️ 2 min (120s)
              </button>
              <button
                type="button"
                className={`preset-btn ${cooldownSeconds === 300 ? 'active' : ''}`}
                onClick={() => handleUpdateCooldown(300)}
              >
                ⏱️ 5 min (300s - BotRix)
              </button>
              <button
                type="button"
                className={`preset-btn ${cooldownSeconds === 600 ? 'active' : ''}`}
                onClick={() => handleUpdateCooldown(600)}
              >
                ⏱️ 10 min (600s)
              </button>
            </div>

            {/* Fila de ajuste personalizado y reset */}
            <div className="cooldown-custom-row">
              <div className="cd-stepper-wrap">
                <span className="custom-cd-label">Segundos:</span>
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
                  onClick={() => setSelectedTheme(th.id)}
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
                🔴 Vista en Vivo de la Máquina (Se activa automáticamente con <code>!ruleta</code>)
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
