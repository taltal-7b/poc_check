import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { authApi } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { LogIn, AlertCircle } from 'lucide-react';

const loginSchema = z.object({
  login: z.string().min(1, 'ログイン名を入力してください'),
  password: z.string().min(1, 'パスワードを入力してください'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [error, setError] = useState('');
  const [requiresTwoFA, setRequiresTwoFA] = useState(false);
  const [twoFAToken, setTwoFAToken] = useState('');
  const [tempToken, setTempToken] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      setError('');
      const response = await authApi.login(data);

      if (response.data.requiresTwoFA) {
        setRequiresTwoFA(true);
        setTempToken(response.data.tempToken);
      } else {
        setAuth(response.data.data.user, response.data.data.accessToken);
        navigate('/');
      }
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          'ログインに失敗しました。もう一度お試しください。'
      );
    }
  };

  const handleTwoFASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError('');
      const response = await authApi.verifyTwoFA(twoFAToken);
      setAuth(response.data.data.user, response.data.data.accessToken);
      navigate('/');
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          '認証コードが正しくありません。もう一度お試しください。'
      );
    }
  };

  if (requiresTwoFA) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div>
            <h2 className="mt-6 text-center text-3xl font-bold text-gray-900">
              2段階認証
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              認証アプリに表示されている6桁のコードを入力してください
            </p>
          </div>

          <form className="mt-8 space-y-6" onSubmit={handleTwoFASubmit}>
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-4 flex items-start space-x-2">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <div>
              <input
                type="text"
                value={twoFAToken}
                onChange={(e) => setTwoFAToken(e.target.value)}
                placeholder="6桁のコード"
                className="input text-center text-2xl tracking-widest"
                maxLength={6}
                autoFocus
              />
            </div>

            <button type="submit" className="w-full btn btn-primary">
              認証
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold text-gray-900">
            ログイン
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            アカウントをお持ちでない方は{' '}
            <Link
              to="/register"
              className="font-medium text-primary-600 hover:text-primary-500"
            >
              新規登録
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
                ログイン名
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
              <label htmlFor="password" className="label">
                パスワード
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
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full btn btn-primary flex items-center justify-center space-x-2"
          >
            <LogIn className="w-5 h-5" />
            <span>{isSubmitting ? 'ログイン中...' : 'ログイン'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
