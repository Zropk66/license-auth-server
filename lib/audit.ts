import prisma from '@/lib/prisma';

export async function logAction({
  adminId,
  action,
  targetType,
  targetId,
  details,
}: {
  adminId?: string | null;
  action: string;
  targetType: string;
  targetId: string;
  details?: Record<string, unknown>;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        adminId: adminId ?? null,
        action,
        targetType,
        targetId,
        details: details ? JSON.stringify(details) : null,
      },
    });
  } catch (err) {
    // Log to stderr with context so failures are visible, but don't crash the request
    console.error('[AUDIT-LOG-FAILED]', {
      action,
      targetType,
      targetId,
      adminId: adminId ?? null,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
