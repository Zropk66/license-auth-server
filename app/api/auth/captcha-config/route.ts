import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || process.env.TURNSTILE_SITE_KEY || '';
    const secretKey = process.env.TURNSTILE_SECRET_KEY || '';
    const configured = !!(siteKey && secretKey);

    let enabled = false;
    if (configured) {
      const captchaSetting = await prisma.setting.findUnique({
        where: { key: 'enable_recaptcha' },
      });
      enabled = captchaSetting ? captchaSetting.value !== 'false' : true;
    }

    return NextResponse.json({
      enabled,
      configured,
      siteKey: enabled ? siteKey : '',
    });
  } catch {
    return NextResponse.json({
      enabled: false,
      configured: false,
      siteKey: '',
    });
  }
}
