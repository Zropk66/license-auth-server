import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { sendToChannel } from '@/lib/notification';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await validateAdminAuth(req);
  if (!('payload' in authResult)) {
    return authResult;
  }

  try {
    const { id } = await params;
    const channel = await prisma.notificationChannel.findUnique({
      where: { id },
    });

    if (!channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    const testTitle = '🔔 授权服务通知测试';
    const testMessage = `这是一条来自授权系统 (${channel.name}) 的测试告警推送。\n发送时间: ${new Date().toLocaleString()}`;

    const res = await sendToChannel(channel, testTitle, testMessage, {
      level: 'info',
      eventType: 'system',
    });

    return NextResponse.json({
      success: true,
      message: `已向通道 [${channel.name}] 发送测试请求`,
      details: res ? 'OK' : 'Sent',
    });
  } catch (error: any) {
    console.error('[AdminNotifications] Test failed:', error);
    return NextResponse.json(
      { error: error.message || '测试推送失败' },
      { status: 500 }
    );
  }
}
