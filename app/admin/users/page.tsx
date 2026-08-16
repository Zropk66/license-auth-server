import AdminLayout from '@/components/admin/admin-layout';
import UsersTable from '@/components/admin/users-table';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: '用户管理 | 管理员后台',
  description: '在授权管理系统中管理用户账号',
};

export default function UsersPage() {
  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">用户管理</h1>
      </div>
      
      <UsersTable />
    </AdminLayout>
  );
}