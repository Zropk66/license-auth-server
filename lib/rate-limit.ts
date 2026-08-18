import prisma from './prisma';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const loginAttempts = new Map<string, RateLimitEntry>();
const heartbeatAttempts = new Map<string, RateLimitEntry>();
const verifyAttempts = new Map<string, RateLimitEntry>();

const DEFAULTS = {
  LOGIN_MAX: 10,
  LOGIN_WINDOW_MIN: 15,
  HEARTBEAT_MAX: 60,
  HEARTBEAT_WINDOW_MIN: 1,
  VERIFY_MAX: 30,
  VERIFY_WINDOW_MIN: 1,
};

interface RateLimitConfig {
  loginMax: number;
  loginWindowMs: number;
  heartbeatMax: number;
  heartbeatWindowMs: number;
  verifyMax: number;
  verifyWindowMs: number;
}

let cachedConfig: RateLimitConfig | null = null;
let configCacheTime = 0;
const CONFIG_CACHE_TTL = 60_000;

async function getRateLimitConfig(): Promise<RateLimitConfig> {
  const now = Date.now();
  if (cachedConfig && now - configCacheTime < CONFIG_CACHE_TTL) {
    return cachedConfig;
  }

  try {
    const settings = await prisma.setting.findMany({
      where: {
        key: {
          in: [
            'rate_limit_login_max',
            'rate_limit_login_window_min',
            'rate_limit_verify_max',
            'rate_limit_verify_window_min',
            'rate_limit_heartbeat_max',
            'rate_limit_heartbeat_window_min',
          ],
        },
      },
    });

    const get = (key: string, fallback: number) => {
      const val = settings.find((s) => s.key === key)?.value;
      const num = val ? parseInt(val, 10) : fallback;
      return (isNaN(num) || num <= 0) ? fallback : num;
    };

    cachedConfig = {
      loginMax: get('rate_limit_login_max', DEFAULTS.LOGIN_MAX),
      loginWindowMs: get('rate_limit_login_window_min', DEFAULTS.LOGIN_WINDOW_MIN) * 60 * 1000,
      heartbeatMax: get('rate_limit_heartbeat_max', DEFAULTS.HEARTBEAT_MAX),
      heartbeatWindowMs: get('rate_limit_heartbeat_window_min', DEFAULTS.HEARTBEAT_WINDOW_MIN) * 60 * 1000,
      verifyMax: get('rate_limit_verify_max', DEFAULTS.VERIFY_MAX),
      verifyWindowMs: get('rate_limit_verify_window_min', DEFAULTS.VERIFY_WINDOW_MIN) * 60 * 1000,
    };
    configCacheTime = now;
    return cachedConfig;
  } catch {
    return {
      loginMax: DEFAULTS.LOGIN_MAX,
      loginWindowMs: DEFAULTS.LOGIN_WINDOW_MIN * 60 * 1000,
      heartbeatMax: DEFAULTS.HEARTBEAT_MAX,
      heartbeatWindowMs: DEFAULTS.HEARTBEAT_WINDOW_MIN * 60 * 1000,
      verifyMax: DEFAULTS.VERIFY_MAX,
      verifyWindowMs: DEFAULTS.VERIFY_WINDOW_MIN * 60 * 1000,
    };
  }
}

export function invalidateRateLimitConfig() {
  cachedConfig = null;
}

function checkRateLimit(
  store: Map<string, RateLimitEntry>,
  key: string,
  maxAttempts: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetTime) {
    store.set(key, { count: 1, resetTime: now + windowMs });
    return { allowed: true, remaining: maxAttempts - 1, resetIn: windowMs };
  }

  entry.count++;
  if (entry.count > maxAttempts) {
    return { allowed: false, remaining: 0, resetIn: entry.resetTime - now };
  }

  return { allowed: true, remaining: maxAttempts - entry.count, resetIn: entry.resetTime - now };
}

export async function checkLoginRateLimit(ip: string) {
  const config = await getRateLimitConfig();
  return checkRateLimit(loginAttempts, `login:${ip}`, config.loginMax, config.loginWindowMs);
}

export async function checkHeartbeatRateLimit(ip: string) {
  const config = await getRateLimitConfig();
  return checkRateLimit(heartbeatAttempts, `hb:${ip}`, config.heartbeatMax, config.heartbeatWindowMs);
}

export async function checkVerifyRateLimit(ip: string) {
  const config = await getRateLimitConfig();
  return checkRateLimit(verifyAttempts, `verify:${ip}`, config.verifyMax, config.verifyWindowMs);
}

export function createRateLimitResponse(resetInMs: number) {
  const retryAfterSeconds = Math.max(1, Math.ceil(resetInMs / 1000));
  return Response.json(
    {
      error: 'Too many requests, please try again later',
      retryAfter: retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        'Retry-After': retryAfterSeconds.toString(),
      },
    }
  );
}

export function getClientIP(req: Request): string {
  const realIp = req.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }

  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const ips = xff.split(',').map(ip => ip.trim());
    return ips[0] || '127.0.0.1';
  }
  return '127.0.0.1';
}

export function cleanupRateLimits() {
  const now = Date.now();
  for (const [key, entry] of loginAttempts) {
    if (now > entry.resetTime) loginAttempts.delete(key);
  }
  for (const [key, entry] of heartbeatAttempts) {
    if (now > entry.resetTime) heartbeatAttempts.delete(key);
  }
  for (const [key, entry] of verifyAttempts) {
    if (now > entry.resetTime) verifyAttempts.delete(key);
  }
}

if (typeof setInterval !== 'undefined') {
  setInterval(cleanupRateLimits, 5 * 60 * 1000).unref?.();
}
