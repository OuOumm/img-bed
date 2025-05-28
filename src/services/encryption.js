import crypto from 'crypto';
import dotenv from 'dotenv';
import { getLogger } from '../utils/logger.js';

dotenv.config();

const logger = getLogger('encryption-service');

// 从环境变量获取加密密钥和IV
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const ENCRYPTION_IV = process.env.ENCRYPTION_IV;

if (!ENCRYPTION_KEY || !ENCRYPTION_IV) {
  logger.error('加密密钥或IV未设置，请检查环境变量');
}

/**
 * 生成随机文件名
 * @param {number} length - 文件名长度
 * @returns {string} 随机文件名
 */
export function generateRandomFilename(length = 8) {
  return crypto.randomBytes(length).toString('hex').slice(0, length);
}

/**
 * 使用AES-256-CBC加密文件名
 * @param {string} filename - 原始文件名
 * @returns {string} 加密后的Base64编码文件名
 */
export function encryptFilename(filename) {
  try {
    if (!ENCRYPTION_KEY || !ENCRYPTION_IV) {
      throw new Error('加密密钥或IV未设置');
    }
    
    // 创建加密器
    const cipher = crypto.createCipheriv(
      'aes-256-cbc', 
      Buffer.from(ENCRYPTION_KEY, 'hex'), 
      Buffer.from(ENCRYPTION_IV, 'hex')
    );
    
    // 加密文件名
    let encrypted = cipher.update(filename, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    // 替换URL不安全字符
    encrypted = encrypted.replace(/\+/g, '-')
                         .replace(/\//g, '_')
                         .replace(/=/g, '');
    
    return encrypted;
  } catch (error) {
    logger.error(`文件名加密失败: ${error.message}`);
    throw error;
  }
}

/**
 * 解密文件名
 * @param {string} encryptedFilename - 加密后的Base64编码文件名
 * @returns {string} 解密后的原始文件名
 */
export function decryptFilename(encryptedFilename) {
  try {
    if (!ENCRYPTION_KEY || !ENCRYPTION_IV) {
      throw new Error('加密密钥或IV未设置');
    }
    
    // 还原URL安全Base64为标准Base64
    let base64 = encryptedFilename.replace(/-/g, '+')
                                 .replace(/_/g, '/');
    
    // 添加可能缺失的填充
    while (base64.length % 4) {
      base64 += '=';
    }
    
    // 创建解密器
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc', 
      Buffer.from(ENCRYPTION_KEY), 
      Buffer.from(ENCRYPTION_IV)
    );
    
    // 解密文件名
    let decrypted = decipher.update(base64, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    logger.error(`文件名解密失败: ${error.message}`);
    throw error;
  }
}

/**
 * 生成带404图片的文件名
 * @param {string} extension - 文件扩展名
 * @returns {Object} 包含随机文件名和加密文件名的对象
 */
export function generateImageFilename(extension) {
  try {
    // 生成8位随机文件名
    const randomName = generateRandomFilename(8);
    
    // 添加404img标识
    const filenameWithIdentifier = `${randomName}_404img`;
    
    // 加密文件名
    const encryptedName = encryptFilename(filenameWithIdentifier);
    
    // 添加扩展名
    const filename = extension ? `${randomName}.${extension}` : randomName;
    const encryptedFilename = extension ? `${encryptedName}.${extension}` : encryptedName;
    
    return {
      originalFilename: filenameWithIdentifier,
      filename,
      encryptedName,
      encryptedFilename
    };
  } catch (error) {
    logger.error(`生成图片文件名失败: ${error.message}`);
    throw error;
  }
}

/**
 * 验证加密文件名
 * @param {string} encryptedName - 加密后的文件名
 * @returns {boolean} 是否为有效的加密文件名
 */
export function validateEncryptedFilename(encryptedName) {
  try {
    const decrypted = decryptFilename(encryptedName);
    return decrypted.includes('_404img');
  } catch (error) {
    logger.error(`验证加密文件名失败: ${error.message}`);
    return false;
  }
}