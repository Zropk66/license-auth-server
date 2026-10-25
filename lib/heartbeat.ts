import prisma from './prisma.ts';

export interface HeartbeatIntervalInfo {
  interval: number;
  maxAllowedInterval: number;
}

export async function getHeartbeatIntervalInfo(): Promise<HeartbeatIntervalInfo> {
  const settings = await prisma.setting.findMany({
    where: {
      key: {
        in: [
          'heartbeat_interval',
          'heartbeat_random_enabled',
          'heartbeat_interval_min',
          'heartbeat_interval_max',
        ],
      },
    },
  });

  const get = (key: string, fallback: string) => {
    return settings.find((s) => s.key === key)?.value || fallback;
  };

  const isRandom = get('heartbeat_random_enabled', 'false') === 'true';

  if (isRandom) {
    const minVal = parseInt(get('heartbeat_interval_min', '20'), 10);
    const maxVal = parseInt(get('heartbeat_interval_max', '40'), 10);
    // 最小值下限 5 秒，最大值至少比最小值高 1 秒，否则随机区间退化为固定值
    const validMin = isNaN(minVal) || minVal < 5 ? 20 : minVal;
    const validMax = isNaN(maxVal) || maxVal < validMin ? validMin + 20 : maxVal;

    const interval = Math.floor(Math.random() * (validMax - validMin + 1)) + validMin;
    return { interval, maxAllowedInterval: validMax };
  }

  const fixed = parseInt(get('heartbeat_interval', '30'), 10);
  const interval = isNaN(fixed) || fixed < 5 ? 30 : fixed;
  return { interval, maxAllowedInterval: interval };
}

export async function getEffectiveHeartbeatInterval(): Promise<number> {
  const info = await getHeartbeatIntervalInfo();
  return info.interval;
}
