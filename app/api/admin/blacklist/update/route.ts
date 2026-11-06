import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAction } from '@/lib/audit';

/* POST /api/admin/blacklist/update — 编辑黑名单条目的原因与过期时间 */
export async function POST(req: NextRequest) {
  const authResult = await validateAdminAuth(req);
  if (!('payload' in authResult)) {
    return authResult;
  }

  try {
    const body = await req.json();
    const { id, reason, days } = body;

    if (!id) {
      return NextResponse.json({ error: '缺少条目 ID' }, { status: 400 });
    }

    const existing = await prisma.blacklist.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: '黑名单条目不存在' }, { status: 404 });
    }

    let expiresAt: Date | null = null;
    if (days !== undefined) {
      if (days !== null && Number(days) > 0) {
        expiresAt = new Date(Date.now() + Number(days) * 24 * 60 * 60 * 1000);
      }
    } else {
      expiresAt = existing.expiresAt;
    }

    const updated = await prisma.blacklist.update({
      where: { id },
      data: {
        reason: reason?.trim() || existing.reason,
        expiresAt,
      },
    });

    await logAction({
      adminId: authResult.payload.id,
      action: 'edit_blacklist',
      targetType: 'blacklist',
      targetId: id,
      details: {
        type: existing.type,
        value: existing.value,
        reason: updated.reason,
        expiresAt,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[AdminBlacklist] update error:', error);
    return NextResponse.json({ error: '更新黑名单失败' }, { status: 500 });
  }
}
