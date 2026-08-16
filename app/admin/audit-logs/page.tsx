import AdminLayout from '@/components/admin/admin-layout';
import AuditLogsTable from '@/components/admin/audit-logs-table';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: '操作日志 | 管理员后台',
  description: '查看系统管理员的操作日志记录',
};

export default function AuditLogsPage() {
  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">操作日志</h1>
      </div>

      <AuditLogsTable />
    </AdminLayout>
  );
}
