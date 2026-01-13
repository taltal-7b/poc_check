import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

export const hashPassword = async (password: string): Promise<string> => {
  return await bcrypt.hash(password, SALT_ROUNDS);
};

export const comparePassword = async (
  password: string,
  hashedPassword: string
): Promise<boolean> => {
  return await bcrypt.compare(password, hashedPassword);
};

export const validatePassword = (password: string): boolean => {
  const minLength = parseInt(process.env.PASSWORD_MIN_LENGTH || '8');
  
  if (password.length < minLength) {
    return false;
  }

  // Additional password policy checks can be added here
  return true;
};

export const getPasswordErrors = (password: string): string[] => {
  const errors: string[] = [];
  const minLength = parseInt(process.env.PASSWORD_MIN_LENGTH || '8');

  if (password.length < minLength) {
    errors.push(`パスワードは${minLength}文字以上である必要があります`);
  }

  // Add more validation rules as needed based on PASSWORD_REQUIRED_CHAR_CLASSES
  
  return errors;
};
