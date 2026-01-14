import { Link } from 'react-router-dom';
import {
  Users,
  ShieldCheck,
  UsersRound,
  SlidersHorizontal,
  Workflow,
} from 'lucide-react';

const adminCards = [
  {
    title: 'ユーザー',
    description: 'ユーザーの管理、ステータス、アクセス権限を設定',
    href: '/admin/users',
    icon: Users,
  },
  {
    title: 'ロール',
    description: '権限と表示ルールを定義',
    href: '/admin/roles',
    icon: ShieldCheck,
  },
  {
    title: 'グループ',
    description: 'ユーザーをグループに整理',
    href: '/admin/groups',
    icon: UsersRound,
  },
  {
    title: 'カスタムフィールド',
    description: 'カスタムフィールドの定義を管理',
    href: '/admin/custom-fields',
    icon: SlidersHorizontal,
  },
  {
    title: 'ワークフロー',
    description: 'ステータス遷移とルールを設定',
    href: '/admin/workflows',
    icon: Workflow,
  },
];

export default function AdminDashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">管理</h1>
          <p className="mt-1 text-sm text-gray-500">
            システム設定とユーザー管理
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {adminCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.href}
              to={card.href}
              className="card hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <h2 className="text-lg font-bold text-gray-900">{card.title}</h2>
                <Icon className="w-6 h-6 text-primary-600" />
              </div>
              <p className="text-sm text-gray-600">{card.description}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
