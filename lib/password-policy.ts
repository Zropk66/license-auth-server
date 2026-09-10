import prisma from '@/lib/prisma';

/* 校验密码是否符合高强度复杂度要求：至少8位且包含大写字母、小写字母、数字及特殊字符 */
export function isHighStrengthPassword(password: string): boolean {
  if (password.length < 8) return false;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  return hasUpper && hasLower && hasDigit && hasSpecial;
}

/* 根据系统配置动态校验密码强度 */
export async function checkPasswordPolicy(
  password: string
): Promise<{ valid: boolean; message?: string }> {
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: 'enforce_strong_password' },
    });
    const isEnforced = setting?.value === 'true';

    if (isEnforced) {
      if (password.length < 8) {
        return {
          valid: false,
          message: '已启用强密码策略：密码长度至少需要 8 位字符',
        };
      }
      if (!isHighStrengthPassword(password)) {
        return {
          valid: false,
          message: '已启用强密码策略：密码必须同时包含大写字母、小写字母、数字和特殊字符',
        };
      }
    } else {
      if (password.length < 6) {
        return {
          valid: false,
          message: '密码长度至少需要 6 个字符',
        };
      }
    }

    return { valid: true };
  } catch (err) {
    /* 发生数据库读取异常时回退到基础长度校验 */
    if (password.length < 6) {
      return {
        valid: false,
        message: '密码长度至少需要 6 个字符',
      };
    }
    return { valid: true };
  }
}
