# License Auth Server

[简体中文](./README.md) | English

A high-performance, lightweight web-based network verification and license key authorization management system built with Next.js. It provides an out-of-the-box, secure software licensing and client communication verification solution for independent developers.

This system features separate **Admin Management Portal** and **User Self-Service Portal**, along with a robust, AES-encrypted API client verification and heartbeat system.

---

## 🌟 Core Features

### 1. Flexible Dual License Types
*   **Fixed-Date Cards**: Effective immediately upon creation and expires precisely at the specified expiration date.
*   **Activation-Duration Cards**: Configured with a duration (e.g., 30 days or 12 hours) upon creation. It activates and starts counting down upon the client's first login.
*   **Idle Suspension & Offline Compensation (Duration Card Exclusive)**: If a client goes offline or closes the application, the server automatically suspends the licensing countdown. Time consumption resumes only when client heartbeat reconnects, ensuring billing occurs only during active usage.

### 2. Multi-Dimensional Security & Abuse Mitigation
*   **Encrypted Client Communication**: All API communication between client and server is encrypted using symmetric AES-256-GCM, preventing request tampering and interception.
*   **Brute-force/Abuse Mitigation**: Tracks all verification attempts. If an IP fails verification (e.g., non-existent keys, decryption failure, hardware mismatch) more than 10 times within 5 minutes, it is automatically banned for 5 minutes.
*   **Hardware ID (HWID) Binding**: Enforces strict device-level binding. Supports optional HWID binding: first login binds automatically when enabled, subsequent logins are limited to the bound device. Admins can manually reset hardware bindings at any time.

### 3. Active Session Management
*   Real-time client session status audit (Last Heartbeat, IP Address, HWID).
*   **Force Kickout**: Admin can forcibly terminate any active client session, kicking the client offline at the next heartbeat.

### 4. Admin Audit Logs
*   Automatically tracks and records admin write operations (e.g., creating/editing licenses, resetting HWIDs, suspending/resuming/revoking licenses, deleting users, terminating sessions).
*   Logs actor name, action timestamp, and change details to ensure strict system traceabilty.

### 5. Data Visualization & Export
*   **Stats Dashboard**: Clear counters for users, licenses, active sessions, and licenses expiring within 30 days. Weekly trends graph for license creation and activation.
*   **CSV Data Export**: One-click client-side export for filtered lists with UTF-8 BOM compatibility to prevent Excel character corruption.

---

## 🛠️ Tech Stack

*   **Frontend / Backend**: Next.js 14 App Router, React, Tailwind CSS, shadcn/ui
*   **Database / ORM**: PostgreSQL, Prisma ORM
*   **Security & Verification**: JWT, AES-256, Google reCAPTCHA
*   **Data Charts**: Recharts

---

## 🚀 Installation & Getting Started

### Prerequisites

*   Node.js 18.0 or higher
*   PostgreSQL database
*   npm, yarn, or pnpm package manager

### Installation Steps

#### Option A: Local Manual Deployment

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/Zropk66/license-auth-server.git
    cd license-auth-server
    ```

2.  **Install Dependencies**:
    ```bash
    npm install
    ```

3.  **Setup Environment Variables**:
    Create a `.env` file in the root directory and configure the following variables:
    ```env
    # Database URL
    DATABASE_URL="postgresql://username:password@localhost:5432/license_auth"

    # JWT Authentication Secret
    JWT_SECRET="your-secure-jwt-secret-key"

    # AES 32-character Encryption Key
    AES_SECRET_KEY="your-secure-aes-32char-secret-key"

    # Google reCAPTCHA (Optional)
    NEXT_PUBLIC_RECAPTCHA_SITE_KEY="your-recaptcha-site-key"
    RECAPTCHA_SECRET_KEY="your-recaptcha-secret-key"
    ```

4.  **Sync Database Schema**:
    ```bash
    npx prisma db push
    ```

5.  **Run Development Server**:
    ```bash
    npm run dev
    ```
    Open `http://localhost:3000` to access the system.

#### Option B: Docker Compose One-Click Deployment (Recommended)

The project is fully containerized, allowing you to run both the Web app and PostgreSQL database with a single command.

1. **Clone the repository and navigate into the directory**.
2. **Modify environment variables in `docker-compose.yml`** (e.g., `JWT_SECRET`, `AES_SECRET_KEY`).
3. **Start the containers**:
   ```bash
   docker compose up --build -d
   ```
   This command builds a lightweight Next.js Standalone production image, automatically runs database migrations, and exposes the app at `http://localhost:3000`.

6.  **First-time Login**:
    If no admin accounts exist, the system will automatically create the first Owner account using the credentials you input on the first login screen.

---

## 📦 Production Build

```bash
npm run build
npm run start
```

---

## 📂 Database Schema Overview

*   **Admin**: Admin accounts (roles: owner, admin).
*   **User**: End-users with unique userHash login credentials.
*   **License**: License key records (type, duration, status, bound HWID).
*   **Session**: Active client heartbeat sessions.
*   **AuditLog**: Logs for admin operations.
*   **VerificationAttempt**: Security logs tracking failed/successful authorization verification attempts.

---

## 📄 License & Acknowledgements

This project is licensed under the [MIT License](LICENSE).

This project is based on and extends the original open-source project [license-management-system](https://github.com/killcod3/license-management-system) by [Jawad Shafique](https://github.com/killcod3). Thanks to the original author for their open-source contributions.

