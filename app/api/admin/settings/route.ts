import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { settingsUpdateSchema, ALLOWED_SETTING_KEYS } from '@/lib/validations';
import { invalidateRateLimitConfig } from '@/lib/rate-limit';

export async function GET(req: NextRequest) {
  const authResult = await validateAdminAuth(req);
  if (!('payload' in authResult)) {
    return authResult;
  }
  try {
    const settings = await prisma.setting.findMany({
      orderBy: { key: 'asc' },
    });
    return NextResponse.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const authResult = await validateAdminAuth(req);
  if (!('payload' in authResult)) {
    return authResult;
  }

  // 仅允许 owner 角色修改系统设置
  if (authResult.payload.role !== 'owner') {
    return NextResponse.json(
      { error: 'Only the owner can modify system settings' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();

    // 统一请求体格式：支持 { settings: [{ key, value }] } 或直接数组 [{ key, value }]
    const normalizedBody = Array.isArray(body) ? { settings: body } : body;

    // 使用 zod schema 验证，只允许 ALLOWED_SETTING_KEYS 中的键
    const parseResult = settingsUpdateSchema.safeParse(normalizedBody);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || 'Invalid settings input' },
        { status: 400 }
      );
    }

    const settingsToUpdate = parseResult.data.settings;

    // 执行 upsert 事务
    await prisma.$transaction(
      settingsToUpdate.map((s) =>
        prisma.setting.upsert({
          where: { key: s.key },
          update: { value: s.value },
          create: { key: s.key, value: s.value, description: '' },
        })
      )
    );

    const updatedSettings = await prisma.setting.findMany({
      orderBy: { key: 'asc' },
    });

    // 如果更新了速率限制相关配置，刷新内存缓存
    const hasRateLimitChange = settingsToUpdate.some((s) => s.key.startsWith('rate_limit_'));
    if (hasRateLimitChange) {
      invalidateRateLimitConfig();
    }

    return NextResponse.json({ success: true, settings: updatedSettings });
  } catch (error) {
    console.error('Error updating settings:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}
