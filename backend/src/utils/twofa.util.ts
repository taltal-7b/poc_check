import { authenticator } from 'otplib';
import QRCode from 'qrcode';

const APP_NAME = process.env.APP_NAME || 'Project Management System';

export const generateTwoFASecret = (): string => {
  return authenticator.generateSecret();
};

export const generateTwoFAQRCode = async (
  userEmail: string,
  secret: string
): Promise<string> => {
  const otpauthUrl = authenticator.keyuri(userEmail, APP_NAME, secret);
  return await QRCode.toDataURL(otpauthUrl);
};

export const verifyTwoFAToken = (token: string, secret: string): boolean => {
  try {
    return authenticator.verify({ token, secret });
  } catch (error) {
    return false;
  }
};

export const generateBackupCodes = (count: number = 10): string[] => {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    // Generate 8 character backup codes
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    codes.push(code);
  }
  return codes;
};

export const hashBackupCodes = async (codes: string[]): Promise<string[]> => {
  const bcrypt = await import('bcryptjs');
  const hashedCodes: string[] = [];
  for (const code of codes) {
    const hashed = await bcrypt.hash(code, 10);
    hashedCodes.push(hashed);
  }
  return hashedCodes;
};

export const verifyBackupCode = async (code: string, hashedCodes: string[]): Promise<number> => {
  const bcrypt = await import('bcryptjs');
  for (let i = 0; i < hashedCodes.length; i++) {
    if (await bcrypt.compare(code, hashedCodes[i])) {
      return i; // Return the index of the matched code
    }
  }
  return -1; // No match found
};
