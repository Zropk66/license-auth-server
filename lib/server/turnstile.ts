export function isValidTurnstileToken(
  token: string | null | undefined,
  secretKey: string,
  remoteip?: string
): Promise<boolean> {
  if (!token) return Promise.resolve(false);

  const body = new URLSearchParams({
    secret: secretKey,
    response: token,
  });
  if (remoteip) {
    body.set('remoteip', remoteip);
  }

  return fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(5000),
  })
    .then((response) => response.json())
    .then((data) => data.success === true)
    .catch(() => false);
}
