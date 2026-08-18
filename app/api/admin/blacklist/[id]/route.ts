import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAction } from '@/lib/audit';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await validateAdminAuth(req);
  if (!('payload' in authResult)) {
    return authResult;
  }

  try {
    const { id } = await params;
    const existing = await prisma.blacklist.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Blacklist entry not found' }, { status: 404 });
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
    console.error('[AdminBlacklist] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete blacklist entry' }, { status: 500 });
  }
}
