import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { authApi } from '../../lib/api';
import { UserPlus, AlertCircle, CheckCircle } from 'lucide-react';

const registerSchema = z
  .object({
    login: z
      .string()
      .min(3, 'ログイン名は3文字以上で入力してください')
      .max(50, 'ログイン名は50文字以下で入力してください'),
    email: z.string().email('有効なメールアドレスを入力してください'),
    password: z.string().min(8, 'パスワードは8文字以上で入力してください'),
    confirmPassword: z.string(),
    firstName: z.string().min(1, '名を入力してください'),
    lastName: z.string().min(1, '姓を入力してください'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'パスワードが一致しません',
    path: ['confirmPassword'],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterFormData) => {
    try {
      setError('');
      await authApi.register({
        login: data.login,
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
      });
      setSuccess(true);
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          '登録に失敗しました。もう一度お試しください。'
      );
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full">
          <div className="bg-green-50 border border-green-200 rounded-md p-6 flex flex-col items-center space-y-4">
            <CheckCircle className="w-16 h-16 text-green-600" />
            <h3 className="text-lg font-medium text-green-900">
              登録が完了しました
            </h3>
            <p className="text-sm text-green-700 text-center">
              ログインページに移動します...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold text-gray-900">
            新規登録
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            すでにアカウントをお持ちの方は{' '}
            <Link
              to="/login"
              className="font-medium text-primary-600 hover:text-primary-500"
            >
              ログイン
            </Link>
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4 flex items-start space-x-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="login" className="label">
                ログイン名 *
              </label>
              <input
                id="login"
                type="text"
                {...register('login')}
                className="input"
                placeholder="login_name"
              />
              {errors.login && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.login.message}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="email" className="label">
                メールアドレス *
              </label>
              <input
                id="email"
                type="email"
                {...register('email')}
                className="input"
                placeholder="user@example.com"
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="lastName" className="label">
                  姓 *
                </label>
                <input
                  id="lastName"
                  type="text"
                  {...register('lastName')}
                  className="input"
                  placeholder="山田"
                />
                {errors.lastName && (
                  <p className="mt-1 text-sm text-red-600">
                    {errors.lastName.message}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="firstName" className="label">
                  名 *
                </label>
                <input
                  id="firstName"
                  type="text"
                  {...register('firstName')}
                  className="input"
                  placeholder="太郎"
                />
                {errors.firstName && (
                  <p className="mt-1 text-sm text-red-600">
                    {errors.firstName.message}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="password" className="label">
                パスワード *
              </label>
              <input
                id="password"
                type="password"
                {...register('password')}
                className="input"
                placeholder="••••••••"
              />
              {errors.password && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.password.message}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="label">
                パスワード（確認） *
              </label>
              <input
                id="confirmPassword"
                type="password"
                {...register('confirmPassword')}
                className="input"
                placeholder="••••••••"
              />
              {errors.confirmPassword && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full btn btn-primary flex items-center justify-center space-x-2"
          >
            <UserPlus className="w-5 h-5" />
            <span>{isSubmitting ? '登録中...' : '登録'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
