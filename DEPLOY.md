# KanaLens 云部署教程

> 🎯 目标：将 KanaLens 部署到互联网，让你的 iPhone（或任何设备）随时随地访问。
> 📖 附带学习：每一步都解释"为什么这么做"，让你同时学会网站部署的基础知识。

---

## 整体流程（5步）

```
你的电脑 → GitHub(代码仓库) → Railway(服务器) → iPhone 访问
  写代码      代码的"云盘"      应用的"房东"     随时随地使用
```

---

## 第一步：注册 GitHub（如已有账号跳过）

1. 打开 https://github.com/signup
2. 输入邮箱、密码、用户名
3. 验证邮箱

> 💡 **为什么需要 GitHub？**
> Railway 不能直接读取你电脑上的代码，它需要从一个"代码仓库"拉取。
> GitHub 就是这个作用——把你的代码存到云端，Railway 自动去取。

## 第二步：在 GitHub 创建仓库

1. 登录 https://github.com
2. 点右上角 `+` → `New repository`
3. 仓库名填写 `kanalens`（或你喜欢的名字）
4. **不要勾选** "Add a README"、"Add .gitignore" 等任何初始化选项
5. 点 `Create repository`
6. 你会看到一个页面，里面有命令。**把 `git remote add origin ...` 这一行复制下来**，后面要用。

## 第三步：推送代码到 GitHub（我来执行）

我在电脑上运行以下命令，把代码推送到你刚创建的仓库：

```bash
# 把全部代码加入暂存区
git add .

# 提交
git commit -m "第一次提交：KanaLens 完整项目"

# 连接你的 GitHub 仓库（用你第二步复制的地址替换）
git remote add origin https://github.com/你的用户名/kanalens.git

# 推送
git push -u origin master
```

> 💡 **这些命令在做什么？**
> - `git add .` — 告诉 Git "我要上传这些文件"
> - `git commit` — 打一个包，写上备注
> - `git push` — 把包上传到 GitHub

## 第四步：注册 Railway 并部署

### 4.1 注册 Railway

1. 打开 https://railway.app/login
2. 点 **Continue with GitHub**（用 GitHub 账号登录）
3. 授权后进入控制台

### 4.2 创建新项目

1. 点 `New Project`
2. 选 **Deploy from GitHub repo**
3. 如果第一次使用，需要安装 Railway GitHub App：
   - 点击 "Configure GitHub App"
   - 选择你的 `kanalens` 仓库
   - 点 `Install`
4. 回到 Railway，选择 `kanalens` 仓库
5. Railway 会自动开始部署 🎉

> 💡 **为什么不用配置服务器？**
> Railway 会自动检测这是 Next.js 项目，自动安装依赖、构建、启动。
> 这就是"平台即服务(PaaS)"——你只管代码，平台管服务器。

### 4.3 添加持久化磁盘（关键！）

**这一步非常重要！** 因为 KanaLens 用 SQLite 文件存数据，服务器重启后数据会丢失。我们需要一块"不会清空的文件夹"。

1. 在 Railway 项目页面，点你的服务（kanalens）
2. 点 `Settings` 标签
3. 往下翻到 **持久化存储** → Volume
4. 点 `Add Volume`
5. **挂载路径(Mount Path)** 填写：`/data`
6. **容量**：1GB（完全够用）
7. 点 `Add`

> 💡 **持久化是什么？**
> 普通服务器重启后，文件会被清空（就像电脑重启后内存里的东西没了）。
> 持久化磁盘就像一个外接硬盘——重启后数据还在。

### 4.4 配置环境变量

1. 还是在 `Settings` 页面
2. 找到 **Environment Variables**
3. 添加以下两个变量：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `DEEPSEEK_API_KEY` | `sk-你的DeepSeek密钥` | AI 生成文章的 API 密钥 |
| `KANALENS_DATA_DIR` | `/data` | 告诉应用把数据库文件存到持久化磁盘里 |

4. 点 `Update`

> 💡 **环境变量是什么？**
> 相当于写一张纸条贴在服务器上："数据库存在 /data 文件夹，API密钥是这个"。
> 这样敏感信息（密钥）不会写在代码里，只有服务器能看到。

### 4.5 重新部署

添加环境变量和磁盘后，项目会自动重新部署。等待约 1-2 分钟。

## 第五步：获取网址，用 iPhone 访问

1. 部署完成后，点 `Settings` → `Domains`
2. 你会看到一个 `https://kanalens-production-xxxx.up.railway.app` 的地址
3. 点它打开——如果能正常显示 KanaLens 界面，就成功了！
4. **在 iPhone 上打开 Safari，输入这个地址**，即可开始学习 🎉

> 💡 **这个地址是什么？**
> 你的应用在互联网上的"门牌号"，全世界任何设备输入这个地址都能访问。

## 日常使用指南

### 数据备份

你的学习数据存在 Railway 的持久化磁盘中。如果想备份：

1. 在 Railway 项目页面 → `Settings` → `Volume`
2. 点下载按钮，即可下载整个数据库文件

### 更新代码

如果你修改了代码想重新部署：

```bash
git add .
git commit -m "更新说明"
git push
```

Railway 会自动检测到新代码并重新部署，数据不会丢失。

### 域名绑定（可选）

如果想用自己买的好记域名（如 `kanalens.me`）：

1. 买一个域名（阿里云、腾讯云、Cloudflare 等）
2. Railway 项目 → `Settings` → `Domains` → `Custom Domain`
3. 输入你的域名，按提示配置 DNS

---

## 故障排查

| 问题 | 原因 | 解决方法 |
|------|------|---------|
| 页面一直加载中 | API 密钥未配置或无效 | 检查 `DEEPSEEK_API_KEY` 环境变量 |
| 之前的数据没了 | 持久化磁盘未挂载或路径不对 | 检查 `KANALENS_DATA_DIR=/data` 是否设置 |
| 网站打不开 | 构建失败 | 查看 Railway 的 `Deploy Logs` 找错误信息 |
| 访问很慢 | 免费服务器在日本/美国 | 用户可以接受，用起来没太大影响 |

---

## 你学到的知识

✅ GitHub — 代码版本管理和云端存储
✅ PaaS（平台即服务）— 不用管服务器，只管代码
✅ 环境变量 — 安全配置敏感信息
✅ 持久化存储 — 让数据在服务器重启后不丢失
✅ 域名和 DNS — 给应用一个好记的地址
