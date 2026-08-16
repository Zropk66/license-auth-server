import AdminLayout from '@/components/admin/admin-layout';
import LicensesTable from '@/components/admin/licenses-table';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: '授权管理 | 管理员后台',
  description: '在授权管理系统中管理软件授权',
};

export default function LicensesPage() {
  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">授权管理</h1>
      </div>
      
      <LicensesTable />
    </AdminLayout>
  );
}