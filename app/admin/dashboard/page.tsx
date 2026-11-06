import DashboardStats from '@/components/admin/dashboard-stats';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: '管理员后台 | 授权管理系统',
  description: '授权管理系统的管理员后台',
};

export default function AdminDashboard() {
  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">仪表盘</h1>
      </div>

      <DashboardStats />
    </>
  );
}