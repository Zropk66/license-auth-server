import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const settings = await prisma.setting.findMany({
      where: {
        key: {
          in: ['enable_recaptcha', 'unbind_enabled', 'unbind_default_allow', 'unbind_max_per_month', 'unbind_cooldown_hours', 'unbind_deduct_hours'],
        },
      },
    });

    const settingMap: Record<string, string> = {};
    settings.forEach((s) => {
      settingMap[s.key] = s.value;
    });

    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || process.env.TURNSTILE_SITE_KEY || '';
    const hasKeys = !!(siteKey && process.env.TURNSTILE_SECRET_KEY);
    const enableRecaptcha = hasKeys && (settingMap['enable_recaptcha'] !== 'false');
    const unbindEnabled = settingMap['unbind_enabled'] === 'true';
    const unbindDefaultAllow = settingMap['unbind_default_allow'] === 'true';

    return NextResponse.json({
      enableRecaptcha,
      turnstileSiteKey: siteKey,
      unbindEnabled,
      unbindDefaultAllow,
      unbindMaxPerMonth: settingMap['unbind_max_per_month'] !== undefined ? parseInt(settingMap['unbind_max_per_month'], 10) : 0,
      unbindCooldownHours: parseInt(settingMap['unbind_cooldown_hours'] || '24', 10),
      unbindDeductHours: parseInt(settingMap['unbind_deduct_hours'] || '0', 10),
    });
  } catch (error) {
    console.error('Error fetching public settings:', error);
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || process.env.TURNSTILE_SITE_KEY || '';
    const hasKeys = !!(siteKey && process.env.TURNSTILE_SECRET_KEY);
    return NextResponse.json({
      enableRecaptcha: hasKeys,
      turnstileSiteKey: siteKey,
      unbindEnabled: false,
      unbindDefaultAllow: false,
      unbindMaxPerMonth: 2,
      unbindCooldownHours: 24,
      unbindDeductHours: 0,
    });
  }
}
