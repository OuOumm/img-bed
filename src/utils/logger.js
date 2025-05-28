import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 日志级别
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

// 当前日志级别
const CURRENT_LOG_LEVEL = process.env.LOG_LEVEL ? 
  LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()] : 
  (process.env.NODE_ENV === 'production' ? LOG_LEVELS.INFO : LOG_LEVELS.DEBUG);

// 日志目录
const LOG_DIR = path.join(__dirname, '../../logs');

// 确保日志目录存在
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * 格式化日期时间
 * @returns {string} 格式化后的日期时间字符串
 */
function getFormattedDateTime() {
  const now = new Date();
  return now.toISOString();
}

/**
 * 获取日志文件路径
 * @returns {string} 日志文件路径
 */
function getLogFilePath() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  
  return path.join(LOG_DIR, `${year}-${month}-${day}.log`);
}

/**
 * 写入日志到文件
 * @param {string} message - 日志消息
 */
function writeToLogFile(message) {
  const logFilePath = getLogFilePath();
  fs.appendFileSync(logFilePath, message + '\n');
}

/**
 * 创建日志记录器
 * @param {string} moduleName - 模块名称
 * @returns {Object} 日志记录器对象
 */
export function getLogger(moduleName) {
  return {
    /**
     * 记录调试级别日志
     * @param {string} message - 日志消息
     */
    debug(message) {
      if (CURRENT_LOG_LEVEL <= LOG_LEVELS.DEBUG) {
        const logMessage = `[${getFormattedDateTime()}] [DEBUG] [${moduleName}] ${message}`;
        console.debug(logMessage);
        writeToLogFile(logMessage);
      }
    },
    
    /**
     * 记录信息级别日志
     * @param {string} message - 日志消息
     */
    info(message) {
      if (CURRENT_LOG_LEVEL <= LOG_LEVELS.INFO) {
        const logMessage = `[${getFormattedDateTime()}] [INFO] [${moduleName}] ${message}`;
        console.info(logMessage);
        writeToLogFile(logMessage);
      }
    },
    
    /**
     * 记录警告级别日志
     * @param {string} message - 日志消息
     */
    warn(message) {
      if (CURRENT_LOG_LEVEL <= LOG_LEVELS.WARN) {
        const logMessage = `[${getFormattedDateTime()}] [WARN] [${moduleName}] ${message}`;
        console.warn(logMessage);
        writeToLogFile(logMessage);
      }
    },
    
    /**
     * 记录错误级别日志
     * @param {string} message - 日志消息
     */
    error(message) {
      if (CURRENT_LOG_LEVEL <= LOG_LEVELS.ERROR) {
        const logMessage = `[${getFormattedDateTime()}] [ERROR] [${moduleName}] ${message}`;
        console.error(logMessage);
        writeToLogFile(logMessage);
      }
    }
  };
}