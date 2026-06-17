# API 文档协作编写平台

一个专门针对 API 文档和开发者指南场景的技术文档协作平台。

## ✨ 功能特性

- **📚 模块化文档组织**：按模块分组管理 API 接口
- **🔧 交互式调试**：在页面内填写参数发起真实请求，实时查看返回值
- **💻 多语言代码示例**：自动生成 cURL、Python、JavaScript 等多种语言的调用代码
- **👥 多人协作**：支持多人同时编辑，保留完整版本历史
- **💬 评论讨论**：可对文档、模块、接口任意层级添加评论
- **🌐 一键发布**：支持公开站点发布或仅内部可见
- **📝 Changelog 自动更新**：文档变更自动记录更新日志
- **📧 订阅通知**：开发者可订阅文档更新，变更时收到邮件通知
- **📥 OpenAPI 导入**：支持从 OpenAPI/Swagger 规范文件自动生成文档结构

## 🛠 技术栈

### 后端
- Node.js + Express + TypeScript
- SQLite (better-sqlite3)
- JWT 身份认证
- bcryptjs 密码加密

### 前端
- React 18 + TypeScript
- Ant Design 5
- Vite 构建工具
- React Router 路由
- Zustand 状态管理
- Axios HTTP 客户端

## 🚀 快速开始

### 环境要求
- Node.js >= 18
- npm >= 9

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

启动后：
- 前端服务：http://localhost:5173
- 后端 API：http://localhost:3001

### 生产构建

```bash
npm run build
npm run start
```

## 📁 项目结构

```
.
├── server/                 # 后端服务
│   ├── src/
│   │   ├── index.ts        # 入口文件
│   │   ├── db.ts           # 数据库初始化
│   │   ├── auth.ts         # 认证中间件
│   │   ├── types.ts        # 类型定义
│   │   └── routes/         # API 路由
│   │       ├── auth.ts
│   │       ├── documents.ts
│   │       ├── modules.ts
│   │       ├── endpoints.ts
│   │       ├── comments.ts
│   │       ├── versions.ts
│   │       └── api.ts
│   └── data/               # SQLite 数据库文件
├── client/                 # 前端应用
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── api.ts          # API 请求封装
│       ├── store.ts        # Zustand 状态
│       ├── types.ts        # 类型定义
│       ├── codeGen.ts      # 多语言代码生成
│       ├── pages/          # 页面组件
│       └── components/     # 通用组件
└── package.json
```

## 📖 使用说明

1. **注册账号**：访问 http://localhost:5173/register 注册
2. **创建文档**：点击「新建文档」或「导入 OpenAPI」
3. **组织模块**：在文档编辑器左侧新建模块
4. **添加接口**：为每个模块添加 API 接口，填写请求方法、路径、参数等
5. **在线调试**：在「在线调试」Tab 中填写参数，直接发送请求测试
6. **发布文档**：在「文档设置」中将可见性改为「公开」，即可通过 `/public/:id` 公开访问
7. **订阅更新**：其他开发者可在「发布与分享」中订阅邮件通知

## 🔌 API 概览

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/auth/register` | POST | 用户注册 |
| `/api/auth/login` | POST | 用户登录 |
| `/api/documents` | GET/POST | 文档列表/创建 |
| `/api/documents/:id` | GET/PUT/DELETE | 文档详情/更新/删除 |
| `/api/documents/:id/modules` | POST | 创建模块 |
| `/api/modules/:id/endpoints` | POST | 创建接口 |
| `/api/proxy` | POST | API 请求代理（调试用） |
| `/api/:id/import-openapi` | POST | 导入 OpenAPI 规范 |

## 📝 License

MIT
