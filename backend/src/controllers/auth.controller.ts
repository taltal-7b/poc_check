import { Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { User, UserStatus } from '../entities/User';
import { Token, TokenAction } from '../entities/Token';
import { UserPreference } from '../entities/UserPreference';
import { EmailAddress } from '../entities/EmailAddress';
import { AppError, catchAsync } from '../middleware/error.middleware';
import { hashPassword, comparePassword, validatePassword, getPasswordErrors } from '../utils/password.util';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt.util';
import { generateTwoFASecret, generateTwoFAQRCode, verifyTwoFAToken, generateBackupCodes } from '../utils/twofa.util';
import { AuthRequest } from '../middleware/auth.middleware';

export const register = catchAsync(async (req: Request, res: Response) => {
  const { login, email, password, firstName, lastName } = req.body;

  // Validate password
  if (!validatePassword(password)) {
    const errors = getPasswordErrors(password);
    throw new AppError(errors.join(', '), 400);
  }

  const userRepository = AppDataSource.getRepository(User);
  const emailRepository = AppDataSource.getRepository(EmailAddress);

  // Check if user exists
  const existingUser = await userRepository.findOne({
    where: [{ login }, { email }],
  });

  if (existingUser) {
    throw new AppError('ユーザー名またはメールアドレスは既に使用されています', 400);
  }

  // Hash password
  const hashedPassword = await hashPassword(password);

  // Create user
  const user = userRepository.create({
    login,
    email,
    hashedPassword,
    firstName,
    lastName,
    status: UserStatus.REGISTERED,
    admin: false,
  });

  await userRepository.save(user);

  // Create email address
  const emailAddress = emailRepository.create({
    userId: user.id,
    address: email,
    isDefault: true,
    notify: true,
  });

  await emailRepository.save(emailAddress);

  // Create user preference
  const preferenceRepository = AppDataSource.getRepository(UserPreference);
  const preference = preferenceRepository.create({
    userId: user.id,
  });

  await preferenceRepository.save(preference);

  res.status(201).json({
    status: 'success',
    message: 'ユーザー登録が完了しました',
    data: {
      user: {
        id: user.id,
        login: user.login,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    },
  });
});

export const login = catchAsync(async (req: Request, res: Response) => {
  const { login, password } = req.body;

  const userRepository = AppDataSource.getRepository(User);
  const user = await userRepository.findOne({
    where: { login },
    relations: ['preference'],
  });

  if (!user || !(await comparePassword(password, user.hashedPassword))) {
    throw new AppError('ログイン名またはパスワードが正しくありません', 401);
  }

  if (!user.isActive) {
    throw new AppError('アカウントが無効です', 401);
  }

  // Check if 2FA is enabled
  if (user.twofaScheme) {
    // Return a temporary token for 2FA verification (not fully authenticated)
    const { generateTwoFactorToken } = await import('../utils/jwt.util');
    const tempToken = generateTwoFactorToken(user.id);
    return res.json({
      status: 'success',
      requiresTwoFA: true,
      tempToken,
    });
  }

  // Update last login
  user.lastLoginOn = new Date();
  await userRepository.save(user);

  // Generate tokens (with 2FA verified flag)
  const accessToken = generateAccessToken(user.id, false);
  const refreshToken = generateRefreshToken(user.id);

  // Set cookie
  res.cookie('token', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  });

  res.json({
    status: 'success',
    data: {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        login: user.login,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        admin: user.admin,
      },
    },
  });
});

