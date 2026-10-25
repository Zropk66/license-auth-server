-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "userHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Software" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "minVersionCode" INTEGER DEFAULT 0,
    "maxVersionCode" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Software_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "License" (
    "id" TEXT NOT NULL,
    "licenseKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "softwareName" TEXT NOT NULL,
    "expirationDate" TIMESTAMP(3) NOT NULL,
    "hwid" TEXT,
    "deviceName" TEXT,
    "hardwareBindingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "allowSelfUnbind" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'active',
    "licenseType" TEXT NOT NULL DEFAULT 'fixed',
    "duration" INTEGER,
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastUnboundAt" TIMESTAMP(3),
    "monthlyUnbindCount" INTEGER NOT NULL DEFAULT 0,
    "unbindCountMonth" TEXT,
    "extraUnbindCount" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdById" TEXT,

    CONSTRAINT "License_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Blacklist" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "reason" TEXT,
    "isAuto" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Blacklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationChannel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "events" TEXT NOT NULL DEFAULT '["all"]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoftwareVersion" (
    "id" TEXT NOT NULL,
    "softwareName" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "versionCode" INTEGER NOT NULL,
    "changelog" TEXT NOT NULL,
    "downloadUrl" TEXT NOT NULL,
    "fileHash" TEXT,
    "isForced" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SoftwareVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "softwareName" TEXT NOT NULL DEFAULT 'ALL',
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'info',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "licenseKey" TEXT NOT NULL,
    "hwid" TEXT,
    "ipAddress" TEXT,
    "lastHeartbeat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'active',
    "terminatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LicenseHardwareHistory" (
    "id" TEXT NOT NULL,
    "licenseKey" TEXT NOT NULL,
    "hwid" TEXT NOT NULL,
    "deviceName" TEXT,
    "firstBoundAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LicenseHardwareHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationAttempt" (
    "id" TEXT NOT NULL,
    "licenseKey" TEXT,
    "softwareName" TEXT,
    "hwid" TEXT,
    "deviceName" TEXT,
    "ipAddress" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_username_key" ON "Admin"("username");

-- CreateIndex
CREATE INDEX "Admin_role_idx" ON "Admin"("role");

-- CreateIndex
CREATE UNIQUE INDEX "User_userHash_key" ON "User"("userHash");

-- CreateIndex
CREATE INDEX "User_username_idx" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_createdById_idx" ON "User"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "Software_name_key" ON "Software"("name");

-- CreateIndex
CREATE INDEX "Software_enabled_idx" ON "Software"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "License_licenseKey_key" ON "License"("licenseKey");

-- CreateIndex
CREATE INDEX "License_userId_idx" ON "License"("userId");

-- CreateIndex
CREATE INDEX "License_status_idx" ON "License"("status");

-- CreateIndex
CREATE INDEX "License_licenseType_idx" ON "License"("licenseType");

-- CreateIndex
CREATE INDEX "License_status_expirationDate_idx" ON "License"("status", "expirationDate");

-- CreateIndex
CREATE INDEX "License_activatedAt_idx" ON "License"("activatedAt");

-- CreateIndex
CREATE INDEX "License_createdById_idx" ON "License"("createdById");

-- CreateIndex
CREATE INDEX "License_note_idx" ON "License"("note");

-- CreateIndex
CREATE INDEX "Blacklist_type_idx" ON "Blacklist"("type");

-- CreateIndex
CREATE INDEX "Blacklist_value_idx" ON "Blacklist"("value");

-- CreateIndex
CREATE INDEX "Blacklist_expiresAt_idx" ON "Blacklist"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Blacklist_type_value_key" ON "Blacklist"("type", "value");

-- CreateIndex
CREATE INDEX "NotificationChannel_enabled_idx" ON "NotificationChannel"("enabled");

-- CreateIndex
CREATE INDEX "SoftwareVersion_softwareName_versionCode_idx" ON "SoftwareVersion"("softwareName", "versionCode");

-- CreateIndex
CREATE INDEX "SoftwareVersion_enabled_idx" ON "SoftwareVersion"("enabled");

-- CreateIndex
CREATE INDEX "Announcement_softwareName_enabled_idx" ON "Announcement"("softwareName", "enabled");

-- CreateIndex
CREATE INDEX "Session_licenseKey_idx" ON "Session"("licenseKey");

-- CreateIndex
CREATE INDEX "Session_licenseKey_hwid_idx" ON "Session"("licenseKey", "hwid");

-- CreateIndex
CREATE INDEX "Session_status_lastHeartbeat_idx" ON "Session"("status", "lastHeartbeat");

-- CreateIndex
CREATE INDEX "Session_ipAddress_idx" ON "Session"("ipAddress");

-- CreateIndex
CREATE INDEX "LicenseHardwareHistory_licenseKey_idx" ON "LicenseHardwareHistory"("licenseKey");

-- CreateIndex
CREATE INDEX "LicenseHardwareHistory_hwid_idx" ON "LicenseHardwareHistory"("hwid");

-- CreateIndex
CREATE INDEX "LicenseHardwareHistory_lastSeenAt_idx" ON "LicenseHardwareHistory"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "LicenseHardwareHistory_licenseKey_hwid_key" ON "LicenseHardwareHistory"("licenseKey", "hwid");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_key_key" ON "Setting"("key");

-- CreateIndex
CREATE INDEX "AuditLog_adminId_idx" ON "AuditLog"("adminId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "VerificationAttempt_ipAddress_success_createdAt_idx" ON "VerificationAttempt"("ipAddress", "success", "createdAt");

-- CreateIndex
CREATE INDEX "VerificationAttempt_licenseKey_idx" ON "VerificationAttempt"("licenseKey");

-- CreateIndex
CREATE INDEX "VerificationAttempt_hwid_idx" ON "VerificationAttempt"("hwid");

-- CreateIndex
CREATE INDEX "VerificationAttempt_softwareName_idx" ON "VerificationAttempt"("softwareName");

-- CreateIndex
CREATE INDEX "VerificationAttempt_createdAt_idx" ON "VerificationAttempt"("createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_licenseKey_fkey" FOREIGN KEY ("licenseKey") REFERENCES "License"("licenseKey") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenseHardwareHistory" ADD CONSTRAINT "LicenseHardwareHistory_licenseKey_fkey" FOREIGN KEY ("licenseKey") REFERENCES "License"("licenseKey") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

