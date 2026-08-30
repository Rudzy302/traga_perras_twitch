# 🎰 Traga Perras & Ruleta de Twitch - Rudzy Fest

Sistema completo e interactivo de ruleta / máquina tragaperras para streamers de **Twitch** e integración con **OBS Studio**.

Diseñado para ser utilizado por **cualquier streamer** sin complicaciones técnicas, gracias a su ejecutable autónomo (`casino.exe`) y su panel de control web integrado.

---

## ✨ Características Principales

- **🎪 Título Oficial "Rudzy Fest"**:
  - Marquesina personalizada con íconos dinámicos en cada tema.
  - Indicador destacado **"TIRADA POR PARTE DE @Usuario"** con soporte para nombres largos de más de 15 caracteres.
- **🎨 Colección de 8 Temas Visuales Únicos**:
  1. 🎪 **Carnaval Vintage**: Chasis esmeralda, latón dorado biselado y bombillas de feria.
  2. 👑 **Oro Real Casino**: Ébano pulido, esquinas en chaflán y molduras de oro 24k.
  3. ⚡ **Cyber Synthwave**: Fibra de carbono, tubos de neón cilíndricos cian/magenta y rejilla láser.
  4. 🔥 **Infierno Arcade**: Metal forjado volcánico, brasas ardientes y haz de magma.
  5. ❄️ **Glaciar Ártico**: Zafiro polar translúcido, escarcha congelada y luces aurora.
  6. 🌴 **Retro Miami 80s**: Monitor CRT arcade, gradiente sunset violeta a naranja y neones retro.
  7. ⚙️ **Steampunk Clockwork**: Cobre martillado, engranajes victorianos y lámparas Nixie.
  8. 🌌 **Cosmos Galáctico**: Nebulosa interestelar amatista, polvo estelar y orbes supernova.
- **🚀 Ejecutable Autónomo (`casino.exe`)**:
  - Doble clic y listo: levanta el servidor backend, compila si es necesario y abre el panel en el navegador automáticamente.
- **🎬 Overlay 100% Limpio para OBS Studio**:
  - Totalmente transparente e invisible en reposo.
  - Solo aparece la máquina cuando un espectador juega con `!ruleta`.
- **⏱️ Modificador Dinámico de Cooldown**:
  - Presets rápidos (10s, 30s, 1m, 2m, 5m, 10m) y ajuste libre en segundos desde la interfaz web.
  - Botón de reseteo inmediato para pruebas.
- **📣 Cuenta Regresiva Automática en el Chat de Twitch**:
  - Cuando el cooldown esté por terminar, el bot envía automáticamente en el chat con la cuenta del streamer:
    - ⏳ *¡La ruleta estará disponible en 3...*
    - ⏳ *¡La ruleta estará disponible en 2...*
    - ⏳ *¡La ruleta estará disponible en 1...*
    - 🚨 *¡¡¡¡¡RULETA YA DISPONIBLE!!!!! Escribe !ruleta para girar 🎰✨*
- **💰 Pago Automático de Puntos**:
  - Soporta **BotRix**, **StreamElements** (`!points add {user} {prize}`), comandos cortos (`!p @{user} {prize}`) y formatos personalizados.

---

## 🚀 Inicio Rápido (Recomendado para Streamers)

### Opción 1: Con `casino.exe` (Sin escribir comandos)
1. Asegúrate de tener instalado [Node.js (LTS)](https://nodejs.org/).
2. Haz doble clic en **`casino.exe`**.
3. Se abrirá automáticamente tu navegador en `http://localhost:3000`.
4. Ingresa el nombre de tu canal de Twitch y tu token OAuth (tienes un botón directo para generarlo en 10 segundos).
5. Haz clic en **"Guardar y Aplicar Cambios"** y ¡a streamear!

---

### Opción 2: Desde la Terminal
```bash
# 1. Instalar dependencias
npm run install:all

# 2. Compilar frontend y backend
npm run build:frontend
npm run build:backend

# 3. Iniciar el servidor unificado
npm start
```
Luego abre en tu navegador `http://localhost:3000`.

---

## 🎬 Configuración en OBS Studio

1. Abre tu panel en `http://localhost:3000`.
2. Elige el tema que más te guste y haz clic en **"📋 Copiar URL para OBS"**.
   - Ejemplo de URL: `http://localhost:3000/?overlay=true&theme=carnival-green`
3. En OBS Studio, ve a **Fuentes** -> Botón `+` -> **Navegador** (*Browser Source*).
4. Configuración recomendada:
   - **URL**: `http://localhost:3000/?overlay=true&theme=tu-tema`
   - **Ancho (Width)**: `1920`
   - **Alto (Height)**: `1080`
   - Marca la casilla **"Controlar audio vía OBS"** para poder nivelar los efectos de sonido.
5. Haz clic en **Aceptar**. La máquina permanecerá invisible hasta que alguien escriba `!ruleta` en tu chat.

---

## 🛠️ Tecnologías Utilizadas

- **Backend**: [NestJS](https://nestjs.com/), [TypeScript](https://www.typescriptlang.org/), [Socket.io](https://socket.io/), [TMI.js](https://tmijs.com/) (Twitch IRC).
- **Frontend**: [React 18](https://react.dev/), [Vite](https://vitejs.dev/), Web Audio API nativa.
- **Launcher**: C# (.NET Framework) compilador nativo de Windows.

---

## 📄 Licencia

Distribuido bajo la licencia ISC. Creado para la comunidad de streamers de Twitch.
