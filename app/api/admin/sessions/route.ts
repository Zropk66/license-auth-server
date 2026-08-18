import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { paginationSchema } from '@/lib/validations';
import { logAction } from '@/lib/audit';

export async function GET(req: NextRequest) {
  const authResult = await validateAdminAuth(req);
  if (!('payload' in authResult)) {
    return authResult;
  }

  try {
    const url = new URL(req.url);
    const pageParam = url.searchParams.get('page');

    // 获取会话超时设置
    const timeoutSetting = await prisma.setting.findUnique({
      where: { key: 'session_timeout' },
    });
    const sessionTimeoutSeconds = timeoutSetting ? parseInt(timeoutSetting.value, 10) : 300;
    const activeTimeoutAgo = new Date(Date.now() - sessionTimeoutSeconds * 1000);
    const offlineGraceAgo = new Date(Date.now() - (sessionTimeoutSeconds + 60) * 1000);
    const terminatedGraceAgo = new Date(Date.now() - 60 * 1000);

    const where = {
      OR: [
        {
          status: 'active',
          lastHeartbeat: { gte: activeTimeoutAgo },
        },
        {
          status: 'active',
          lastHeartbeat: {
            lt: activeTimeoutAgo,
            gte: offlineGraceAgo,
          },
        },
        {
          status: 'terminated',
          terminatedAt: { gte: terminatedGraceAgo },
        },
      ],
    };

    // 未提供 page 参数时返回全部数据（数组格式），保持前端兼容
    if (pageParam === null) {
      const sessions = await prisma.session.findMany({
        where,
        include: {
          license: {
            include: {
              user: {
                select: {
                  username: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc', // 按创建时间降序
        },
      });

      return NextResponse.json(
        sessions.map(session => ({
          id: session.id,
          licenseKey: session.licenseKey,
          username: session.license.user.username,
          softwareName: session.license.softwareName,
          hwid: session.hwid,
          ipAddress: session.ipAddress,
          lastHeartbeat: session.lastHeartbeat,
          status: session.status,
          terminatedAt: session.terminatedAt,
          createdAt: session.createdAt,
        }))
      );
    }

    // 分页模式
    const parseResult = paginationSchema.safeParse({
      page: url.searchParams.get('page') || undefined,
      pageSize: url.searchParams.get('pageSize') || undefined,
    });
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || 'Invalid pagination parameters' },
        { status: 400 }
      );
    }
    const { page, pageSize } = parseResult.data;

    const [sessions, total] = await Promise.all([
      prisma.session.findMany({
        where,
        include: {
          license: {
            include: {
              user: {
                select: {
                  username: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.session.count({ where }),
    ]);

    return NextResponse.json({
      data: sessions.map(session => ({
        id: session.id,
        licenseKey: session.licenseKey,
        username: session.license.user.username,
        softwareName: session.license.softwareName,
        hwid: session.hwid,
        ipAddress: session.ipAddress,
        lastHeartbeat: session.lastHeartbeat,
        status: session.status,
        terminatedAt: session.terminatedAt,
        createdAt: session.createdAt,
      })),
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error('Error fetching sessions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sessions' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const authResult = await validateAdminAuth(req);
  if (!('payload' in authResult)) {
    return authResult;
  }

  try {
    const url = new URL(req.url);
    let sessionId = url.searchParams.get('id') || url.searchParams.get('sessionId');

    if (!sessionId) {
      try {
        const body = await req.json();
        sessionId = body.id || body.sessionId;
      } catch (e) {
        // 请求体可能不存在或不是有效 JSON
      }
    }

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      );
    }

    // 先检查会话是否存在
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // 软终止：将状态设为 terminated 而非物理删除，并写入终止下线时间
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        status: 'terminated',
        terminatedAt: new Date(),
      },
    });

    // 记录审计日志
    await logAction({
      adminId: authResult.payload.id,
      action: 'kick_session',
      targetType: 'session',
      targetId: sessionId,
      details: { licenseKey: session.licenseKey, hwid: session.hwid },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error terminating session:', error);
    return NextResponse.json(
      { error: 'Failed to terminate session' },
      { status: 500 }
    );
  }
}
