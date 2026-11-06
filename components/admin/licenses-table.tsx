'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Search, RefreshCcw, Copy, Key, Download, Layers } from 'lucide-react';
import { formatDate, formatLicenseRemaining } from '@/lib/utils';
import { formatDuration } from '@/lib/license-status';
import { MaskedText } from '@/components/ui/masked-text';
import { useToast } from '@/hooks/use-toast';
import CreateLicenseDialog from './create-license-dialog';
import BatchChangeSoftwareDialog from './batch-change-software-dialog';
import BatchExtendDialog from './batch-extend-dialog';
import BatchGenerateDialog from './batch-generate-dialog';
import LicenseDetailsDialog from './license-details-dialog';
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
  note?: string | null;
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
  const [isBatchGenerateOpen, setIsBatchGenerateOpen] = useState(false);
  const [isChangeSoftwareOpen, setIsChangeSoftwareOpen] = useState(false);
  const [isResetHwidAlertOpen, setIsResetHwidAlertOpen] = useState(false);
  const [isExtendDialogOpen, setIsExtendDialogOpen] = useState(false);
  const [selectedLicenseId, setSelectedLicenseId] = useState<string | null>(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
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
    const params = new URLSearchParams();
    if (search.trim()) {
      params.set('search', search.trim());
    }
    const queryStr = params.toString() ? `?${params.toString()}` : '';
    window.open(`/api/admin/licenses/export${queryStr}`, '_blank');
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
    (license.username || '').toLowerCase().includes(search.toLowerCase()) ||
    (license.note || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleLicenseCreated = (newLicense: License) => {
    setLicenses(prev => [newLicense, ...prev]);
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
              variant="outline"
              size="sm"
              onClick={() => setIsBatchGenerateOpen(true)}
              className="gap-1.5"
            >
              <Layers className="h-4 w-4" />
              批量制卡
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
                  <TableHead>软件 / 类型</TableHead>
                  <TableHead>用户名</TableHead>
                  <TableHead>到期时效</TableHead>
                  <TableHead>HWID 绑定</TableHead>
                  <TableHead>备注</TableHead>
                  <TableHead className="w-[80px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center h-24">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                      <p className="text-sm text-muted-foreground mt-2">正在加载授权...</p>
                    </TableCell>
                  </TableRow>
                ) : filteredLicenses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center h-24">
                      <Key className="h-8 w-8 mx-auto text-muted-foreground" />
                      <p className="text-muted-foreground mt-2">未找到授权密钥</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLicenses.map((license) => {
                    const isSelected = selectedIds.includes(license.id);
                    const remainingInfo = formatLicenseRemaining(
                      license.expirationDate,
                      license.status,
                      license.licenseType,
                      license.duration
                    );

                    return (
                      <TableRow key={license.id} className={isSelected ? "bg-muted/50 group/row" : "group/row"}>
                        <TableCell className="px-4">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                            checked={isSelected}
                            onChange={(e) => handleSelectOne(license.id, e.target.checked)}
                          />
                        </TableCell>
                        <TableCell>
                          <MaskedText value={license.licenseKey} head={6} tail={4} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="text-xs">
                              {license.softwareName === 'ALL' || license.softwareName === '*'
                                ? <span className="font-mono font-semibold text-purple-600 dark:text-purple-400">ALL</span>
                                : license.softwareName}
                            </span>
                            {license.licenseType === 'duration' ? (
                              <span className="text-[10px] text-muted-foreground border border-border rounded px-1 py-px">
                                激活卡
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground border border-border rounded px-1 py-px">
                                即时卡
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{license.username}</TableCell>
                        <TableCell className="text-xs" title={remainingInfo.detailText}>
                          <span className={remainingInfo.colorClass}>{remainingInfo.text}</span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={license.hardwareBindingEnabled ? (license.hwid ? "default" : "secondary") : "outline"}
                          >
                            {license.hardwareBindingEnabled ? (license.hwid ? "已绑定" : "待绑定") : "已禁用"}
                          </Badge>
                        </TableCell>
                        <TableCell
                          className="text-xs text-muted-foreground max-w-[130px] truncate"
                          title={license.note || ''}
                        >
                          {license.note || '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedLicenseId(license.id);
                              setIsDetailsDialogOpen(true);
                            }}
                          >
                            查看
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

      <LicenseDetailsDialog
        open={isDetailsDialogOpen}
        onOpenChange={setIsDetailsDialogOpen}
        licenseId={selectedLicenseId}
        onUpdated={fetchLicenses}
      />

      <CreateLicenseDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onLicenseCreated={handleLicenseCreated}
      />

      <BatchGenerateDialog
        open={isBatchGenerateOpen}
        onOpenChange={setIsBatchGenerateOpen}
        onSuccess={fetchLicenses}
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