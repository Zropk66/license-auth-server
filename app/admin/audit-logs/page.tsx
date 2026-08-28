import AdminLayout from '@/components/admin/admin-layout';
import AuditLogsTable from '@/components/admin/audit-logs-table';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: '系统日志 | 管理员后台',
  description: '查看系统操作审计与客户端授权验证日志',
};

export default function AuditLogsPage() {
  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">系统日志</h1>
          <p className="text-sm text-muted-foreground mt-1">
            监控系统管理操作与客户端授权验证记录
          </p>
        </div>
      </div>

      <AuditLogsTable />
    </AdminLayout>
  );
}
