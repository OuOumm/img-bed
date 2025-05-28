import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { getLogger } from '../utils/logger.js';
import { generateImageFilename, validateEncryptedFilename } from './encryption.js';
import { uploadFile, fileExists, deleteFile, getFileUrl } from './webdav.js';
import * as ImageModel from '../models/image.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logger = getLogger('image-service');

// 上传目录
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');

// 确保上传目录存在
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * 获取文件扩展名
 * @param {string} filename - 文件名
 * @returns {string} 文件扩展名
 */
function getFileExtension(filename) {
  return path.extname(filename).toLowerCase().substring(1);
}

/**
 * 获取MIME类型
 * @param {string} extension - 文件扩展名
 * @returns {string} MIME类型
 */
function getMimeType(extension) {
  const mimeTypes = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'bmp': 'image/bmp',
    'ico': 'image/x-icon'
  };
  
  return mimeTypes[extension] || 'application/octet-stream';
}

/**
 * 处理图片上传
 * @param {Object} file - 上传的文件对象
 * @returns {Promise<Object>} 上传结果
 */
export async function uploadImage(file) {
  try {
    const { originalname, path: tempPath, size, mimetype } = file;
    
    // 获取文件扩展名
    const extension = getFileExtension(originalname);
    
    // 生成文件名
    const { filename, encryptedName, encryptedFilename } = generateImageFilename(extension);
    
    // 构建本地文件路径
    const localFilePath = path.join(UPLOAD_DIR, filename);
    
    // 移动临时文件到上传目录
    fs.copyFileSync(tempPath, localFilePath);
    fs.unlinkSync(tempPath); // 删除临时文件
    
    // 构建WebDAV路径
    const webdavPath = `/images/${filename}`;
    
    // 上传到WebDAV服务器
    await uploadFile(localFilePath, webdavPath);
    
    // 获取文件URL
    const url = getFileUrl(webdavPath);
    
    // 保存到数据库
    const imageData = {
      filename,
      original_name: originalname,
      encrypted_name: encryptedName,
      file_size: size,
      mime_type: mimetype || getMimeType(extension),
      webdav_path: webdavPath,
      url
    };
    
    const image = ImageModel.createImage(imageData);
    
    // 返回结果
    return {
      id: image.id,
      filename,
      encryptedFilename,
      url,
      size,
      mimetype: imageData.mime_type
    };
  } catch (error) {
    logger.error(`图片上传失败: ${error.message}`);
    throw error;
  }
}

/**
 * 获取图片信息
 * @param {string} encryptedName - 加密的文件名
 * @param {Object} requestInfo - 请求信息
 * @returns {Promise<Object>} 图片信息
 */
export async function getImage(encryptedName, requestInfo = {}) {
  try {
    // 验证加密文件名
    if (!validateEncryptedFilename(encryptedName)) {
      throw new Error('无效的图片标识');
    }
    
    // 从数据库获取图片信息
    const image = ImageModel.getImageByEncryptedName(encryptedName);
    
    if (!image) {
      throw new Error('图片不存在');
    }
    
    // 更新访问信息
    ImageModel.updateImageAccess(image.id, requestInfo);
    
    // 检查WebDAV服务器上的文件是否存在
    const exists = await fileExists(image.webdav_path);
    
    if (!exists) {
      throw new Error('图片文件不存在');
    }
    
    return {
      id: image.id,
      filename: image.filename,
      url: image.url,
      size: image.file_size,
      mimetype: image.mime_type,
      created_at: image.created_at,
      access_count: image.access_count
    };
  } catch (error) {
    logger.error(`获取图片失败: ${error.message}`);
    throw error;
  }
}

/**
 * 删除图片
 * @param {number} id - 图片ID
 * @returns {Promise<boolean>} 删除是否成功
 */
export async function deleteImage(id) {
  try {
    // 获取图片信息
    const image = ImageModel.getImageById(id);
    
    if (!image) {
      throw new Error('图片不存在');
    }
    
    // 从WebDAV服务器删除
    await deleteFile(image.webdav_path);
    
    // 删除本地文件
    const localFilePath = path.join(UPLOAD_DIR, image.filename);
    if (fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath);
    }
    
    // 从数据库中标记为已删除
    const result = ImageModel.markImageAsDeleted(id);
    
    return result;
  } catch (error) {
    logger.error(`删除图片失败: ${error.message}`);
    throw error;
  }
}

/**
 * 获取图片列表
 * @param {Object} options - 查询选项
 * @returns {Promise<Object>} 图片列表和分页信息
 */
export async function getImages(options = {}) {
  try {
    const { page = 1, limit = 20 } = options;
    
    // 获取图片列表
    const images = await ImageModel.getImages(options);
    
    // 获取总数
    const total = await ImageModel.getImageCount();
    
    // 计算总页数
    const totalPages = Math.ceil(total / limit);
    
    return {
      images: images.map(image => ({
        id: image.id,
        filename: image.filename,
        url: image.url,
        size: image.file_size,
        mimetype: image.mime_type,
        created_at: image.created_at,
        access_count: image.access_count
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages
      }
    };
  } catch (error) {
    logger.error(`获取图片列表失败: ${error.message}`);
    throw error;
  }
}

/**
 * 清理临时文件
 * @returns {Promise<number>} 清理的文件数量
 */
export async function cleanupTempFiles() {
  try {
    let count = 0;
    
    // 读取上传目录中的所有文件
    const files = fs.readdirSync(UPLOAD_DIR);
    
    for (const file of files) {
      // 跳过目录
      const filePath = path.join(UPLOAD_DIR, file);
      if (fs.statSync(filePath).isDirectory()) {
        continue;
      }
      
      // 检查文件是否在数据库中
      const image = ImageModel.getImageByFilename(file);
      
      // 如果文件不在数据库中，则删除
      if (!image) {
        fs.unlinkSync(filePath);
        count++;
      }
    }
    
    logger.info(`清理了 ${count} 个临时文件`);
    return count;
  } catch (error) {
    logger.error(`清理临时文件失败: ${error.message}`);
    throw error;
  }
}