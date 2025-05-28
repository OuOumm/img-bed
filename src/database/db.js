import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import { getLogger } from '../utils/logger.js';
import { promisify } from 'util';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logger = getLogger('database');

// 数据库路径
const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/imagebed.db');

// 确保数据库目录存在
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// 数据库连接实例
let db = null;

// 创建Promise版本的数据库方法
const dbRun = (db, sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

const dbGet = (db, sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
};

const dbAll = (db, sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
};

const dbExec = (db, sql) => {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
};

/**
 * 初始化数据库
 * @returns {Object} 数据库实例
 */
export function initDatabase() {
  try {
    logger.info(`初始化数据库: ${dbPath}`);
    
    // 创建数据库连接
    const sqlite3Verbose = process.env.NODE_ENV === 'development' ? sqlite3.verbose() : sqlite3;
    db = new sqlite3Verbose.Database(dbPath);
    
    // 启用WAL模式以提高性能和并发性
    db.run('PRAGMA journal_mode = WAL');
    
    // 启用外键约束
    db.run('PRAGMA foreign_keys = ON');
    
    // 设置缓存大小以提高性能
    db.run('PRAGMA cache_size = -20000'); // 约20MB的缓存
    
    // 创建图片表
    db.exec(`
      CREATE TABLE IF NOT EXISTS images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL UNIQUE,
        original_name TEXT NOT NULL,
        encrypted_name TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        mime_type TEXT NOT NULL,
        webdav_path TEXT NOT NULL,
        url TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_accessed_at INTEGER,
        access_count INTEGER DEFAULT 0,
        is_deleted INTEGER DEFAULT 0
      )
    `, (err) => {
      if (err) throw err;
      
      // 创建索引以提高查询性能
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_images_filename ON images(filename);
        CREATE INDEX IF NOT EXISTS idx_images_encrypted_name ON images(encrypted_name);
        CREATE INDEX IF NOT EXISTS idx_images_created_at ON images(created_at);
        CREATE INDEX IF NOT EXISTS idx_images_is_deleted ON images(is_deleted);
      `, (err) => {
        if (err) throw err;
        
        // 创建访问日志表
        db.exec(`
          CREATE TABLE IF NOT EXISTS access_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            image_id INTEGER NOT NULL,
            ip_address TEXT,
            user_agent TEXT,
            referer TEXT,
            accessed_at INTEGER NOT NULL,
            FOREIGN KEY (image_id) REFERENCES images(id)
          )
        `, (err) => {
          if (err) throw err;
          
          // 创建索引
          db.exec(`
            CREATE INDEX IF NOT EXISTS idx_access_logs_image_id ON access_logs(image_id);
            CREATE INDEX IF NOT EXISTS idx_access_logs_accessed_at ON access_logs(accessed_at);
          `);
        });
      });
    });
    
    logger.info('数据库初始化完成');
    return db;
  } catch (error) {
    logger.error(`数据库初始化失败: ${error.message}`);
    throw error;
  }
}

/**
 * 获取数据库实例
 * @returns {Object} 数据库实例
 */
export function getDatabase() {
  if (!db) {
    return initDatabase();
  }
  return db;
}

/**
 * 关闭数据库连接
 */
export function closeDatabase() {
  if (db) {
    db.close((err) => {
      if (err) {
        logger.error(`关闭数据库连接失败: ${err.message}`);
      } else {
        logger.info('数据库连接已关闭');
      }
      db = null;
    });
  }
}

/**
 * 执行数据库事务
 * @param {Function} callback - 事务回调函数
 * @returns {Promise<any>} 事务执行结果
 */
export function transaction(callback) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.run('BEGIN TRANSACTION', async (err) => {
      if (err) return reject(err);
      
      try {
        const result = await callback(db);
        db.run('COMMIT', (err) => {
          if (err) return reject(err);
          resolve(result);
        });
      } catch (error) {
        db.run('ROLLBACK', (err) => {
          if (err) {
            logger.error(`事务回滚失败: ${err.message}`);
          }
          reject(error);
        });
      }
    });
  });
}

/**
 * 优化数据库
 * @returns {Promise<void>}
 */
export function optimizeDatabase() {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    logger.info('开始优化数据库...');
    
    // 执行VACUUM操作以回收空间
    db.run('PRAGMA vacuum', (err) => {
      if (err) {
        logger.error(`数据库优化失败: ${err.message}`);
        return reject(err);
      }
      
      // 分析表以优化查询计划
      db.run('PRAGMA analyze', (err) => {
        if (err) {
          logger.error(`数据库优化失败: ${err.message}`);
          return reject(err);
        }
        
        logger.info('数据库优化完成');
        resolve();
      });
    });
  });
}