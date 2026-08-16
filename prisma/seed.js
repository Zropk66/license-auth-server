const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const defaultSettings = [
    {
      key: 'heartbeat_interval',
      value: '30',
      description: 'Default client heartbeat interval in seconds',
    },
    {
      key: 'session_timeout',
      value: '300',
      description: 'Session offline timeout threshold in seconds, default 5 mins',
    },
    {
      key: 'enable_recaptcha',
      value: 'true',
      description: '是否启用验证码验证(登录界面)',
    },
  ];

  for (const setting of defaultSettings) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    });
  }
  console.log('Seed settings successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
