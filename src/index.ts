import * as http from 'http';
import { Server, WebSocket } from 'ws';
import express from 'express';
import winston from 'winston';
import * as path from 'path';
import * as fs from 'fs'; // Add back missing import

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
app.set('views', path.join(__dirname, 'public/views'));
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

// System Information Endpoint
app.get('/sysinfo', async (req: express.Request, res: express.Response) => {
  try {
    const sysInfo = await (si as any).currentuser(); // Ensure proper type casting for systeminformation API
    const hardwareInfo = await Promise.all([
      si.cpu(),
      si.mem(),
      si.fsSize('/'), // Specify root mount point
      si.networkInterfaces(),
      // si.battery() // Optional: Comment out if not needed or handle errors
    ]);
    
    return res.render('sysinfo', {
      system: sysInfo,
      cpu: hardwareInfo[0],
      memory: hardwareInfo[1],
      storage: Array.isArray(hardwareInfo[2]) ? hardwareInfo[2] : [], // Safeguard against invalid partition data
      networkInterfaces: Array.isArray(hardwareInfo[3]) 
    ? hardwareInfo[3].map((iface: any) => ({
        interfaceName: iface.name || 'N/A',
        ipv4Address: (iface.ip4 && iface.ip4.length > 0) ? iface.ip4[0].address : 'N/A',
        macAddress: iface.mac || 'N/A'
    })) 
    : []
    });
  } catch (error) {
    logger.error('Failed to retrieve system information', { error });
    res.status(500).send('Error retrieving system info');
  }
});

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
