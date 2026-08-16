import AdminLayout from '@/components/admin/admin-layout';
import SessionsTable from '@/components/admin/sessions-table';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: '在线会话 | 管理员后台',
  description: '在授权管理系统中监控和管理在线活动用户与客户端会话',
};

export default function SessionsPage() {
  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">在线会话管理</h1>
      </div>

      <SessionsTable />
    </AdminLayout>
  );
}
