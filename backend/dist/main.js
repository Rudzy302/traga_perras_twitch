"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const common_1 = require("@nestjs/common");
const express = require("express");
const path = require("path");
const fs = require("fs");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.enableCors({
        origin: '*',
        methods: ['GET', 'POST'],
    });
    const possibleDistPaths = [
        path.resolve(process.cwd(), '../frontend/dist'),
        path.resolve(process.cwd(), 'frontend/dist'),
        path.resolve(__dirname, '../../frontend/dist'),
        path.resolve(__dirname, '../../../frontend/dist'),
    ];
    const frontendDist = possibleDistPaths.find((p) => fs.existsSync(p));
    if (frontendDist) {
        app.use(express.static(frontendDist, {
            setHeaders: (res) => {
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
            },
        }));
        app.use((req, res, next) => {
            if (req.method === 'GET' && !req.path.startsWith('/socket.io')) {
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
                return res.sendFile(path.join(frontendDist, 'index.html'));
            }
            next();
        });
        common_1.Logger.log(`🌐 Frontend web servido desde: ${frontendDist}`, 'Bootstrap');
    }
    else {
        common_1.Logger.warn('⚠️ Carpeta frontend/dist no encontrada. Ejecuta "npm run build" en frontend.', 'Bootstrap');
    }
    const port = process.env.PORT || 3000;
    await app.listen(port);
    common_1.Logger.log(`🚀 Servidor Casino Twitch corriendo en http://localhost:${port}`, 'Bootstrap');
    common_1.Logger.log(`🎰 WebSockets activos en ws://localhost:${port}`, 'Bootstrap');
    common_1.Logger.log(`📺 Enlace para OBS Browser Source: http://localhost:${port}/?overlay=true`, 'Bootstrap');
}
bootstrap();
//# sourceMappingURL=main.js.map