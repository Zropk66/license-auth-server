import AdminLayout from '@/components/admin/admin-layout';
import DashboardStats from '@/components/admin/dashboard-stats';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: '管理员后台 | 授权管理系统',
  description: '授权管理系统的管理员后台',
};

export default function AdminDashboard() {
  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">仪表盘</h1>
      </div>
      
      <DashboardStats />
    </AdminLayout>
  );
}