export const verifyTwoFA = catchAsync(async (req: AuthRequest, res: Response) => {
  const { token, tempToken } = req.body;

  if (!tempToken) {
    throw new AppError('一時トークンが必要です', 401);
  }

  // Verify the temp token is a valid 2FA pending token
  const { verifyAccessToken } = await import('../utils/jwt.util');
  let decoded;
  try {
    decoded = verifyAccessToken(tempToken);
  } catch (error) {
    throw new AppError('無効な一時トークンです', 401);
  }

  if (!decoded.twoFactorPending) {
    throw new AppError('無効な一時トークンです', 401);
  }

  // Get user from the temp token
  const userRepository = AppDataSource.getRepository(User);
  const user = await userRepository.findOne({
    where: { id: decoded.userId },
  });

  if (!user) {
    throw new AppError('ユーザーが見つかりません', 401);
  }

  if (!user.twofaSecret) {
    throw new AppError('2FAが設定されていません', 400);
  }

  let isValid = verifyTwoFAToken(token, user.twofaSecret);
  let usedBackupCode = false;

  // If TOTP verification fails, try backup codes
  if (!isValid && user.twofaBackupCodes) {
    const { verifyBackupCode } = await import('../utils/twofa.util');
    try {
      const hashedCodes = JSON.parse(user.twofaBackupCodes);
      const codeIndex = await verifyBackupCode(token, hashedCodes);
      
      if (codeIndex >= 0) {
        isValid = true;
        usedBackupCode = true;
        
        // Remove the used backup code
        hashedCodes.splice(codeIndex, 1);
        user.twofaBackupCodes = JSON.stringify(hashedCodes);
      }
    } catch (error) {
      // Failed to parse backup codes
    }
  }

  if (!isValid) {
    throw new AppError('無効な認証コードです', 401);
  }

  // Update last login
  user.lastLoginOn = new Date();
  await userRepository.save(user);

  // Generate fully authenticated tokens (with 2FA verified)
  const accessToken = generateAccessToken(user.id, true);
  const refreshToken = generateRefreshToken(user.id);

  // Set cookie
  res.cookie('token', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000,
  });

  // Set cookie
  res.cookie('token', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000,
  });

  res.json({
    status: 'success',
    data: {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        login: user.login,
        email: req.user.email,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        admin: req.user.admin,
      },
    },
  });
});

export const logout = catchAsync(async (req: Request, res: Response) => {
  res.clearCookie('token');
  res.json({
    status: 'success',
    message: 'ログアウトしました',
  });
});

export const getCurrentUser = catchAsync(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    throw new AppError('認証が必要です', 401);
  }

  res.json({
    status: 'success',
    data: {
      user: {
        id: req.user.id,
        login: req.user.login,
        email: req.user.email,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        admin: req.user.admin,
        status: req.user.status,
        language: req.user.language,
        twofaEnabled: !!req.user.twofaScheme,
      },
    },
  });
});

export const enableTwoFA = catchAsync(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    throw new AppError('認証が必要です', 401);
  }

  // Generate secret
  const secret = generateTwoFASecret();
  const qrCode = await generateTwoFAQRCode(req.user.email, secret);

  // Save secret temporarily (will be confirmed later)
  const userRepository = AppDataSource.getRepository(User);
  req.user.twofaSecret = secret;
  await userRepository.save(req.user);

  res.json({
    status: 'success',
    data: {
      secret,
      qrCode,
    },
  });
});

export const confirmTwoFA = catchAsync(async (req: AuthRequest, res: Response) => {
  const { token } = req.body;

  if (!req.user) {
    throw new AppError('認証が必要です', 401);
  }

  if (!req.user.twofaSecret) {
    throw new AppError('2FAの設定が開始されていません', 400);
  }

  const isValid = verifyTwoFAToken(token, req.user.twofaSecret);

  if (!isValid) {
    throw new AppError('無効な認証コードです', 401);
  }

  // Enable 2FA
  const userRepository = AppDataSource.getRepository(User);
  req.user.twofaScheme = 'totp';
  await userRepository.save(req.user);

  // Generate backup codes
  const backupCodes = generateBackupCodes();

  res.json({
    status: 'success',
    message: '2FAが有効になりました',
    data: {
      backupCodes,
    },
  });
});

export const disableTwoFA = catchAsync(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    throw new AppError('認証が必要です', 401);
  }

  const userRepository = AppDataSource.getRepository(User);
  req.user.twofaScheme = null;
  req.user.twofaSecret = null;
  await userRepository.save(req.user);

  res.json({
    status: 'success',
    message: '2FAが無効になりました',
  });
});
