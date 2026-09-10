'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import UsersTable from '@/components/admin/users-table';
import UserDetailsDialog from '@/components/admin/user-details-dialog';

export default function UserDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const userId = typeof params?.id === 'string' ? params.id : null;
  const [open, setOpen] = useState(true);

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      router.push('/admin/users');
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">用户管理</h1>
      </div>

      <UsersTable />

      <UserDetailsDialog
        open={open}
        onOpenChange={handleOpenChange}
        userId={userId}
      />
    </>
  );
}
