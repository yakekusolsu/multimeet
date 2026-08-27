import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { app } from './app.js';
import { config } from './config.js';
import { registerSocketServer } from './socket.js';

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: config.allowedOrigins, methods: ['GET', 'POST'] },
  maxHttpBufferSize: 64 * 1024,
  connectionStateRecovery: { maxDisconnectionDuration: 10_000, skipMiddlewares: false },
});

app.set('io', io);
registerSocketServer(io);

httpServer.listen(config.port, () => {
  console.log(`[MultiMeet] listening on ${config.publicUrl}`);
});
