# License Auth Server (卡密网络授权验证系统)

简体中文 | [English](./README.en.md)

这是一个基于 Next.js 开发的高性能、轻量级网络验证与卡密授权管理系统。它为独立软件开发者提供安全、稳定、开箱即用的软件授权与客户端通信验证解决方案。

系统分为 **管理员管理端** 与 **用户自助端**，并提供了一套经过高强度 AES 加密保护的客户端验证与心跳接口。

---

## 🌟 核心特性

### 1. 灵活的卡密双类型系统
*   **即时卡 (固定到期)**：创建后即刻生效，并在指定的到期时间准时失效。
*   **激活卡 (时长起算)**：创建时设定授权时长（如 30天/12小时），在客户端首次验证登录时激活并起算时长。
*   **非活跃自动挂起（激活卡独占）**：若客户端断开连接或关闭，验证服务器会自动判定为“非活跃”并**暂停计时**，在客户端重新连线心跳时恢复扣减，实现“用多久扣多久”的精确离线补偿。

### 2. 多维度安全防护
*   **客户端通讯高强度加密**：客户端与验证 API 之间的全部数据传输都经过对称 AES-256-GCM 算法动态加密，防篡改、防抓包分析。
*   **安全验证防爆破机制**：记录客户端的每一次验证尝试。如果 5 分钟内某一 IP 发生 10 次以上验证失败（如密钥不存在、解密异常、硬件ID不匹配），系统将自动封禁该 IP 5 分钟，防止暴力穷举。
*   **硬件一机一码绑定**：支持强绑定客户端硬件 ID（硬件一机一码）。未启用硬件绑定时正常登录；已启用未绑定时首次登录自动绑定；已绑定后限制在同一台设备上使用，管理员可手动一键重置绑定关系。

### 3. 在线会话 (Session) 审计与管理
*   实时监测客户端在线心跳（最后活跃时间、登录 IP）。
*   **强制踢出功能**：管理员可在后台一键强制断开任意客户端的在线会话，客户端下次心跳时将自动下线。

### 4. 完整的管理员审计日志 (Audit Log)
*   全自动记录管理员在后台的操作动态（如：创建授权、编辑授权、重置硬件ID、冻结/解冻、撤销授权、踢出 Session、删除用户等）。
*   详细记录操作人、操作时间、变更明细，确保系统变更安全可追溯。

### 5. 易用的数据报表与数据导出
*   **仪表盘统计**：直观展示当前系统用户总数、卡密总数、实时在线用户数、即将到期卡密数。以图形直观反映最近 7 天的卡密生成与新激活趋势。
*   **一键导出 CSV**：列表页面支持对当前筛选的数据进行一键本地 CSV 导出，自动带有 UTF-8 BOM 兼容，防止 Excel 中文乱码。

---

## 🛠️ 技术栈

*   **前端 / 服务端**：Next.js 14 App Router, React, Tailwind CSS, shadcn/ui
*   **数据库 / ORM**：PostgreSQL, Prisma ORM
*   **安全验证**：JWT (JSON Web Tokens), AES-256 加密, reCAPTCHA 人机验证
*   **图表绘制**：Recharts

---

## 🚀 安装部署

### 系统要求

*   Node.js 18.0 或更高版本
*   PostgreSQL 数据库
*   npm, yarn 或 pnpm 包管理器

### 快速上手步骤

#### 方法 A：本地手动部署

1.  **克隆项目仓库**：
    ```bash
    git clone https://github.com/Zropk66/license-auth-server.git
    cd license-auth-server
    ```

2.  **安装项目依赖**：
    ```bash
    npm install
    ```

3.  **配置环境变量**：
    在项目根目录下创建一个 `.env` 环境变量文件，填入以下必要参数：
    ```env
    # 数据库连接地址
    DATABASE_URL="postgresql://username:password@localhost:5432/license_auth"

    # JWT 登录鉴权密钥 (用于后台登录会话生成)
    JWT_SECRET="your-secure-jwt-secret-key"

    # 对称加密密钥 (与客户端通讯用，需为 32 位字符)
    AES_SECRET_KEY="your-secure-aes-32char-secret-key"

    # 谷歌 reCAPTCHA (图形人机验证，可选)
    NEXT_PUBLIC_RECAPTCHA_SITE_KEY="your-recaptcha-site-key"
    RECAPTCHA_SECRET_KEY="your-recaptcha-secret-key"
    ```

4.  **初始化数据库结构**：
    ```bash
    npx prisma db push
    ```

5.  **启动开发调试服务器**：
    ```bash
    npm run dev
    ```
    打开浏览器访问 `http://localhost:3000` 即可进入系统。

#### 方法 B：使用 Docker Compose 一键部署 (推荐)

系统已完整容器化，支持使用 Docker 一键拉起 Web 服务及 PostgreSQL 数据库。

1. **克隆项目并进入目录**。
2. **修改 `docker-compose.yml` 中的环境变量**（如 `JWT_SECRET` 和 `AES_SECRET_KEY` 等）。
3. **启动容器**：
   ```bash
   docker compose up --build -d
   ```
   此命令会自动编译轻量化 Next.js Standalone 镜像、自动执行数据库迁移并拉起服务，在 `http://localhost:3000` 开放访问。

6.  **初次登录说明**：
    当数据库中无管理员账号时，初次访问后台输入任意管理员账密，系统将以此自动初始化并创建首个 Owner（主管理员）超级账号。

---

## 📦 生产打包构建

```bash
npm run build
npm run start
```

---

## 📂 数据库核心模型

*   **Admin**：管理员账号表，区分 owner (拥有者) 和 admin (协作者)。
*   **User**：用户表，每个用户拥有独立且唯一的 userHash 作为自助登录凭证。
*   **License**：授权密钥表，存储授权软件名、卡密类型、已用/设定时长、激活状态、硬件绑定 ID 等。
*   **Session**：客户端在线心跳会话表，实时记录客户端 IP 变化及心跳状态。
*   **AuditLog**：系统操作审计表，自动抓取管理员操作。
*   **VerificationAttempt**：验证防护记录表，拦截频繁暴力请求。

---

## 🔒 安全建议

1.  **强密钥保护**：确保 `.env` 中的 `AES_SECRET_KEY` 和 `JWT_SECRET` 足够复杂且保密。
2.  **HTTPS 部署**：验证 API 涉及卡密和硬件验证传输，请务必配置 HTTPS 证书提供传输层加密支持。

---

## 📄 开源许可证与致谢

本项目基于 [MIT](LICENSE) 开源许可证发布。

本项目基于原作者 [Jawad Shafique](https://github.com/killcod3) 的开源项目 [license-management-system](https://github.com/killcod3/license-management-system) 进行二次开发与功能增强。感谢原作者的开源贡献。

