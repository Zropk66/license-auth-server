import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAction } from '@/lib/audit';
import { hookScriptSchema } from '@/lib/validations';

export async function GET(req: NextRequest) {
  const authResult = await validateAdminAuth(req);
  if (!('payload' in authResult)) {
    return authResult;
  }

  try {
    const scripts = await prisma.hookScript.findMany({
      include: {
        softwares: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(scripts);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '获取脚本列表失败';
    console.error('[AdminScripts] GET error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authResult = await validateAdminAuth(req);
  if (!('payload' in authResult)) {
    return authResult;
  }

  // node:vm is not a security boundary, so authoring hook code equals server code execution
  if (authResult.payload.role !== 'owner') {
    return NextResponse.json({ error: '只有超级管理员可以管理钩子脚本' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const parseResult = hookScriptSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || '输入参数有误' },
        { status: 400 }
      );
    }

    const { name, description, script, enabled, softwareIds } = parseResult.data;

    const existing = await prisma.hookScript.findUnique({
      where: { name },
    });
    if (existing) {
      return NextResponse.json(
        { error: `脚本名称「${name}」已存在` },
        { status: 409 }
      );
    }

    const createdScript = await prisma.hookScript.create({
      data: {
        name,
        description: description || null,
        script,
        enabled,
      },
    });

    if (softwareIds && softwareIds.length > 0) {
      await prisma.software.updateMany({
        where: { id: { in: softwareIds } },
        data: { hookScriptId: createdScript.id },
      });
    }

    await logAction({
      adminId: authResult.payload.id,
      action: 'create_hook_script',
      targetType: 'hook_script',
      targetId: createdScript.id,
      details: {
        name: createdScript.name,
        boundSoftwareCount: softwareIds?.length || 0,
      },
    });

    const refreshed = await prisma.hookScript.findUnique({
      where: { id: createdScript.id },
      include: { softwares: { select: { id: true, name: true } } },
    });

    return NextResponse.json(refreshed, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '创建脚本失败';
    console.error('[AdminScripts] POST error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
