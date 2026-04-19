# 账号交付网页项目

这是一个适配 `Vercel + Postgres` 的账号交付项目。

## 功能

- 每个账号生成独立访问路径，格式为 `/{token}/GetHTML`
- 页面展示账号、密码、备注，并支持一键复制
- 支持在管理页直接填写自定义 HTML 内容
- 每条记录都能设置有效时长，到期后自动失效
- 管理页可手动新增和删除账号链接
- 数据存储在 Postgres，适合部署到 Vercel

## 本地启动

先准备环境变量：

```bash
cp .env.example .env.local
```

然后填写：

```bash
DATABASE_URL=你的Postgres连接串
ADMIN_SECRET=你的后台密钥
HOST=127.0.0.1
PORT=3000
```

启动：

```bash
cd /Users/zhangjiahao/Downloads/70.39.203.230_4251_20260402_131510
npm install
npm start
```

默认管理员地址：

```text
http://127.0.0.1:3000/admin?key=你的后台密钥
```

## Vercel 部署

根据 Vercel 官方文档，Vercel Functions 的文件系统是只读的，只有临时 `/tmp` 可写，因此本项目已经改成数据库方案。

官方参考：

- [Vercel Functions runtime](https://vercel.com/docs/functions/runtimes)
- [Postgres on Vercel](https://vercel.com/docs/postgres)
- [Environment variables](https://vercel.com/docs/environment-variables)
- [Deployments](https://vercel.com/docs/deployments)

### 1. 准备数据库

Vercel 官方现在推荐通过 Marketplace 连接外部 Postgres，新的项目不再使用旧版 `Vercel Postgres`。

你可以在 Vercel 项目里添加一个 Postgres 集成，例如 Neon。添加后，Vercel 会自动注入数据库环境变量。

### 2. 必填环境变量

至少确保这些变量存在：

```bash
DATABASE_URL=你的数据库连接串
ADMIN_SECRET=你自己的后台密钥
```

如果 Marketplace 自动注入的是 `POSTGRES_URL`，本项目也能识别。

### 3. 上传部署

推荐方式：

1. 把项目上传到 GitHub
2. 在 Vercel 导入这个仓库
3. 在项目设置里补充环境变量
4. 点击部署

项目已经包含：

- `api/index.js`
- `vercel.json`

所以可以直接按 Node.js Function 方式运行。

## 旧 JSON 数据导入数据库

如果你之前有老的 `data/accounts.json`，可以导入：

```bash
npm run import:json
```

也可以指定路径：

```bash
node scripts/import-json-to-db.js /你的文件路径/accounts.json
```

## 数据表结构

项目会在首次请求时自动创建表：

- `account_pages`

字段包括：

- `id`
- `token`
- `title`
- `account`
- `password`
- `note`
- `custom_html`
- `created_at`
- `expires_at`

## 注意

- `customHtml` 会按 HTML 原样渲染，适合你自己后台填写，不适合开放给陌生用户提交
- 当前管理员验证仍然是 `?key=...` 方式，适合先上线；如果后面要更正式，可以再改成后台登录系统

## 还可以继续升级

- 管理员登录账号密码
- 批量导入账号
- 一次性链接
- 访问次数限制
- 后台修改有效期
- 访问日志
