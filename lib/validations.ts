import { z } from 'zod';

// Admin login
export const adminLoginSchema = z.object({
  username: z.string().min(1, '请输入用户名').max(100),
  password: z.string().min(1, '请输入密码').max(200),
  turnstileToken: z.string().nullish(),
  setupToken: z.string().nullish(),
});

// User login
export const userLoginSchema = z.object({
  userHash: z.string().min(1, '请输入用户特征码').max(100),
  turnstileToken: z.string().nullish(),
});

// License creation
export const createLicenseSchema = z.object({
  userId: z.string().min(1),
  softwareName: z.string().min(1).max(200),
  expirationDate: z.string().optional(),
  hardwareBindingEnabled: z.boolean().optional(),
  allowSelfUnbind: z.boolean().optional(),
  licenseType: z.enum(['fixed', 'duration']).default('fixed'),
  duration: z.number().int().positive().optional(),
  note: z.string().max(500, '备注不能超过500字').nullish(),
}).refine(
  (data) => {
    if (data.licenseType === 'fixed') return !!data.expirationDate;
    if (data.licenseType === 'duration') return !!data.duration && data.duration > 0;
    return false;
  },
  { message: 'Invalid license parameters' }
);

// Batch license generation
export const batchGenerateLicenseSchema = z.object({
  softwareName: z.string().min(1, '请选择或填写所属软件').max(200),
  count: z.number().int().min(1, '制卡数量最少为1张').max(500, '单次批量制卡最多500张'),
  licenseType: z.enum(['fixed', 'duration']).default('fixed'),
  expirationDate: z.string().optional(),
  duration: z.number().int().positive('时长需为正整数').optional(),
  hardwareBindingEnabled: z.boolean().default(false),
  allowSelfUnbind: z.boolean().default(true),
  prefix: z.string().max(20, '前缀不能超过20个字符').optional(),
  userId: z.string().optional(),
  note: z.string().max(500, '备注不能超过500字').nullish(),
}).refine(
  (data) => {
    if (data.licenseType === 'fixed') return !!data.expirationDate;
    if (data.licenseType === 'duration') return !!data.duration && data.duration > 0;
    return false;
  },
  { message: '请完善授权时间或时长参数' }
);

// License update
export const updateLicenseSchema = z.object({
  status: z.enum(['active', 'revoked', 'suspended', 'unactivated']).optional(),
  revoke: z.boolean().optional(),
  softwareName: z.string().min(1).max(200).optional(),
  expirationDate: z.string().optional(),
  hardwareBindingEnabled: z.boolean().optional(),
  allowSelfUnbind: z.boolean().optional(),
  extraUnbindCount: z.number().int().min(0).optional(),
  addUnbindCount: z.number().int().optional(),
  resetExtraUnbind: z.boolean().optional(),
  duration: z.number().int().positive().optional(),
  resetHwid: z.boolean().optional(),
  resethwid: z.boolean().optional(),
  note: z.string().max(500, '备注不能超过500字').nullish(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'No fields to update' }
);

// User creation
export const createUserSchema = z.object({
  username: z.string().min(1, 'Username is required').max(100),
});

// Software creation
export const createSoftwareSchema = z.object({
  name: z.string().min(1, '软件名称不能为空').max(100, '软件名称不能超过100个字符'),
  code: z.string().max(50).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  enabled: z.boolean().default(true),
  minVersionCode: z.number().int('最低版本号必须为整数').min(0, '最低版本号不能小于0').optional().nullable(),
  maxVersionCode: z.number().int('最高版本号必须为整数').min(0, '最高版本号不能小于0').optional().nullable(),
});

// Software update
export const updateSoftwareSchema = z.object({
  name: z.string().min(1, '软件名称不能为空').max(100, '软件名称不能超过100个字符').optional(),
  code: z.string().max(50).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  enabled: z.boolean().optional(),
  minVersionCode: z.number().int('最低版本号必须为整数').min(0, '最低版本号不能小于0').optional().nullable(),
  maxVersionCode: z.number().int('最高版本号必须为整数').min(0, '最高版本号不能小于0').optional().nullable(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'No fields to update' }
);

// Manager creation
export const createManagerSchema = z.object({
  username: z.string().min(3, '管理员用户名至少3个字符').max(100),
  password: z.string().min(6, '管理员密码长度至少为6位').max(200),
  role: z.enum(['admin', 'owner']),
});

// Manager update
export const updateManagerSchema = z.object({
  password: z.string().min(6, '管理员密码长度至少为6位').max(200).optional(),
  role: z.enum(['admin', 'owner']).optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'No fields to update' }
);

// Settings update - whitelist of allowed keys
export const ALLOWED_SETTING_KEYS = [
  'enable_recaptcha',
  'enforce_strong_password',
  'session_timeout',
  'heartbeat_interval',
  'unbind_enabled',
  'unbind_default_allow',
  'unbind_max_per_month',
  'unbind_cooldown_hours',
  'unbind_deduct_hours',
  'security_enforce_nonce',
  'security_nonce_tolerance_sec',
  'security_auto_blacklist_threshold',
  'rate_limit_login_max',
  'rate_limit_login_window_min',
  'rate_limit_verify_max',
  'rate_limit_verify_window_min',
  'rate_limit_heartbeat_max',
  'rate_limit_heartbeat_window_min',
  'log_cleanup_verify_days',
  'log_cleanup_audit_days',
  'log_cleanup_auto_enabled',
] as const;

export const settingsUpdateSchema = z.object({
  settings: z.array(
    z.object({
      key: z.enum(ALLOWED_SETTING_KEYS),
      value: z.string().max(1000),
    })
  ).min(1),
});

// JWT payload validation
export const jwtPayloadSchema = z.object({
  id: z.string(),
  username: z.string(),
  type: z.enum(['admin', 'user']),
  role: z.string().optional(),
  iat: z.number().optional(),
  exp: z.number().optional(),
  iss: z.string().optional(),
  aud: z.string().optional(),
});

// Pagination
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
