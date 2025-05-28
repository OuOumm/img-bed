import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import { getLogger } from '../utils/logger.js';
import * as ImageService from '../services/image.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logger = getLogger('image-routes');

// 创建路由器
const router = express.Router();

// 配置临时上传目录
const TEMP_DIR = path.join(__dirname, '../../temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// 配置Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, TEMP_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

// 文件过滤器
const fileFilter = (req, file, cb) => {
  // 允许的图片类型
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp'];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('不支持的文件类型，仅支持图片文件'), false);
  }
};

// 配置上传限制
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760') // 默认10MB
  }
});

/**
 * 获取请求信息
 * @param {Object} req - 请求对象
 * @returns {Object} 请求信息
 */
function getRequestInfo(req) {
  return {
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.headers['user-agent'],
    referer: req.headers.referer || req.headers.referrer
  };
}

/**
 * @route POST /api/images/upload
 * @desc 上传图片
 */
router.post('/upload', upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '未提供图片文件'
      });
    }
    
    const result = await ImageService.uploadImage(req.file);
    
    res.status(201).json({
      success: true,
      message: '图片上传成功',
      data: result
    });
  } catch (error) {
    logger.error(`图片上传处理失败: ${error.message}`);
    next(error);
  }
});

/**
 * @route GET /api/images/:encryptedName
 * @desc 获取图片信息
 */
router.get('/:encryptedName', async (req, res, next) => {
  try {
    const { encryptedName } = req.params;
    const requestInfo = getRequestInfo(req);
    
    const image = await ImageService.getImage(encryptedName, requestInfo);
    
    res.json({
      success: true,
      data: image
    });
  } catch (error) {
    logger.error(`获取图片信息失败: ${error.message}`);
    
    if (error.message === '图片不存在' || error.message === '无效的图片标识') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }
    
    next(error);
  }
});

/**
 * @route DELETE /api/images/:id
 * @desc 删除图片
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: '无效的图片ID'
      });
    }
    
    const result = await ImageService.deleteImage(id);
    
    if (result) {
      res.json({
        success: true,
        message: '图片删除成功'
      });
    } else {
      res.status(404).json({
        success: false,
        message: '图片不存在或删除失败'
      });
    }
  } catch (error) {
    logger.error(`删除图片失败: ${error.message}`);
    next(error);
  }
});

/**
 * @route GET /api/images
 * @desc 获取图片列表
 */
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, sort = 'created_at', order = 'desc' } = req.query;
    
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy: sort,
      sortOrder: order
    };
    
    const result = await ImageService.getImages(options);
    
    res.json({
      success: true,
      data: result.images,
      pagination: result.pagination
    });
  } catch (error) {
    logger.error(`获取图片列表失败: ${error.message}`);
    next(error);
  }
});

export default router;