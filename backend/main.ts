import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as express from 'express';
import * as path from 'path';
import * as fs from 'fs';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Habilitar CORS para permitir la conexión desde OBS Browser Source
  app.enableCors({
    origin: '*',
    methods: ['GET', 'POST'],
  });

  // Servir frontend compilado (Single Page Application)
  const possibleDistPaths = [
    path.resolve(process.cwd(), '../frontend/dist'),
    path.resolve(process.cwd(), 'frontend/dist'),
    path.resolve(__dirname, '../../frontend/dist'),
    path.resolve(__dirname, '../../../frontend/dist'),
  ];

  const frontendDist = possibleDistPaths.find((p) => fs.existsSync(p));

  if (frontendDist) {
    app.use(express.static(frontendDist));
    // SPA fallback para rutas que no sean de Socket.io
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/socket.io')) {
        return res.sendFile(path.join(frontendDist, 'index.html'));
      }
      next();
    });
    Logger.log(`🌐 Frontend web servido desde: ${frontendDist}`, 'Bootstrap');
  } else {
    Logger.warn(
      '⚠️ Carpeta frontend/dist no encontrada. Ejecuta "npm run build" en frontend.',
      'Bootstrap',
    );
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);

  Logger.log(`🚀 Servidor Casino Twitch corriendo en http://localhost:${port}`, 'Bootstrap');
  Logger.log(`🎰 WebSockets activos en ws://localhost:${port}`, 'Bootstrap');
  Logger.log(`📺 Enlace para OBS Browser Source: http://localhost:${port}/?overlay=true`, 'Bootstrap');
}
bootstrap();

