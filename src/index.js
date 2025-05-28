import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import bodyParser from 'body-parser';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

// 导入路由
import imageRoutes from './routes/image.js';
import { initDatabase } from './database/db.js';
import { setupWebDAVClient } from './services/webdav.js';
import { initScheduler } from './utils/scheduler.js';
import { getLogger } from './utils/logger.js';

// 加载环境变量
dotenv.config();

// 初始化日志
const logger = getLogger('app');

// 初始化Express应用
const app = express();
const PORT = process.env.PORT || 3000;

// 获取当前文件的目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 确保上传目录存在
const uploadDir = process.env.UPLOAD_DIR || join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 确保数据目录存在
const dataDir = join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 确保临时目录存在
const tempDir = join(__dirname, '../temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// 确保日志目录存在
const logsDir = join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// 确保public目录存在
const publicDir = join(__dirname, '../public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 中间件配置
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', '*'],
    },
  },
})); // 安全头
app.use(cors()); // 跨域支持
app.use(morgan('combined')); // 日志
app.use(bodyParser.json()); // JSON解析
app.use(bodyParser.urlencoded({ extended: true }));

// 静态文件服务
app.use(express.static(publicDir));

// 限流配置
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100, // 每个IP在windowMs内最多100个请求
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// 初始化数据库
try {
  initDatabase();
  logger.info('数据库初始化成功');
} catch (error) {
  logger.error(`数据库初始化失败: ${error.message}`);
  process.exit(1);
}

// 初始化WebDAV客户端
try {
  setupWebDAVClient();
  logger.info('WebDAV客户端初始化成功');
} catch (error) {
  logger.error(`WebDAV客户端初始化失败: ${error.message}`);
  process.exit(1);
}

// 初始化定时任务
try {
  initScheduler();
  logger.info('定时任务调度器初始化成功');
} catch (error) {
  logger.error(`定时任务调度器初始化失败: ${error.message}`);
  // 不退出进程，因为定时任务不是核心功能
}

// 路由
app.use('/api/images', imageRoutes);

// 健康检查端点
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// 主页路由
app.get('/', (req, res) => {
  res.sendFile(join(publicDir, 'index.html'));
});

// 错误处理中间件
app.use((err, req, res, next) => {
  logger.error(`服务器错误: ${err.stack}`);
  
  // 处理Multer错误
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      message: `文件大小超过限制 (${process.env.MAX_FILE_SIZE || '10MB'})`
    });
  }
  
  res.status(500).json({
    success: false,
    message: 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 启动服务器
app.listen(PORT, () => {
  logger.info(`服务器运行在端口 ${PORT}`);
  logger.info(`环境: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`访问地址: http://localhost:${PORT}`);
});

// 处理未捕获的异常
process.on('uncaughtException', (err) => {
  logger.error(`未捕获的异常: ${err.message}`);
  logger.error(err.stack);
});

// 处理未处理的Promise拒绝
process.on('unhandledRejection', (reason, promise) => {
  logger.error('未处理的Promise拒绝');
  logger.error(reason);
});

export default app;