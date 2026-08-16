import { z } from 'zod';

// Admin login
export const adminLoginSchema = z.object({
  username: z.string().min(1, 'Username is required').max(100),
  password: z.string().min(1, 'Password is required').max(200),
  recaptchaToken: z.string().optional(),
  setupToken: z.string().optional(),
});

// User login
export const userLoginSchema = z.object({
  userHash: z.string().min(1, 'User hash is required').max(100),
  recaptchaToken: z.string().optional(),
});

// License creation
export const createLicenseSchema = z.object({
  userId: z.string().min(1),
  softwareName: z.string().min(1).max(200),
  expirationDate: z.string().optional(),
  hardwareBindingEnabled: z.boolean().optional(),
  licenseType: z.enum(['fixed', 'duration']).default('fixed'),
  duration: z.number().int().positive().optional(),
}).refine(
  (data) => {
    if (data.licenseType === 'fixed') return !!data.expirationDate;
    if (data.licenseType === 'duration') return !!data.duration && data.duration > 0;
    return false;
  },
  { message: 'Invalid license parameters' }
);

// License update
export const updateLicenseSchema = z.object({
  status: z.enum(['active', 'revoked', 'suspended', 'unactivated']).optional(),
  revoke: z.boolean().optional(),
  softwareName: z.string().min(1).max(200).optional(),
  expirationDate: z.string().optional(),
  hardwareBindingEnabled: z.boolean().optional(),
  duration: z.number().int().positive().optional(),
  resetHardwareId: z.boolean().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'No fields to update' }
);

// User creation
export const createUserSchema = z.object({
  username: z.string().min(1, 'Username is required').max(100),
});

// Manager creation
export const createManagerSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(100),
  password: z.string().min(6, 'Password must be at least 6 characters').max(200),
  role: z.enum(['admin', 'owner']),
});

// Manager update
export const updateManagerSchema = z.object({
  password: z.string().min(6, 'Password must be at least 6 characters').max(200).optional(),
  role: z.enum(['admin', 'owner']).optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'No fields to update' }
);

// Settings update - whitelist of allowed keys
export const ALLOWED_SETTING_KEYS = [
  'enable_recaptcha',
  'session_timeout',
  'heartbeat_interval',
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
