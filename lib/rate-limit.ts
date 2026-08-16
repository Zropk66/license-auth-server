// Simple in-memory rate limiter for login endpoints
// For production with multiple instances, consider using Redis instead

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const loginAttempts = new Map<string, RateLimitEntry>();
const heartbeatAttempts = new Map<string, RateLimitEntry>();

const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOGIN_MAX_ATTEMPTS = 10; // max 10 attempts per 15 minutes per IP

const HEARTBEAT_WINDOW_MS = 60 * 1000; // 1 minute
const HEARTBEAT_MAX_ATTEMPTS = 60; // max 60 per minute per IP

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

export function checkLoginRateLimit(ip: string) {
  return checkRateLimit(loginAttempts, `login:${ip}`, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS);
}

export function checkHeartbeatRateLimit(ip: string) {
  return checkRateLimit(heartbeatAttempts, `hb:${ip}`, HEARTBEAT_MAX_ATTEMPTS, HEARTBEAT_WINDOW_MS);
}

// Get client IP from request, preferring the last IP in x-forwarded-for
// (which is the IP set by the trusted reverse proxy)
export function getClientIP(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const ips = xff.split(',').map(ip => ip.trim());
    // Use the last IP (set by the trusted proxy) if multiple hops exist.
    // For a single proxy (like nginx), this is the client IP.
    return ips[ips.length - 1] || ips[0] || '127.0.0.1';
  }
  return req.headers.get('x-real-ip') || '127.0.0.1';
}

// Periodic cleanup of expired entries (call every few minutes)
export function cleanupRateLimits() {
  const now = Date.now();
  for (const [key, entry] of loginAttempts) {
    if (now > entry.resetTime) loginAttempts.delete(key);
  }
  for (const [key, entry] of heartbeatAttempts) {
    if (now > entry.resetTime) heartbeatAttempts.delete(key);
  }
}

// Run cleanup every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupRateLimits, 5 * 60 * 1000).unref?.();
}
