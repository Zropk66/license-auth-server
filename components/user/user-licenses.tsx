'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCcw, Copy, Key } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { MaskedText } from '@/components/ui/masked-text';
import { useToast } from '@/hooks/use-toast';

type License = {
  id: string;
  licenseKey: string;
  softwareName: string;
  expirationDate: string;
  hardwareBindingEnabled: boolean;
  hwid: string | null;
  status: string;
  licenseType: string;
  duration?: number | null;
  activatedAt?: string | null;
  createdAt: string;
};

export default function UserLicenses() {
  const { toast } = useToast();
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLicenses = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/user/licenses');
      const data = await response.json();
      if (response.ok) {
        setLicenses(data);
      } else {
        throw new Error(data.error || '获取授权失败');
      }
    } catch (error) {
      console.error('Error fetching licenses:', error);
      toast({
        title: '错误',
        description: '获取授权失败',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

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
    <Card>
      <CardHeader className="flex flex-col space-y-2 md:flex-row md:items-center md:justify-between md:space-y-0">
        <div>
          <CardTitle className="text-xl">您的授权</CardTitle>
          <CardDescription>查看并管理您的授权</CardDescription>
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
            <span className="ml-2">刷新</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>授权密钥</TableHead>
                <TableHead>软件名称</TableHead>
                <TableHead>卡密类型</TableHead>
                <TableHead>到期时间</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>HWID</TableHead>
                <TableHead className="w-[100px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center h-24">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                    <p className="text-sm text-muted-foreground mt-2">正在加载授权...</p>
                  </TableCell>
                </TableRow>
              ) : licenses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center h-24">
                    <Key className="h-8 w-8 mx-auto text-muted-foreground" />
                    <p className="text-muted-foreground mt-2">您目前没有任何授权</p>
                  </TableCell>
                </TableRow>
              ) : (
                licenses.map((license) => {
                  const status = getLicenseStatus(license);
                  
                  return (
                    <TableRow key={license.id}>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs sm:text-sm font-mono truncate max-w-[100px] sm:max-w-[120px]">
                            <MaskedText value={license.licenseKey} head={6} tail={4} />
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => copyToClipboard(license.licenseKey)}
                          >
                            <Copy className="h-3 w-3" />
                            <span className="sr-only">复制密钥</span>
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>{license.softwareName}</TableCell>
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
                        {license.activatedAt ? formatDate(license.expirationDate) : '-'}
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
                          <a href={`/user/licenses/${license.id}`}>查看</a>
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
  );
}