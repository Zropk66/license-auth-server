# License Auth Server (卡密网络授权验证系统)

简体中文 | [English](./README.en.md)

这是一个基于 Next.js 开发的高性能、轻量级网络验证与卡密授权管理系统。它为独立软件开发者提供安全、稳定、开箱即用的软件授权与客户端通信验证解决方案。

系统分为 **管理员管理端** 与 **用户自助端**，并提供了一套信封加密（RSA-OAEP + AES-256-GCM）+ Ed25519 响应签名保护的客户端验证与心跳接口，中间人无法查看或篡改任何业务数据。

---

## 🌟 核心特性

### 1. 灵活的卡密双类型系统
*   **即时卡 (固定到期)**：创建后即刻生效，并在指定的到期时间准时失效。
*   **激活卡 (时长起算)**：创建时设定授权时长（如 30天/12小时），在客户端首次验证登录时激活并起算时长。
*   **非活跃自动挂起（激活卡独占）**：若客户端断开连接或关闭，验证服务器会自动判定为"非活跃"并**暂停计时**，在客户端重新连线心跳时恢复扣减，实现"用多久扣多久"的精确离线补偿。

### 2. 多维度安全防护
*   **客户端通讯信封加密（v2 协议）**：每请求生成临时会话密钥，RSA-OAEP-SHA256 公钥包裹后随 AES-256-GCM 加密载荷传输；响应同密钥加密并附 Ed25519 签名（sign-then-encrypt）。中间人只能看到随机密文，篡改任意字节即解密失败；无法解密的请求一律返回乱文，不泄露失败原因。
*   **安全验证防爆破机制**：记录客户端的每一次验证尝试。如果 5 分钟内某一 IP 发生 10 次以上验证失败（如密钥不存在、解密异常、硬件ID不匹配），系统将自动封禁该 IP 5 分钟，防止暴力穷举。
*   **登录限流保护**：管理员和用户登录端点均内置速率限制（15 分钟内最多 10 次尝试），防止密码暴力破解。
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

*   **前端 / 服务端**：Next.js 13 (App Router), React, Tailwind CSS, shadcn/ui
*   **数据库 / ORM**：PostgreSQL, Prisma ORM
*   **安全验证**：JWT (JSON Web Tokens), RSA-OAEP + AES-256-GCM 信封加密, Ed25519 响应签名, Cloudflare Turnstile 人机验证
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
    复制 `.env.example` 为 `.env`，并在其中配置你的数据库和密钥：
    ```env
    # [本地开发环境] 数据库连接地址（本地开发用，如本地 PostgreSQL 或另配的 SQL Server 等）
    DATABASE_URL="postgresql://license_auth:your-password@localhost:5432/license_auth"

    # JWT 登录鉴权密钥 (至少 16 字符)
    JWT_SECRET="your-jwt-secret-min-16-chars"

    # 客户端通讯密钥对 (运行 `npm run generate-keys` 自动生成)
    # Ed25519：验证/心跳响应签名；RSA-2048：解密客户端请求信封
    AUTH_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
    AUTH_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
    RSA_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"

    # Cloudflare Turnstile (可选)
    NEXT_PUBLIC_TURNSTILE_SITE_KEY="your-turnstile-site-key"
    TURNSTILE_SECRET_KEY="your-turnstile-secret-key"
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

1.  **克隆项目并进入目录**：
    ```bash
    git clone https://github.com/Zropk66/license-auth-server.git
    cd license-auth-server
    ```

2.  **配置环境变量**：
    复制 `.env.example` 为 `.env`，修改其中的密码和密钥为真实值：
    ```env
    # [Docker 部署环境] 以下参数用于配置 Docker compose 内部 of 数据库服务 (无需修改 DATABASE_URL)
    POSTGRES_USER=license_auth
    POSTGRES_PASSWORD=your-secure-password
    POSTGRES_DB=license_auth

    JWT_SECRET="your-jwt-secret-min-16-chars"

    # 客户端通讯密钥对 (运行 `npm run generate-keys` 自动生成)
    AUTH_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
    AUTH_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
    RSA_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
    ```
    Docker Compose 会自动使用这些变量配置并连接到内部新建的 `db` (PostgreSQL) 服务，无需手动拼装 `DATABASE_URL`。

3.  **（可选）设置首次部署保护**：
    在 `.env` 中设置 `SETUP_TOKEN`，首次创建 Owner 账号时需要提供此令牌，防止被抢注：
    ```env
    SETUP_TOKEN="your-setup-token-here"
    ```

4.  **启动容器**：
    ```bash
    docker compose up --build -d
    ```
    此命令会自动编译轻量化 Next.js Standalone 镜像、自动执行数据库迁移并拉起服务，在 `http://localhost:3000` 开放访问。

5.  **初次登录说明**：
    当数据库中无管理员账号时，初次访问后台输入任意管理员账密，系统将以此自动初始化并创建首个 Owner（主管理员）超级账号。如果设置了 `SETUP_TOKEN`，登录时需在请求中携带匹配的令牌。

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

1.  **强密钥保护**：确保 `.env` 中的 `JWT_SECRET` 足够复杂（至少 16 字符）；`AUTH_PRIVATE_KEY` / `RSA_PRIVATE_KEY` 私钥仅保留在服务端，绝不随客户端分发（客户端只内嵌公钥）。
2.  **密钥轮换**：重新运行 `npm run generate-keys --force` 后须同步更新客户端公钥（`test-client/config.json` 或 `clients/cpp/update-keys.js`），否则客户端将无法解密响应。
3.  **HTTPS 部署**：验证 API 涉及卡密和硬件验证传输，请务必配置 HTTPS 证书提供传输层加密支持。
4.  **首次部署令牌**：生产环境建议设置 `SETUP_TOKEN`，防止 Owner 账号被恶意抢注。
5.  **Turnstile**：建议配置 Cloudflare Turnstile 人机验证，防止自动化攻击。

---

## 📄 开源许可证与致谢

本项目基于 [MIT](LICENSE) 开源许可证发布。

本项目基于原作者 [Jawad Shafique](https://github.com/killcod3) 的开源项目 [license-management-system](https://github.com/killcod3/license-management-system) 进行二次开发与功能增强。感谢原作者的开源贡献。
