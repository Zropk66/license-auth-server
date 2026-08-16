import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: 'enable_recaptcha' },
    });

    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || process.env.TURNSTILE_SITE_KEY || '';
    const hasKeys = !!(siteKey && process.env.TURNSTILE_SECRET_KEY);
    const enableRecaptcha = hasKeys && (setting ? setting.value === 'true' : true);

    return NextResponse.json({ enableRecaptcha, turnstileSiteKey: siteKey });
  } catch (error) {
    console.error('Error fetching public settings:', error);
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || process.env.TURNSTILE_SITE_KEY || '';
    const hasKeys = !!(siteKey && process.env.TURNSTILE_SECRET_KEY);
    return NextResponse.json({ enableRecaptcha: hasKeys, turnstileSiteKey: siteKey });
  }
}
