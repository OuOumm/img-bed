import { getLogger } from './logger.js';
import { optimizeDatabase } from '../database/db.js';
import { cleanupAccessLogs } from '../models/image.js';
import { cleanupTempFiles } from '../services/image.js';

const logger = getLogger('scheduler');

// 定时任务配置
const TASKS = {
  // 清理访问日志（每天凌晨3点执行）
  CLEANUP_ACCESS_LOGS: {
    cronTime: '0 0 3 * * *', // 秒 分 时 日 月 周
    interval: 24 * 60 * 60 * 1000, // 24小时
    enabled: true,
    lastRun: null,
    handler: async () => {
      try {
        logger.info('开始执行访问日志清理任务');
        const days = process.env.LOG_RETENTION_DAYS || 30;
        const count = await cleanupAccessLogs(parseInt(days));
        logger.info(`访问日志清理完成，共清理 ${count} 条记录`);
      } catch (error) {
        logger.error(`访问日志清理失败: ${error.message}`);
      }
    }
  },
  
  // 清理临时文件（每6小时执行一次）
  CLEANUP_TEMP_FILES: {
    cronTime: '0 0 */6 * * *',
    interval: 6 * 60 * 60 * 1000, // 6小时
    enabled: true,
    lastRun: null,
    handler: async () => {
      try {
        logger.info('开始执行临时文件清理任务');
        const count = await cleanupTempFiles();
        logger.info(`临时文件清理完成，共清理 ${count} 个文件`);
      } catch (error) {
        logger.error(`临时文件清理失败: ${error.message}`);
      }
    }
  },
  
  // 数据库优化（每周日凌晨4点执行）
  OPTIMIZE_DATABASE: {
    cronTime: '0 0 4 * * 0',
    interval: 7 * 24 * 60 * 60 * 1000, // 7天
    enabled: true,
    lastRun: null,
    handler: async () => {
      try {
        logger.info('开始执行数据库优化任务');
        await optimizeDatabase();
        logger.info('数据库优化完成');
      } catch (error) {
        logger.error(`数据库优化失败: ${error.message}`);
      }
    }
  }
};

/**
 * 初始化定时任务
 */
export function initScheduler() {
  logger.info('初始化定时任务调度器');
  
  // 启动所有启用的任务
  for (const [taskName, task] of Object.entries(TASKS)) {
    if (task.enabled) {
      scheduleTask(taskName, task);
      logger.info(`任务 ${taskName} 已调度`);
    }
  }
}

/**
 * 调度任务
 * @param {string} taskName - 任务名称
 * @param {Object} task - 任务配置
 */
function scheduleTask(taskName, task) {
  // 使用简单的setInterval实现定时任务
  // 在生产环境中，可以考虑使用更健壮的调度库，如node-cron或node-schedule
  setInterval(async () => {
    try {
      logger.debug(`执行定时任务: ${taskName}`);
      task.lastRun = new Date();
      await task.handler();
    } catch (error) {
      logger.error(`定时任务 ${taskName} 执行失败: ${error.message}`);
    }
  }, task.interval);
}

/**
 * 手动执行任务
 * @param {string} taskName - 任务名称
 * @returns {Promise<boolean>} 执行是否成功
 */
export async function runTask(taskName) {
  try {
    const task = TASKS[taskName];
    
    if (!task) {
      throw new Error(`任务 ${taskName} 不存在`);
    }
    
    logger.info(`手动执行任务: ${taskName}`);
    task.lastRun = new Date();
    await task.handler();
    
    return true;
  } catch (error) {
    logger.error(`手动执行任务失败: ${error.message}`);
    throw error;
  }
}

/**
 * 获取所有任务状态
 * @returns {Object} 任务状态列表
 */
export function getTaskStatus() {
  const status = {};
  
  for (const [taskName, task] of Object.entries(TASKS)) {
    status[taskName] = {
      enabled: task.enabled,
      lastRun: task.lastRun,
      interval: task.interval,
      cronTime: task.cronTime
    };
  }
  
  return status;
}