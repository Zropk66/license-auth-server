import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAction } from '@/lib/audit';
import { z } from 'zod';

const updateScriptSchema = z.object({
  name: z.string().trim().min(1, '请输入脚本名称').max(100).optional(),
  description: z.string().trim().max(500).nullish(),
  script: z.string().min(1, '请输入脚本代码').max(65536).optional(),
  enabled: z.boolean().optional(),
  softwareIds: z.array(z.string()).optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await validateAdminAuth(req);
  if (!('payload' in authResult)) {
    return authResult;
  }

  const { id } = await params;
  try {
    const script = await prisma.hookScript.findUnique({
      where: { id },
      include: {
        softwares: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!script) {
      return NextResponse.json({ error: '脚本不存在' }, { status: 404 });
    }

    return NextResponse.json(script);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '获取脚本详情失败';
    console.error('[AdminScriptDetail] GET error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await validateAdminAuth(req);
  if (!('payload' in authResult)) {
    return authResult;
  }

  const { id } = await params;
  try {
    const existing = await prisma.hookScript.findUnique({
      where: { id },
      include: { softwares: { select: { id: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: '脚本不存在' }, { status: 404 });
    }

    const body = await req.json();
    const parseResult = updateScriptSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || '输入参数有误' },
        { status: 400 }
      );
    }

    const { name, description, script, enabled, softwareIds } = parseResult.data;

    if (name && name !== existing.name) {
      const duplicate = await prisma.hookScript.findUnique({
        where: { name },
      });
      if (duplicate) {
        return NextResponse.json(
          { error: `脚本名称「${name}」已存在` },
          { status: 409 }
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description || null;
    if (script !== undefined) updateData.script = script;
    if (enabled !== undefined) updateData.enabled = enabled;

    await prisma.hookScript.update({
      where: { id },
      data: updateData,
    });

    if (softwareIds !== undefined) {
      await prisma.software.updateMany({
        where: { hookScriptId: id },
        data: { hookScriptId: null },
      });

      if (softwareIds.length > 0) {
        await prisma.software.updateMany({
          where: { id: { in: softwareIds } },
          data: { hookScriptId: id },
        });
      }
    }

    await logAction({
      adminId: authResult.payload.id,
      action: 'update_hook_script',
      targetType: 'hook_script',
      targetId: id,
      details: {
        name: name || existing.name,
        updatedFields: Object.keys(updateData),
        syncedSoftwareCount: softwareIds ? softwareIds.length : existing.softwares.length,
      },
    });

    const refreshed = await prisma.hookScript.findUnique({
      where: { id },
      include: { softwares: { select: { id: true, name: true } } },
    });

    return NextResponse.json(refreshed);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '更新脚本失败';
    console.error('[AdminScriptDetail] PATCH error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await validateAdminAuth(req);
  if (!('payload' in authResult)) {
    return authResult;
  }

  const { id } = await params;
  try {
    const existing = await prisma.hookScript.findUnique({
      where: { id },
    });
    if (!existing) {
      return NextResponse.json({ error: '脚本不存在' }, { status: 404 });
    }

    await prisma.software.updateMany({
      where: { hookScriptId: id },
      data: { hookScriptId: null },
    });

    await prisma.hookScript.delete({
      where: { id },
    });

    await logAction({
      adminId: authResult.payload.id,
      action: 'delete_hook_script',
      targetType: 'hook_script',
      targetId: id,
      details: {
        name: existing.name,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '删除脚本失败';
    console.error('[AdminScriptDetail] DELETE error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
