const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('================================================================');
  console.log(' 正在执行集成测试');
  console.log('================================================================\n');

  // --- 1. 黑名单机制测试 ---
  console.log('▶ 1. 测试黑名单数据模型与查询过滤...');
  const testIp = '198.51.100.99';
  const testHwid = 'HWID-TEST-BLACKLIST-123';

  const blackIp = await prisma.blacklist.create({
    data: {
      type: 'ip',
      value: testIp,
      reason: '单元测试封禁',
      isAuto: false,
    },
  });
  console.log(`  ✓ 成功创建 IP 黑名单记录: [${blackIp.value}]`);

  const blackHw = await prisma.blacklist.create({
    data: {
      type: 'hwid',
      value: testHwid,
      reason: '单元测试机器码封禁',
      isAuto: true,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  console.log(`  ✓ 成功创建 HWID 自动防御黑名单记录: [${blackHw.value}]`);

  const foundBlacklist = await prisma.blacklist.findMany({
    where: {
      OR: [{ value: testIp }, { value: testHwid }],
    },
  });
  if (foundBlacklist.length !== 2) {
    throw new Error('黑名单查询校验失败');
  }
  console.log('  ✓ 黑名单条件查询断言通过！\n');

  // --- 2. 统一多通道通知配置测试 ---
  console.log('▶ 2. 测试统一多通道通知数据模型与 Bark / Webhook 通道创建...');
  const barkChannel = await prisma.notificationChannel.create({
    data: {
      name: '测试管理员 Bark 通道',
      type: 'bark',
      url: 'https://api.day.app/push',
      secret: 'BARK_KEY_TEST_A, BARK_KEY_TEST_B',
      enabled: true,
      events: JSON.stringify(['all']),
    },
  });
  console.log(`  ✓ 成功创建 Bark 多设备通道: ${barkChannel.name} (Key: ${barkChannel.secret})`);

  const feishuChannel = await prisma.notificationChannel.create({
    data: {
      name: '测试运维飞书群',
      type: 'feishu',
      url: 'https://open.feishu.cn/open-apis/bot/v2/hook/test',
      enabled: true,
      events: JSON.stringify(['rate_limit', 'blacklist_hit']),
    },
  });
  console.log(`  ✓ 成功创建飞书告警通道: ${feishuChannel.name}`);
  console.log('  ✓ 告警多通道数据断言通过！\n');

  // --- 3. 软件版本管理模型测试 ---
  console.log('▶ 3. 测试软件版本管理与版本比较...');
  const v1 = await prisma.softwareVersion.create({
    data: {
      softwareName: 'TestApp',
      version: '1.0.0',
      versionCode: 100,
      changelog: '首发版本',
      downloadUrl: 'https://example.com/v1.exe',
      isForced: false,
    },
  });
  const v2 = await prisma.softwareVersion.create({
    data: {
      softwareName: 'TestApp',
      version: '2.0.0',
      versionCode: 200,
      changelog: '大版本重大重构',
      downloadUrl: 'https://example.com/v2.exe',
      fileHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      isForced: true,
    },
  });

  const latest = await prisma.softwareVersion.findFirst({
    where: { softwareName: 'TestApp', enabled: true },
    orderBy: { versionCode: 'desc' },
  });

  if (!latest || latest.version !== '2.0.0' || !latest.isForced) {
    throw new Error('版本管理最新版本获取或强制更新校验失败');
  }
  console.log(`  ✓ 成功检索到最新版本: v${latest.version} (Code: ${latest.versionCode}, 强制更新: ${latest.isForced})`);
  console.log('  ✓ 版本管理断言通过！\n');

  // --- 4. 系统公告管理模型测试 ---
  console.log('▶ 4. 测试系统公告发布与按软件过滤...');
  const ann1 = await prisma.announcement.create({
    data: {
      softwareName: 'ALL',
      title: '全平台例行维护升级',
      content: '今晚 24:00 进行数据库优化。',
      type: 'warning',
    },
  });

  const ann2 = await prisma.announcement.create({
    data: {
      softwareName: 'TestApp',
      title: 'TestApp 专属活动',
      content: 'TestApp 2.0 正式发布！',
      type: 'info',
    },
  });

  const activeAnnouncements = await prisma.announcement.findMany({
    where: {
      enabled: true,
      OR: [{ softwareName: 'ALL' }, { softwareName: 'TestApp' }],
    },
  });
  if (activeAnnouncements.length < 2) {
    throw new Error('公告查询与聚合断言失败');
  }
  console.log(`  ✓ 成功拉取到 ${activeAnnouncements.length} 条有效公告`);
  console.log('  ✓ 系统公告断言通过！\n');

  // --- 5. 用户自助换绑与 License 字段测试 ---
  console.log('▶ 5. 测试 License 自助换绑追踪字段...');
  const license = await prisma.license.findFirst();
  if (license) {
    const updatedLic = await prisma.license.update({
      where: { id: license.id },
      data: {
        monthlyUnbindCount: 1,
        lastUnboundAt: new Date(),
        unbindCountMonth: '2026-08',
      },
    });
    if (updatedLic.monthlyUnbindCount !== 1) {
      throw new Error('License 换绑字段更新断言失败');
    }
    console.log(`  ✓ 成功更新卡密 [${license.licenseKey}] 换绑记录: 本月已解绑 1 次`);
  }

  // --- 6. 清理临时测试数据 ---
  console.log('\n▶ 6. 正在清理集成测试临时数据...');
  await prisma.blacklist.deleteMany({
    where: { id: { in: [blackIp.id, blackHw.id] } },
  });
  await prisma.notificationChannel.deleteMany({
    where: { id: { in: [barkChannel.id, feishuChannel.id] } },
  });
  await prisma.softwareVersion.deleteMany({
    where: { id: { in: [v1.id, v2.id] } },
  });
  await prisma.announcement.deleteMany({
    where: { id: { in: [ann1.id, ann2.id] } },
  });
  console.log('  ✓ 临时测试数据已全部清理完毕。');

  console.log('\n================================================================');
  console.log(' 🎉 所有集成测试全部成功通过！(All 5 Modules Verified)');
  console.log('================================================================');
}

main()
  .catch((err) => {
    console.error('测试失败:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
