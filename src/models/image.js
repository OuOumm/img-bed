import { getDatabase, transaction } from '../database/db.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('image-model');

/**
 * 创建新图片记录
 * @param {Object} imageData - 图片数据
 * @returns {Promise<Object>} 创建的图片记录
 */
export function createImage(imageData) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    const { 
      filename, 
      original_name, 
      encrypted_name, 
      file_size, 
      mime_type, 
      webdav_path, 
      url 
    } = imageData;
    
    const now = Math.floor(Date.now() / 1000);
    
    const sql = `
      INSERT INTO images (
        filename, 
        original_name, 
        encrypted_name, 
        file_size, 
        mime_type, 
        webdav_path, 
        url, 
        created_at, 
        last_accessed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
      filename,
      original_name,
      encrypted_name,
      file_size,
      mime_type,
      webdav_path,
      url,
      now,
      now
    ];
    
    db.run(sql, params, function(err) {
      if (err) {
        logger.error(`创建图片记录失败: ${err.message}`);
        return reject(err);
      }
      
      if (this.changes === 0) {
        const error = new Error('图片记录创建失败');
        logger.error(`创建图片记录失败: ${error.message}`);
        return reject(error);
      }
      
      getImageById(this.lastID)
        .then(newImage => {
          logger.info(`创建图片记录成功: ${filename}`);
          resolve(newImage);
        })
        .catch(err => reject(err));
    });
  });
}

/**
 * 根据ID获取图片
 * @param {number} id - 图片ID
 * @returns {Promise<Object|null>} 图片记录
 */
export function getImageById(id) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    const sql = 'SELECT * FROM images WHERE id = ? AND is_deleted = 0';
    
    db.get(sql, [id], (err, row) => {
      if (err) {
        logger.error(`获取图片记录失败: ${err.message}`);
        return reject(err);
      }
      resolve(row || null);
    });
  });
}

/**
 * 根据文件名获取图片
 * @param {string} filename - 图片文件名
 * @returns {Promise<Object|null>} 图片记录
 */
export function getImageByFilename(filename) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    const sql = 'SELECT * FROM images WHERE filename = ? AND is_deleted = 0';
    
    db.get(sql, [filename], (err, row) => {
      if (err) {
        logger.error(`获取图片记录失败: ${err.message}`);
        return reject(err);
      }
      resolve(row || null);
    });
  });
}

/**
 * 根据加密名称获取图片
 * @param {string} encryptedName - 加密后的图片名称
 * @returns {Promise<Object|null>} 图片记录
 */
export function getImageByEncryptedName(encryptedName) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    const sql = 'SELECT * FROM images WHERE encrypted_name = ? AND is_deleted = 0';
    
    db.get(sql, [encryptedName], (err, row) => {
      if (err) {
        logger.error(`获取图片记录失败: ${err.message}`);
        return reject(err);
      }
      resolve(row || null);
    });
  });
}

/**
 * 更新图片访问信息
 * @param {number} id - 图片ID
 * @param {Object} requestInfo - 请求信息
 * @returns {Promise<boolean>} 更新是否成功
 */
export function updateImageAccess(id, requestInfo = {}) {
  return transaction(async (db) => {
    return new Promise((resolve, reject) => {
      const now = Math.floor(Date.now() / 1000);
      
      // 更新图片访问信息
      const updateSql = `
        UPDATE images 
        SET last_accessed_at = ?, access_count = access_count + 1 
        WHERE id = ? AND is_deleted = 0
      `;
      
      db.run(updateSql, [now, id], function(err) {
        if (err) {
          logger.error(`更新图片访问信息失败: ${err.message}`);
          return reject(err);
        }
        
        if (this.changes === 0) {
          return resolve(false);
        }
        
        // 记录访问日志
        const { ip, userAgent, referer } = requestInfo;
        
        const logSql = `
          INSERT INTO access_logs (
            image_id, ip_address, user_agent, referer, accessed_at
          ) VALUES (?, ?, ?, ?, ?)
        `;
        
        db.run(logSql, [id, ip, userAgent, referer, now], (err) => {
          if (err) {
            logger.error(`记录访问日志失败: ${err.message}`);
            return reject(err);
          }
          
          resolve(true);
        });
      });
    });
  });
}

/**
 * 标记图片为已删除
 * @param {number} id - 图片ID
 * @returns {Promise<boolean>} 删除是否成功
 */
export function markImageAsDeleted(id) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    const sql = 'UPDATE images SET is_deleted = 1 WHERE id = ?';
    
    db.run(sql, [id], function(err) {
      if (err) {
        logger.error(`标记图片为已删除失败: ${err.message}`);
        return reject(err);
      }
      resolve(this.changes > 0);
    });
  });
}

/**
 * 物理删除图片记录
 * @param {number} id - 图片ID
 * @returns {Promise<boolean>} 删除是否成功
 */
export function deleteImage(id) {
  return transaction(async (db) => {
    return new Promise((resolve, reject) => {
      // 删除访问日志
      const deleteLogsSql = 'DELETE FROM access_logs WHERE image_id = ?';
      
      db.run(deleteLogsSql, [id], (err) => {
        if (err) {
          logger.error(`删除访问日志失败: ${err.message}`);
          return reject(err);
        }
        
        // 删除图片记录
        const deleteImageSql = 'DELETE FROM images WHERE id = ?';
        
        db.run(deleteImageSql, [id], function(err) {
          if (err) {
            logger.error(`删除图片记录失败: ${err.message}`);
            return reject(err);
          }
          
          resolve(this.changes > 0);
        });
      });
    });
  });
}

/**
 * 获取图片列表
 * @param {Object} options - 查询选项
 * @returns {Promise<Array>} 图片记录列表
 */
export function getImages(options = {}) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    const { 
      page = 1, 
      limit = 20, 
      sortBy = 'created_at', 
      sortOrder = 'DESC',
      includeDeleted = false
    } = options;
    
    const offset = (page - 1) * limit;
    const validSortColumns = ['id', 'filename', 'file_size', 'created_at', 'last_accessed_at', 'access_count'];
    const validSortOrders = ['ASC', 'DESC'];
    
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const order = validSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';
    
    let query = 'SELECT * FROM images';
    if (!includeDeleted) {
      query += ' WHERE is_deleted = 0';
    }
    
    query += ` ORDER BY ${sortColumn} ${order} LIMIT ? OFFSET ?`;
    
    db.all(query, [limit, offset], (err, rows) => {
      if (err) {
        logger.error(`获取图片列表失败: ${err.message}`);
        return reject(err);
      }
      resolve(rows);
    });
  });
}

/**
 * 获取图片总数
 * @param {boolean} includeDeleted - 是否包含已删除的图片
 * @returns {Promise<number>} 图片总数
 */
export function getImageCount(includeDeleted = false) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    let query = 'SELECT COUNT(*) as count FROM images';
    if (!includeDeleted) {
      query += ' WHERE is_deleted = 0';
    }
    
    db.get(query, [], (err, row) => {
      if (err) {
        logger.error(`获取图片总数失败: ${err.message}`);
        return reject(err);
      }
      resolve(row ? row.count : 0);
    });
  });
}

/**
 * 清理过期的访问日志
 * @param {number} days - 保留天数
 * @returns {Promise<number>} 删除的记录数
 */
export function cleanupAccessLogs(days = 30) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    const cutoffTime = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);
    
    const sql = 'DELETE FROM access_logs WHERE accessed_at < ?';
    
    db.run(sql, [cutoffTime], function(err) {
      if (err) {
        logger.error(`清理访问日志失败: ${err.message}`);
        return reject(err);
      }
      
      logger.info(`清理了 ${this.changes} 条过期访问日志`);
      resolve(this.changes);
    });
  });
}