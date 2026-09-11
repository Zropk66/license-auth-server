import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { validateAdminAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAction } from '@/lib/audit';
import { batchGenerateLicenseSchema } from '@/lib/validations';
import { generateUserHash } from '@/lib/utils';

/* 生成带可选前缀的标准 16 字节十六进制分段卡密 */
function generateSingleKey(prefix?: string): string {
  const segments = [];
  for (let i = 0; i < 4; i++) {
    segments.push(crypto.randomBytes(4).toString('hex').toUpperCase());
  }
  const baseKey = segments.join('-');
  if (!prefix || !prefix.trim()) {
    return baseKey;
  }
  const cleanPrefix = prefix.trim().toUpperCase();
  return cleanPrefix.endsWith('-') ? `${cleanPrefix}${baseKey}` : `${cleanPrefix}-${baseKey}`;
}

export async function POST(req: NextRequest) {
  const authResult = await validateAdminAuth(req);
  if (!('payload' in authResult)) {
    return authResult;
  }

  try {
    const body = await req.json();
    const parseResult = batchGenerateLicenseSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || '请求参数格式错误' },
        { status: 400 }
      );
    }

    const {
      softwareName,
      count,
      licenseType,
      expirationDate,
      duration,
      hardwareBindingEnabled,
      allowSelfUnbind,
      prefix,
      userId: requestedUserId,
      note,
    } = parseResult.data;

    /* 确定绑定的用户账号，未指定时自动关联或创建专属批量默认用户 */
    let targetUserId = requestedUserId;
    if (targetUserId) {
      const userExists = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true },
      });
      if (!userExists) {
        return NextResponse.json(
          { error: '指定的用户不存在' },
          { status: 404 }
        );
      }
    } else {
      let defaultUser = await prisma.user.findFirst({
        where: { username: 'default_user' },
        select: { id: true },
      });
      if (!defaultUser) {
        defaultUser = await prisma.user.create({
          data: {
            username: 'default_user',
            userHash: generateUserHash(),
            createdById: authResult.payload.id,
          },
          select: { id: true },
        });
      }
      targetUserId = defaultUser.id;
    }

    const isDuration = licenseType === 'duration';
    const resolvedExpirationDate = isDuration ? new Date() : new Date(expirationDate!);
    const resolvedStatus = isDuration ? 'unactivated' : 'active';
    const now = new Date();

    /* 高效生成无冲突的卡密集合 */
    const keysSet = new Set<string>();
    while (keysSet.size < count) {
      keysSet.add(generateSingleKey(prefix));
    }
    const generatedKeys = Array.from(keysSet);

    /* 批量构建授权记录数据列表 */
    const licenseRecords = generatedKeys.map((key) => ({
      licenseKey: key,
      userId: targetUserId as string,
      softwareName,
      expirationDate: resolvedExpirationDate,
      hardwareBindingEnabled: !!hardwareBindingEnabled,
      allowSelfUnbind: allowSelfUnbind !== undefined ? allowSelfUnbind : true,
      status: resolvedStatus,
      licenseType,
      duration: isDuration ? duration! : null,
      activatedAt: isDuration ? null : now,
      note: note ? note.trim() : null,
      createdById: authResult.payload.id,
    }));

    /* 事务级批量写入 */
    await prisma.license.createMany({
      data: licenseRecords,
      skipDuplicates: true,
    });

    /* 记录批量制卡审计日志 */
    await logAction({
      adminId: authResult.payload.id,
      action: 'batch_generate_license',
      targetType: 'license',
      targetId: `batch_${generatedKeys.length}`,
      details: {
        softwareName,
        count: generatedKeys.length,
        licenseType,
        prefix: prefix || null,
        targetUserId,
      },
    });

    return NextResponse.json({
      success: true,
      count: generatedKeys.length,
      licenseKeys: generatedKeys,
      message: `成功生成 ${generatedKeys.length} 张卡密`,
    });
  } catch (error) {
    console.error('Error generating batch licenses:', error);
    return NextResponse.json(
      { error: '批量生成授权失败，请稍后重试' },
      { status: 500 }
    );
  }
}
