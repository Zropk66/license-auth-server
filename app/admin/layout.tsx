import AdminLayout from '@/components/admin/admin-layout';

export const metadata = {
  title: '授权管理系统 - 管理员后台',
};

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminLayout>{children}</AdminLayout>;
}
