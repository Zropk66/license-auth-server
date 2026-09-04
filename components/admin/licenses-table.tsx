'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Search, RefreshCcw, Copy, Key, Download } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { MaskedText } from '@/components/ui/masked-text';
import { useToast } from '@/hooks/use-toast';
import CreateLicenseDialog from './create-license-dialog';
import BatchChangeSoftwareDialog from './batch-change-software-dialog';
import BatchExtendDialog from './batch-extend-dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type License = {
  id: string;
  licenseKey: string;
  userId: string;
  username: string;
  softwareName: string;
  expirationDate: string;
  hardwareBindingEnabled: boolean;
  hwid: string | null;
  status: string;
  licenseType: string;
  duration?: number | null;
  activatedAt?: string | null;
  createdAt: string;
  createdBy?: string | null;
};

export default function LicensesTable() {
  const { toast } = useToast();
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isChangeSoftwareOpen, setIsChangeSoftwareOpen] = useState(false);
  const [isResetHwidAlertOpen, setIsResetHwidAlertOpen] = useState(false);
  const [isExtendDialogOpen, setIsExtendDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);

  const fetchLicenses = useCallback(async () => {
    setLoading(true);
    setSelectedIds([]);
    try {
      const response = await fetch('/api/admin/licenses');
      const data = await response.json();

      if (response.ok) {
        setLicenses(data);
      } else {
        throw new Error(data.error || '获取授权列表失败');
      }
    } catch (error) {
      console.error('Error fetching licenses:', error);
      toast({
        title: '错误',
        description: '获取授权列表失败',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(filteredLicenses.map(l => l.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds(prev => [...prev, id]);
    } else {
      setSelectedIds(prev => prev.filter(item => item !== id));
    }
  };

  const handleBatchAction = async (action: 'revoke' | 'suspend' | 'active') => {
    if (selectedIds.length === 0) return;
    setBatchLoading(true);
    try {
      const response = await fetch('/api/admin/licenses/batch', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids: selectedIds, action }),
      });
      const data = await response.json();
      if (response.ok) {
        toast({
          title: '批量操作成功',
          description: `成功批量更新了 ${selectedIds.length} 个授权`,
        });
        fetchLicenses();
      } else {
        throw new Error(data.error || '批量操作失败');
      }
    } catch (error) {
      toast({
        title: '错误',
        description: error instanceof Error ? error.message : '批量操作失败',
        variant: 'destructive',
      });
    } finally {
      setBatchLoading(false);
    }
  };

  const handleBatchResetHwid = async () => {
    if (selectedIds.length === 0) return;
    setBatchLoading(true);
    try {
      const response = await fetch('/api/admin/licenses/batch', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids: selectedIds, action: 'reset_hwid' }),
      });
      const data = await response.json();
      if (response.ok) {
        toast({
          title: '批量重置成功',
          description: data.message || `已成功重置 ${selectedIds.length} 个授权的 HWID 绑定`,
        });
        setSelectedIds([]);
        fetchLicenses();
      } else {
        throw new Error(data.error || '批量重置 HWID 失败');
      }
    } catch (error: any) {
      toast({
        title: '错误',
        description: error.message || '批量重置 HWID 失败',
        variant: 'destructive',
      });
    } finally {
      setBatchLoading(false);
      setIsResetHwidAlertOpen(false);
    }
  };

  const exportToCSV = () => {
    if (filteredLicenses.length === 0) {
      toast({
        title: '提示',
        description: '当前无可导出的授权数据',
      });
      return;
    }

    const headers = ['授权密钥', '所属软件', '用户名', '创建者', '卡密类型', '状态', 'HWID 绑定启用', '绑定HWID', '创建时间', '到期时间'];
    const rows = filteredLicenses.map(license => {
      const statusInfo = getLicenseStatus(license);
      const isDuration = license.licenseType === 'duration';
      const durationStr = isDuration ? `激活卡 (${formatDuration(license.duration)})` : '即时卡';
      const expirationStr = (license.status === 'unactivated' && isDuration) ? '-' : formatDate(license.expirationDate);

      return [
        license.licenseKey,
        license.softwareName,
        license.username,
        license.createdBy || '-',
        durationStr,
        statusInfo.label,
        license.hardwareBindingEnabled ? '是' : '否',
        license.hwid || '-',
        formatDate(license.createdAt),
        expirationStr
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    // Use UTF-8 BOM to prevent Chinese character corruption in Excel
    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `licenses_export_${new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }).replace(/\//g, '')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    fetchLicenses();
  }, [fetchLicenses]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: '已复制到剪贴板',
      description: '授权密钥已复制到剪贴板',
    });
  };

  const filteredLicenses = licenses.filter(license =>
    (license.licenseKey || '').toLowerCase().includes(search.toLowerCase()) ||
    (license.softwareName || '').toLowerCase().includes(search.toLowerCase()) ||
    (license.username || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleLicenseCreated = (newLicense: License) => {
    setLicenses(prev => [newLicense, ...prev]);
  };

  const getLicenseStatus = (license: License) => {
    if (license.status === "revoked") {
      return { label: "撤销", variant: "destructive" as const };
    } else if (license.status === "suspended") {
      return { label: "冻结", variant: "secondary" as const };
    } else if (license.status === "unactivated") {
      return { label: "待激活", variant: "outline" as const };
    } else if (isExpired(license.expirationDate)) {
      return { label: "到期", variant: "destructive" as const };
    } else {
      return { label: "有效", variant: "default" as const };
    }
  };

  const formatDuration = (minutes?: number | null) => {
    if (!minutes) return '-';
    if (minutes % (24 * 60) === 0) return `${minutes / (24 * 60)}天`;
    if (minutes % 60 === 0) return `${minutes / 60}小时`;
    return `${minutes}分钟`;
  };

  const isExpired = (date: string) => {
    return new Date(date) < new Date();
  };
  
  return (
    <>
      <Card>
        <CardHeader className="flex flex-col space-y-2 md:flex-row md:items-center md:justify-between md:space-y-0">
          <div>
            <CardTitle className="text-xl">授权列表</CardTitle>
            <CardDescription>管理软件授权密钥</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchLicenses}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="h-4 w-4" />
              )}
              <span className="sr-only">刷新</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportToCSV}
              disabled={loading}
            >
              <Download className="h-4 w-4 mr-2" />
              导出 CSV
            </Button>
            <Button
              size="sm"
              onClick={() => setIsDialogOpen(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              添加授权
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="搜索授权密钥、所属软件或用户名..."
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {selectedIds.length > 0 && (
              <div className="flex items-center gap-2 bg-muted/50 p-1.5 rounded-lg border text-sm">
                <span className="px-2 text-muted-foreground font-medium">已选中 {selectedIds.length} 项</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs text-blue-600 border-blue-600/20 hover:bg-blue-50 dark:hover:bg-blue-950/20"
                  disabled={batchLoading}
                  onClick={() => setIsExtendDialogOpen(true)}
                >
                  批量延时
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={batchLoading}
                  onClick={() => setIsChangeSoftwareOpen(true)}
                >
                  批量修改软件
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs text-orange-600 border-orange-600/20 hover:bg-orange-50 dark:hover:bg-orange-950/20"
                  disabled={batchLoading}
                  onClick={() => setIsResetHwidAlertOpen(true)}
                >
                  批量重置 HWID
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={batchLoading}
                  onClick={() => handleBatchAction('active')}
                >
                  批量恢复
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs text-yellow-600 border-yellow-600/20 hover:bg-yellow-50 dark:hover:bg-yellow-950/20"
                  disabled={batchLoading}
                  onClick={() => handleBatchAction('suspend')}
                >
                  批量冻结
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={batchLoading}
                  onClick={() => handleBatchAction('revoke')}
                >
                  批量撤销
                </Button>
              </div>
            )}
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px] px-4">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      checked={filteredLicenses.length > 0 && selectedIds.length === filteredLicenses.length}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                    />
                  </TableHead>
                  <TableHead>授权密钥</TableHead>
                  <TableHead>所属软件</TableHead>
                  <TableHead>用户名</TableHead>
                  <TableHead>创建者</TableHead>
                  <TableHead>卡密类型</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>HWID 绑定</TableHead>
                  <TableHead className="w-[100px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center h-24">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                      <p className="text-sm text-muted-foreground mt-2">正在加载授权...</p>
                    </TableCell>
                  </TableRow>
                ) : filteredLicenses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center h-24">
                      <Key className="h-8 w-8 mx-auto text-muted-foreground" />
                      <p className="text-muted-foreground mt-2">未找到授权密钥</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLicenses.map((license) => {
                    const status = getLicenseStatus(license);
                    const isSelected = selectedIds.includes(license.id);

                    return (
                      <TableRow key={license.id} className={isSelected ? "bg-muted/50" : ""}>
                        <TableCell className="px-4">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                            checked={isSelected}
                            onChange={(e) => handleSelectOne(license.id, e.target.checked)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs sm:text-sm font-mono inline-flex items-center">
                              <MaskedText value={license.licenseKey} head={6} tail={4} />
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0"
                              onClick={() => copyToClipboard(license.licenseKey)}
                            >
                              <Copy className="h-3 w-3" />
                              <span className="sr-only">复制密钥</span>
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>{license.softwareName}</TableCell>
                        <TableCell>{license.username}</TableCell>
                        <TableCell>{license.createdBy || '-'}</TableCell>
                        <TableCell>
                          {license.licenseType === 'duration' ? (
                            <Badge variant="outline" className="text-yellow-600 border-yellow-600 bg-yellow-500/5">
                              激活卡
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-blue-600 border-blue-600 bg-blue-500/5">
                              即时卡
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={status.variant}>
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={license.hardwareBindingEnabled ? (license.hwid ? "default" : "secondary") : "outline"}
                          >
                            {license.hardwareBindingEnabled ? (license.hwid ? "已绑定" : "待绑定") : "已禁用"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                          >
                            <a href={`/admin/licenses/${license.id}`}>查看</a>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
      <CreateLicenseDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onLicenseCreated={handleLicenseCreated}
      />

      <BatchChangeSoftwareDialog
        open={isChangeSoftwareOpen}
        onOpenChange={setIsChangeSoftwareOpen}
        selectedIds={selectedIds}
        onSuccess={() => {
          setSelectedIds([]);
          fetchLicenses();
        }}
      />

      <BatchExtendDialog
        open={isExtendDialogOpen}
        onOpenChange={setIsExtendDialogOpen}
        selectedIds={selectedIds}
        onSuccess={() => {
          setSelectedIds([]);
          fetchLicenses();
        }}
      />

      <AlertDialog open={isResetHwidAlertOpen} onOpenChange={setIsResetHwidAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认批量重置 HWID 绑定？</AlertDialogTitle>
            <AlertDialogDescription>
              您当前选中了 {selectedIds.length} 个授权。重置后，这些卡密已绑定的硬件标识将被清空并恢复待绑定状态，同时相关的活跃会话将被立即终止。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={batchLoading}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={batchLoading}
              onClick={(e) => {
                e.preventDefault();
                handleBatchResetHwid();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {batchLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              确认重置
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}