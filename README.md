# WebDAV图床系统

基于WebDAV协议的高性能图床系统，支持文件名加密，使用Node.js和SQLite构建，能够承受千万级数据。

![image](https://github.com/user-attachments/assets/207764dc-d37e-4116-9b08-4e235f3aca90)


## 功能特点

- 基于WebDAV协议，可连接各种WebDAV服务（如NextCloud、ownCloud等）
- 使用AES-256-CBC加密文件名，保障安全性
- 随机生成8位文件名+404img标识
- 使用SQLite数据库，优化配置支持千万级数据
- 完整的图片上传、获取、删除功能
- 访问统计和日志记录
- 高性能设计，支持大规模并发

## 系统要求

- Node.js 14.0.0 或更高版本
- 可访问的WebDAV服务器
- 足够的磁盘空间用于SQLite数据库和临时文件存储

## 安装

1. 克隆仓库

```bash
git clone https://github.com/yourusername/webdav-image-bed.git
cd webdav-image-bed
```

2. 安装依赖

```bash
npm install
```

3. 配置环境变量

复制`.env.example`文件为`.env`，并根据你的环境进行配置：

```bash
cp .env.example .env
```

编辑`.env`文件，填写WebDAV服务器信息和加密密钥：

```
# WebDAV配置
WEBDAV_URL=https://your-webdav-server.com/remote.php/dav/files/username/
WEBDAV_USERNAME=your_username
WEBDAV_PASSWORD=your_password

# 加密配置
ENCRYPTION_KEY=your_encryption_key_32_chars_long
ENCRYPTION_IV=your_iv_16_chars

# 服务器配置
PORT=3000
NODE_ENV=development

# 数据库配置
DB_PATH=./data/imagebed.db

# 上传配置
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760 # 10MB

# 图片配置
IMAGE_IDENTIFIER=_404img # 图片文件名标识符（用于校验文件名是否是由服务器生成）

# 日志配置
# 可选值: DEBUG, INFO, WARN, ERROR
LOG_LEVEL=INFO
```

注意：
- `ENCRYPTION_KEY`必须是32字符长度（256位）
- `ENCRYPTION_IV`必须是16字符长度（128位）

4. 启动服务

```bash
npm start
```

开发模式（自动重启）：

```bash
npm run dev
```

## API接口

### 上传图片

```
POST /api/images/upload
```

请求参数：
- `image`: 图片文件（multipart/form-data）

响应示例：

```json
{
  "success": true,
  "message": "图片上传成功",
  "data": {
    "id": 1,
    "filename": "a1b2c3d4.jpg",
    "encryptedFilename": "dGhpcyBpcyBhbiBlbmNyeXB0ZWQgZmlsZW5hbWU.jpg",
    "url": "https://your-webdav-server.com/remote.php/dav/files/username/images/a1b2c3d4.jpg",
    "size": 12345,
    "mimetype": "image/jpeg"
  }
}
```

### 获取图片信息

```
GET /api/images/:encryptedName
```

响应示例：

```json
{
  "success": true,
  "data": {
    "id": 1,
    "filename": "a1b2c3d4.jpg",
    "url": "https://your-webdav-server.com/remote.php/dav/files/username/images/a1b2c3d4.jpg",
    "size": 12345,
    "mimetype": "image/jpeg",
    "created_at": 1625097600,
    "access_count": 42
  }
}
```

### 删除图片

```
DELETE /api/images/:id
```

响应示例：

```json
{
  "success": true,
  "message": "图片删除成功"
}
```

### 获取图片列表

```
GET /api/images?page=1&limit=20&sort=created_at&order=desc
```

查询参数：
- `page`: 页码，默认1
- `limit`: 每页数量，默认20
- `sort`: 排序字段，可选值：id, filename, file_size, created_at, last_accessed_at, access_count
- `order`: 排序方向，可选值：asc, desc

响应示例：

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "filename": "a1b2c3d4.jpg",
      "url": "https://your-webdav-server.com/remote.php/dav/files/username/images/a1b2c3d4.jpg",
      "size": 12345,
      "mimetype": "image/jpeg",
      "created_at": 1625097600,
      "access_count": 42
    }
    // 更多图片...
  ],
  "pagination": {
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  }
}
```

## 数据库优化

为了支持千万级数据，系统对SQLite进行了以下优化：

1. 使用WAL（Write-Ahead Logging）模式提高并发性能
2. 创建适当的索引加速查询
3. 配置合理的缓存大小
4. 定期清理访问日志
5. 使用事务处理批量操作

## 安全性考虑

1. 文件名使用AES-256-CBC加密，增加安全性
2. 使用随机生成的文件名，避免文件名冲突
3. 实现请求限流，防止DoS攻击
4. 使用Helmet中间件设置安全HTTP头
5. 敏感配置信息存储在环境变量中

## 维护与清理

系统包含自动清理功能：

1. 定期清理过期的访问日志（默认保留30天）
2. 清理未在数据库中记录的临时文件

## 许可证

MIT
