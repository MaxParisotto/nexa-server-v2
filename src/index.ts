import * as http from 'http';
import { Server, WebSocket } from 'ws';
import express from 'express';
import winston from 'winston';
import * as path from 'path';

// Advanced Logger Setup with Rotation
import DailyRotateFile from 'winston-daily-rotate-file'; // Fix import syntax

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.prettyPrint()
  ),
  transports: [
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD-HH',
      level: 'error',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d'
    }),
    new DailyRotateFile({
      filename: 'logs/combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD-HH',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d'
    })
  ],
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

// Enhanced Dashboard with System Info
import * as si from 'systeminformation';

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

// Metrics Endpoint
app.get('/metrics', (req: express.Request, res: express.Response) => {
  const serverMetrics = {
    openaiConnections: openaiWsServer.clients.size,
    agentConnections: agentWsServer.clients.size,
    serverUptime: process.uptime(),
    memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024,
    logFiles: [
      { file: 'error.log', size: getFileSize('logs/error.log') },
      { file: 'combined.log', size: getFileSize('logs/combined.log') }
    ]
  };
  res.json(serverMetrics);
});

// System Information Endpoint
app.get('/sysinfo', async (req: express.Request, res: express.Response) => {
  try {
    const sysInfo = await (si as any).currentuser(); // Add type assertion for missing types
    const hardwareInfo = await Promise.all([
      si.cpu(),
      si.mem(),
      si.fsSize(),
      si.networkInterfaces(),
      si.battery()
    ]);
    
    res.json({
      system: sysInfo,
      cpu: hardwareInfo[0],
      memory: hardwareInfo[1],
      storage: hardwareInfo[2],
      network: hardwareInfo[3],
      battery: hardwareInfo[4]
    });
  } catch (error) {
    logger.error('Failed to retrieve system information', { error });
    res.status(500).send('Error retrieving system info');
  }
});

import * as fs from 'fs'; // Move fs import to top-level imports

// Helper function for file size

function getFileSize(filePath: string): number {
  try {
    return fs.statSync(filePath).size / (1024 * 1024);
  } catch {
    return 0;
  }
}

const dashboardPort = 3000;
app.listen(dashboardPort, () => {
  logger.info(`Dashboard available at http://localhost:${dashboardPort}`);
});
