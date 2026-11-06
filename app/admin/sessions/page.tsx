import SessionsTable from '@/components/admin/sessions-table';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: '在线会话 | 管理员后台',
  description: '在授权管理系统中监控和管理在线活动用户与客户端会话',
};

export default function SessionsPage() {
  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">在线会话</h1>
      </div>

      <SessionsTable />
    </>
  );
}
