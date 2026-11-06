import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAction } from '@/lib/audit';

/* POST /api/admin/blacklist/delete — 通过 body 传入 ID 删除黑名单条目 */
export async function POST(req: NextRequest) {
  const authResult = await validateAdminAuth(req);
  if (!('payload' in authResult)) {
    return authResult;
  }

  try {
    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: '缺少条目 ID' }, { status: 400 });
    }

    const existing = await prisma.blacklist.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: '黑名单条目不存在' }, { status: 404 });
    }

    await prisma.blacklist.delete({
      where: { id },
    });

    await logAction({
      adminId: authResult.payload.id,
      action: 'remove_blacklist',
      targetType: 'blacklist',
      targetId: id,
      details: { type: existing.type, value: existing.value },
    });

    return NextResponse.json({ success: true, message: 'Removed from blacklist' });
  } catch (error) {
    console.error('[AdminBlacklist] delete error:', error);
    return NextResponse.json({ error: '删除黑名单条目失败' }, { status: 500 });
  }
}
