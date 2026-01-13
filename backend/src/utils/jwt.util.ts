import jwt from 'jsonwebtoken';

// Throw error if JWT secrets are not set in production
if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
    throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be set in production');
  }
}

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
  throw new Error('JWT_SECRET and JWT_REFRESH_SECRET are required. Please set them in your .env file.');
}

export const generateAccessToken = (userId: number, twoFactorVerified: boolean = false): string => {
  return jwt.sign({ userId, twoFactorVerified }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
};

export const generateRefreshToken = (userId: number): string => {
  return jwt.sign({ userId }, JWT_REFRESH_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
  });
};

// Generate temporary token for 2FA (short-lived, not fully authenticated)
export const generateTwoFactorToken = (userId: number): string => {
  return jwt.sign({ userId, twoFactorPending: true }, JWT_SECRET, {
    expiresIn: '5m', // 5 minutes only
  });
};

export const verifyAccessToken = (token: string): { userId: number; twoFactorVerified?: boolean; twoFactorPending?: boolean } => {
  return jwt.verify(token, JWT_SECRET) as { userId: number; twoFactorVerified?: boolean; twoFactorPending?: boolean };
};

export const verifyRefreshToken = (token: string): { userId: number } => {
  return jwt.verify(token, JWT_REFRESH_SECRET) as { userId: number };
};
