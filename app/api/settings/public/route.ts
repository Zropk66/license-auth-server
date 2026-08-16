import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: 'enable_recaptcha' },
    });

    const hasKeys = !!(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY && process.env.RECAPTCHA_SECRET_KEY);
    const enableRecaptcha = hasKeys && (setting ? setting.value === 'true' : true);

    return NextResponse.json({ enableRecaptcha });
  } catch (error) {
    console.error('Error fetching public settings:', error);
    // Default fallback to false if keys are not set
    const hasKeys = !!(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY && process.env.RECAPTCHA_SECRET_KEY);
    return NextResponse.json({ enableRecaptcha: hasKeys });
  }
}
