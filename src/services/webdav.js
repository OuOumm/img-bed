import { createClient } from 'webdav';
import dotenv from 'dotenv';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getLogger } from '../utils/logger.js';

dotenv.config();

const logger = getLogger('webdav-service');

// WebDAV客户端实例
let webdavClient = null;

/**
 * 初始化WebDAV客户端
 * @returns {Object} WebDAV客户端实例
 */
export function setupWebDAVClient() {
  try {
    const webdavUrl = process.env.WEBDAV_URL;
    const username = process.env.WEBDAV_USERNAME;
    const password = process.env.WEBDAV_PASSWORD;

    if (!webdavUrl || !username || !password) {
      throw new Error('WebDAV配置不完整，请检查环境变量');
    }

    webdavClient = createClient(webdavUrl, {
      username,
      password,
      headers: {
        'x-post-server': 'serv02'
      }
    });

    logger.info('WebDAV客户端初始化成功');
    return webdavClient;
  } catch (error) {
    logger.error(`WebDAV客户端初始化失败: ${error.message}`);
    throw error;
  }
}

/**
 * 获取WebDAV客户端实例
 * @returns {Object} WebDAV客户端实例
 */
export function getWebDAVClient() {
  if (!webdavClient) {
    return setupWebDAVClient();
  }
  return webdavClient;
}

/**
 * 上传文件到WebDAV服务器
 * @param {string} localFilePath - 本地文件路径
 * @param {string} remoteFilePath - 远程文件路径
 * @returns {Promise<boolean>} 上传是否成功
 */
export async function uploadFile(localFilePath, remoteFilePath) {
  try {
    const client = getWebDAVClient();
    const fileContent = fs.readFileSync(localFilePath);
    
    await client.putFileContents(remoteFilePath, fileContent, {
      overwrite: true,
      onUploadProgress: (progress) => {
        logger.debug(`上传进度: ${progress.loaded}/${progress.total}`);
      }
    });
    
    logger.info(`文件上传成功: ${remoteFilePath}`);
    return true;
  } catch (error) {
    logger.error(`文件上传失败: ${error.message}`);
    throw error;
  }
}

/**
 * 检查远程文件是否存在
 * @param {string} remoteFilePath - 远程文件路径
 * @returns {Promise<boolean>} 文件是否存在
 */
export async function fileExists(remoteFilePath) {
  try {
    const client = getWebDAVClient();
    return await client.exists(remoteFilePath);
  } catch (error) {
    logger.error(`检查文件存在失败: ${error.message}`);
    return false;
  }
}

/**
 * 删除远程文件
 * @param {string} remoteFilePath - 远程文件路径
 * @returns {Promise<boolean>} 删除是否成功
 */
export async function deleteFile(remoteFilePath) {
  try {
    const client = getWebDAVClient();
    await client.deleteFile(remoteFilePath);
    logger.info(`文件删除成功: ${remoteFilePath}`);
    return true;
  } catch (error) {
    logger.error(`文件删除失败: ${error.message}`);
    throw error;
  }
}

/**
 * 创建远程目录
 * @param {string} remoteDirPath - 远程目录路径
 * @returns {Promise<boolean>} 创建是否成功
 */
export async function createDirectory(remoteDirPath) {
  try {
    const client = getWebDAVClient();
    const exists = await client.exists(remoteDirPath);
    
    if (!exists) {
      await client.createDirectory(remoteDirPath);
      logger.info(`目录创建成功: ${remoteDirPath}`);
    } else {
      logger.info(`目录已存在: ${remoteDirPath}`);
    }
    
    return true;
  } catch (error) {
    logger.error(`目录创建失败: ${error.message}`);
    throw error;
  }
}

/**
 * 获取文件URL
 * @param {string} remoteFilePath - 远程文件路径
 * @returns {string} 文件URL
 */
export function getFileUrl(remoteFilePath) {
  const webdavUrl = process.env.WEBDAV_URL;
  // 移除尾部斜杠
  const baseUrl = webdavUrl.endsWith('/') ? webdavUrl.slice(0, -1) : webdavUrl;
  // 确保remoteFilePath以/开头
  const filePath = remoteFilePath.startsWith('/') ? remoteFilePath : `/${remoteFilePath}`;
  
  return `${baseUrl}${filePath}`;
}