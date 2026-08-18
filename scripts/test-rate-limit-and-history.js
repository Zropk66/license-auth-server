const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== 1. 验证 Prisma 数据库模型与 LicenseHardwareHistory 映射 ===');

  // 查找一个测试 license
  const license = await prisma.license.findFirst({
    include: {
      hardwareHistories: true,
    },
  });

  if (!license) {
    console.log('未找到测试 License，跳过数据关联写入测试');
    return;
  }

  console.log(`找到测试卡密: ${license.licenseKey}`);
  console.log(`当前HWID: ${license.hwid || '无'}`);
  console.log(`历史设备记录数: ${license.hardwareHistories.length}`);

  // 模拟记录一次历史设备
  const testHwId = 'HW-TEST-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  console.log(`\n=== 2. 模拟写入新HWID 绑定历史: ${testHwId} ===`);

  const historyRecord = await prisma.licenseHardwareHistory.upsert({
    where: {
      licenseKey_hwid: {
        licenseKey: license.licenseKey,
        hwid: testHwId,
      },
    },
    create: {
      licenseKey: license.licenseKey,
      hwid: testHwId,
      firstBoundAt: new Date(),
      lastSeenAt: new Date(),
    },
    update: {
      lastSeenAt: new Date(),
    },
  });

  console.log('✓ 历史记录写入成功:', {
    id: historyRecord.id,
    licenseKey: historyRecord.licenseKey,
    hwid: historyRecord.hwid,
    firstBoundAt: historyRecord.firstBoundAt,
    lastSeenAt: historyRecord.lastSeenAt,
  });

  // 验证关联查询
  const updatedLicense = await prisma.license.findUnique({
    where: { id: license.id },
    include: {
      hardwareHistories: {
        orderBy: { lastSeenAt: 'desc' },
      },
    },
  });

  const hasRecord = updatedLicense.hardwareHistories.some(h => h.hwid === testHwId);
  if (hasRecord) {
    console.log('✓ 关联查询验证通过: hardwareHistories 成功包含该HWID记录');
  } else {
    throw new Error('关联查询失败: 未找到写入的HWID记录');
  }

  // 清理测试历史记录
  await prisma.licenseHardwareHistory.delete({
    where: { id: historyRecord.id },
  });
  console.log('✓ 测试临时历史记录已清理');

  console.log('\n=== 所有测试顺利通过 ===');
}

main()
  .catch((err) => {
    console.error('测试失败:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
