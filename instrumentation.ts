export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startAutoCleanup } = await import('./lib/log-cleanup');
    startAutoCleanup();
    console.info('[Instrumentation] Auto log cleanup started');
  }
}
