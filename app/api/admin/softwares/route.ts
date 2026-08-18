import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAction } from '@/lib/audit';
import { createSoftwareSchema } from '@/lib/validations';

export async function GET(req: NextRequest) {
  const authResult = await validateAdminAuth(req);
  if (!('payload' in authResult)) {
    return authResult;
  }

  try {
    const { searchParams } = new URL(req.url);
    const enabledOnly = searchParams.get('enabledOnly') === 'true';

    // 检查是否存在已建软件，若为空则自动提取 License/SoftwareVersion 历史软件名初始化
    const totalCount = await prisma.software.count();
    if (totalCount === 0) {
      const [licenseSoftwares, versionSoftwares] = await Promise.all([
        prisma.license.findMany({ select: { softwareName: true }, distinct: ['softwareName'] }),
        prisma.softwareVersion.findMany({ select: { softwareName: true }, distinct: ['softwareName'] }),
      ]);
      const distinctNames = Array.from(
        new Set([
          ...licenseSoftwares.map((l) => l.softwareName.trim()),
          ...versionSoftwares.map((v) => v.softwareName.trim()),
        ])
      ).filter(Boolean);

      for (const name of distinctNames) {
        await prisma.software.upsert({
          where: { name },
          update: {},
          create: { name, enabled: true },
        });
      }
    }

    const where: any = {};
    if (enabledOnly) {
      where.enabled = true;
    }

    const softwares = await prisma.software.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }],
    });

    // 聚合统计关联的许可证数量及版本数量
    const softwareListWithCounts = await Promise.all(
      softwares.map(async (s) => {
        const [licenseCount, versionCount] = await Promise.all([
          prisma.license.count({ where: { softwareName: s.name } }),
          prisma.softwareVersion.count({ where: { softwareName: s.name } }),
        ]);
        return {
          id: s.id,
          name: s.name,
          code: s.code,
          description: s.description,
          enabled: s.enabled,
          licenseCount,
          versionCount,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
        };
      })
    );

    return NextResponse.json(softwareListWithCounts);
  } catch (error: any) {
    console.error('[AdminSoftwares] GET error:', error);
    return NextResponse.json(
      { error: error.message || '获取软件列表失败' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const authResult = await validateAdminAuth(req);
  if (!('payload' in authResult)) {
    return authResult;
  }

  try {
    const body = await req.json();
    const parseResult = createSoftwareSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || '输入参数有误' },
        { status: 400 }
      );
    }

    const { name, code, description, enabled } = parseResult.data;
    const trimmedName = name.trim();

    // 检查名称唯一性
    const existing = await prisma.software.findUnique({
      where: { name: trimmedName },
    });

    if (existing) {
      return NextResponse.json(
        { error: `软件名称「${trimmedName}」已存在，请勿重复添加` },
        { status: 409 }
      );
    }

    const software = await prisma.software.create({
      data: {
        name: trimmedName,
        code: code?.trim() || null,
        description: description?.trim() || null,
        enabled: enabled ?? true,
      },
    });

    await logAction({
      adminId: authResult.payload.id,
      action: 'create_software',
      targetType: 'software',
      targetId: software.id,
      details: { name: software.name, code: software.code },
    });

    return NextResponse.json(software, { status: 201 });
  } catch (error: any) {
    console.error('[AdminSoftwares] POST error:', error);
    return NextResponse.json(
      { error: error.message || '创建软件失败' },
      { status: 500 }
    );
  }
}
