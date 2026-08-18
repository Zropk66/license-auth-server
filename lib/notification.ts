import prisma from '@/lib/prisma';

export interface AlertOptions {
  title: string;
  message: string;
  level?: 'info' | 'warning' | 'danger';
  eventType: 'rate_limit' | 'blacklist_hit' | 'admin_login' | 'bruteforce' | 'system';
  metadata?: Record<string, any>;
}

const alertThrottleMap = new Map<string, { lastSent: number; count: number }>();
const THROTTLE_WINDOW_MS = 60 * 1000;

export async function sendAlert(
  options: AlertOptions
): Promise<{ success: boolean; dispatched: number; error?: string }> {
  try {
    const channels = await prisma.notificationChannel.findMany({
      where: { enabled: true },
    });

    if (channels.length === 0) {
      return { success: true, dispatched: 0 };
    }

    const now = Date.now();
    const throttleKey = `${options.eventType}:${options.title}`;
    const throttleEntry = alertThrottleMap.get(throttleKey);

    if (throttleEntry && now - throttleEntry.lastSent < THROTTLE_WINDOW_MS) {
      throttleEntry.count += 1;
      return { success: true, dispatched: 0 };
    }

    let messageToSend = options.message;
    if (throttleEntry && throttleEntry.count > 1) {
      messageToSend += `\n(前1分钟内已合并抑制 ${throttleEntry.count} 次同类告警)`;
    }
    alertThrottleMap.set(throttleKey, { lastSent: now, count: 1 });

    const promises: Promise<any>[] = [];

    for (const channel of channels) {
      let subscribedEvents: string[] = ['all'];
      try {
        subscribedEvents = JSON.parse(channel.events);
      } catch {}

      if (
        !subscribedEvents.includes('all') &&
        !subscribedEvents.includes(options.eventType)
      ) {
        continue;
      }

      promises.push(sendToChannel(channel, options.title, messageToSend, options));
    }

    await Promise.allSettled(promises);
    return { success: true, dispatched: promises.length };
  } catch (error: any) {
    console.error('[Notification] sendAlert error:', error);
    return { success: false, dispatched: 0, error: error.message };
  }
}

export async function sendToChannel(
  channel: { type: string; url: string; secret?: string | null },
  title: string,
  message: string,
  options?: Partial<AlertOptions>
) {
  const { type, url, secret } = channel;

  if (type === 'bark') {
    const serverUrl = (url || 'https://api.day.app/push').replace(/\/+$/, '');
    const endpoint = serverUrl.endsWith('/push') ? serverUrl : `${serverUrl}/push`;
    const deviceKeys = (secret || '')
      .split(/[\n,;]+/)
      .map((k) => k.trim())
      .filter(Boolean);

    if (deviceKeys.length === 0) return;

    const promises = deviceKeys.map((key) => {
      const payload = {
        device_key: key,
        title,
        body: message,
        group: 'LicenseAuth',
        level: options?.level === 'danger' ? 'timeSensitive' : 'active',
        badge: 1,
      };

      return fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch((err) => {
        console.error(`[Notification] Bark push failed for key ${key}:`, err);
      });
    });

    return Promise.allSettled(promises);
  }

  if (type === 'telegram') {
    const botToken = secret?.trim();
    const chatIds = (url || '')
      .split(/[\n,;]+/)
      .map((id) => id.trim())
      .filter(Boolean);

    if (!botToken || chatIds.length === 0) return;

    const promises = chatIds.map((chatId) => {
      const tgUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
      return fetch(tgUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `*${title}*\n\n${message}`,
          parse_mode: 'Markdown',
        }),
      }).catch((err) => {
        console.error(`[Notification] Telegram push failed for chat ${chatId}:`, err);
      });
    });

    return Promise.allSettled(promises);
  }

  if (type === 'feishu') {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msg_type: 'text',
        content: { text: `【${title}】\n\n${message}` },
      }),
    }).catch((err) => {
      console.error('[Notification] Feishu push failed:', err);
    });
  }

  if (type === 'dingtalk') {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'text',
        text: { content: `【${title}】\n\n${message}` },
      }),
    }).catch((err) => {
      console.error('[Notification] DingTalk push failed:', err);
    });
  }

  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify({
      title,
      message,
      level: options?.level || 'info',
      eventType: options?.eventType || 'system',
      metadata: options?.metadata,
      timestamp: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }),
    }),
  }).catch((err) => {
    console.error('[Notification] Generic Webhook push failed:', err);
  });
}
