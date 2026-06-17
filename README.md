# KanaLens — 日本語集中阅读终端

AI 驱动的日语密集阅读学习工具，自动生成带语法标注、词汇解释、翻译和 JIC（Japanese Intensive Coding）句法分析的日语文章。

## 技术栈

- **框架**: Next.js 16 (App Router)
- **UI**: React 19 + Tailwind CSS 4
- **数据库**: SQLite (sql.js WASM) + Drizzle ORM
- **AI**: DeepSeek API 文章生成 + JIC 分析
- **桌面端**: Electron

## 快速开始

```bash
npm install
npm run dev
```

打开 http://localhost:3000

## 部署

本项目为 SQLite 文件数据库，需要持久化存储。推荐部署到 Railway（含 Persistent Volume）。

详见 [DEPLOY.md](DEPLOY.md)
