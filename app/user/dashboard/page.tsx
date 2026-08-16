import UserLayout from '@/components/user/user-layout';
import UserLicenses from '@/components/user/user-licenses';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: '用户控制台 | 授权管理系统',
  description: '授权管理系统的用户控制台',
};

export default function UserDashboard() {
  return (
    <UserLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">您的授权</h1>
      </div>
      
      <UserLicenses />
    </UserLayout>
  );
}