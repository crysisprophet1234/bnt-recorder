import winston from 'winston';
import 'winston-daily-rotate-file';
import dotenv from 'dotenv';

dotenv.config();

const logLevel = process.env.LOG_LEVEL || 'info';
const rotationDays = parseInt(process.env.LOG_ROTATION_DAYS || '7', 10);
const logPath = process.env.LOG_PATH || 'logs';

const transport = new winston.transports.DailyRotateFile({
  dirname: logPath,
  filename: 'app-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxFiles: `${rotationDays}d`,
  level: logLevel,
});

const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(
      (info) =>
        `[${info.timestamp}] [${info.level.toUpperCase()}] ${String(info.message)}`
    )
  ),
  transports: [
    transport,
    new winston.transports.Console({ level: logLevel }),
  ],
});

export default logger;