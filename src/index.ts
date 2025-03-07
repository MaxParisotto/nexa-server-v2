import * as http from 'http';
import { Server, WebSocket } from 'ws';
import express from 'express';
import winston from 'winston';
import * as path from 'path';

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

// External OpenAI Gateway
const openaiPort = 9001;
const openaiHttpServer = http.createServer();
const openaiWsServer = new Server({ server: openaiHttpServer });
openaiWsServer.on('connection', (socket: WebSocket) => {
  logger.info(`External API gateway connection established`);
  socket.on('message', (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());
      if (message.action === 'inference') {
        // Add GPT interaction logic here
        socket.send(JSON.stringify({ status: 'received' }));
      }
    } catch (err) {
      logger.error('Message parsing failed', { error: err });
    }
  });
});
openaiHttpServer.listen(openaiPort, () => {
  logger.info(`External API gateway listening on *:${openaiPort}`);
});

// Internal Agent Server
const agentPort = 3001;
const agentHttpServer = http.createServer();
const agentWsServer = new Server({ server: agentHttpServer });
agentWsServer.on('connection', (socket: WebSocket) => {
  logger.info('Agent connection established');
  socket.send('Welcome to internal agent server');
});
agentHttpServer.listen(agentPort, () => {
  logger.info(`Internal agent server listening on *:${agentPort}`);
});

// Dashboard setup
const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/metrics', (req: express.Request, res: express.Response) => {
  const metrics = {
    openaiConnections: openaiWsServer.clients.size,
    agentConnections: agentWsServer.clients.size,
    serverUptime: process.uptime(),
    memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024
  };
  res.json(metrics);
});

const dashboardPort = 3000;
app.listen(dashboardPort, () => {
  logger.info(`Dashboard available at http://localhost:${dashboardPort}`);
});
