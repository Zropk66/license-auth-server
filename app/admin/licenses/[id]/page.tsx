'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AdminLayout from '@/components/admin/admin-layout';
import LicensesTable from '@/components/admin/licenses-table';
import LicenseDetailsDialog from '@/components/admin/license-details-dialog';

export default function LicenseDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const licenseId = typeof params?.id === 'string' ? params.id : null;
  const [open, setOpen] = useState(true);

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      router.push('/admin/licenses');
    }
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">授权管理</h1>
      </div>

      <LicensesTable />

      <LicenseDetailsDialog
        open={open}
        onOpenChange={handleOpenChange}
        licenseId={licenseId}
      />
    </AdminLayout>
  );
}
