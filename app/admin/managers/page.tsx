'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '@/components/admin/admin-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Loader2, Plus, Search, RefreshCcw, User, Trash2, Edit, ShieldAlert } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import CreateManagerDialog from '@/components/admin/create-manager-dialog';
import EditManagerDialog from '@/components/admin/edit-manager-dialog';

type Manager = {
  id: string;
  username: string;
  role: string;
  createdAt: string;
};

type CurrentUser = {
  id: string;
  username: string;
  role: string;
};

export default function ManagersPage() {
  const { toast } = useToast();
  const [managers, setManagers] = useState<Manager[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authChecking, setAuthChecking] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [managerToEdit, setManagerToEdit] = useState<Manager | null>(null);
  const [managerToDelete, setManagerToDelete] = useState<Manager | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    async function checkAuthAndFetch() {
      try {
        const userRes = await fetch('/api/admin/me');
        if (!userRes.ok) {
          throw new Error('未授权');
        }
        const userData: CurrentUser = await userRes.json();
        setCurrentUser(userData);

        if (userData.role === 'owner') {
          setIsOwner(true);
          // Fetch managers list
          const response = await fetch('/api/admin/managers');
          const data = await response.json();
          if (response.ok) {
            setManagers(data);
          } else {
            throw new Error(data.error || '获取管理员列表失败');
          }
        } else {
          setIsOwner(false);
        }
      } catch (error) {
        console.error('Auth error:', error);
        toast({
          title: '错误',
          description: error instanceof Error ? error.message : '获取数据失败',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
        setAuthChecking(false);
      }
    }

    checkAuthAndFetch();
  }, [toast]);

  const fetchManagers = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/managers');
      const data = await response.json();

      if (response.ok) {
        setManagers(data);
      } else {
        throw new Error(data.error || '获取管理员列表失败');
      }
    } catch (error) {
      console.error('Error fetching managers:', error);
      toast({
        title: '错误',
        description: error instanceof Error ? error.message : '获取管理员列表失败',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleManagerCreated = (newManager: Manager) => {
    setManagers(prev => [newManager, ...prev]);
  };

  const handleManagerUpdated = (updatedManager: Manager) => {
    setManagers(prev => prev.map(m => m.id === updatedManager.id ? updatedManager : m));
    if (currentUser && currentUser.id === updatedManager.id) {
      setCurrentUser(prev => prev ? { ...prev, role: updatedManager.role } : null);
    }
  };

  const deleteManager = async () => {
    if (!managerToDelete) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/admin/managers/${managerToDelete.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok) {
        setManagers(prev => prev.filter(m => m.id !== managerToDelete.id));
        toast({
          title: '删除成功',
          description: '管理员账号已成功删除',
        });
        setManagerToDelete(null);
      } else {
        throw new Error(data.error || '删除管理员失败');
      }
    } catch (error) {
      toast({
        title: '错误',
        description: error instanceof Error ? error.message : '删除管理员失败',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredManagers = managers.filter(m =>
    m.username.toLowerCase().includes(search.toLowerCase())
  );

  if (authChecking) {
    return (
      <AdminLayout>
        <div className="flex justify-center items-center h-[50vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">正在验证权限...</span>
        </div>
      </AdminLayout>
    );
  }

  if (!isOwner) {
    return (
      <AdminLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-md mx-auto text-center p-6">
          <div className="rounded-full bg-destructive/10 p-4 mb-4">
            <ShieldAlert className="h-12 w-12 text-destructive" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight mb-2">访问被拒绝</h2>
          <p className="text-muted-foreground mb-6">
            管理员账号管理是受限制的功能。只有系统所有者 (owner) 才能查看或管理此页面。
          </p>
          <Button asChild>
            <a href="/admin/dashboard">返回仪表盘</a>
          </Button>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">管理员管理</h1>
      </div>

      <Card>
        <CardHeader className="flex flex-col space-y-2 md:flex-row md:items-center md:justify-between md:space-y-0">
          <div>
            <CardTitle className="text-xl">管理员列表</CardTitle>
            <CardDescription>添加、编辑或删除系统管理员账号，分配角色权限。</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchManagers}
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
              size="sm"
              onClick={() => setIsCreateOpen(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              添加管理员
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center pb-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="搜索用户名..."
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>用户名</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="w-[150px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center h-24">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                      <p className="text-sm text-muted-foreground mt-2">正在加载管理员...</p>
                    </TableCell>
                  </TableRow>
                ) : filteredManagers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center h-24">
                      <User className="h-8 w-8 mx-auto text-muted-foreground" />
                      <p className="text-muted-foreground mt-2">未找到管理员</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredManagers.map((manager) => {
                    const isSelf = manager.id === currentUser?.id;
                    return (
                      <TableRow key={manager.id}>
                        <TableCell className="font-medium">
                          {manager.username} {isSelf && <span className="text-xs text-muted-foreground">(当前账户)</span>}
                        </TableCell>
                        <TableCell>
                          <Badge variant={manager.role === 'owner' ? 'default' : 'secondary'}>
                            {manager.role === 'owner' ? '系统所有者 (owner)' : '管理员 (admin)'}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(manager.createdAt)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                setManagerToEdit(manager);
                                setIsEditOpen(true);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                              <span className="sr-only">编辑</span>
                            </Button>

                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                  disabled={isSelf}
                                  onClick={() => setManagerToDelete(manager)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  <span className="sr-only">删除</span>
                                </Button>
                              </AlertDialogTrigger>
                              {!isSelf && (
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>删除管理员账号</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      您确定要删除管理员 <span className="font-semibold">{manager.username}</span> 吗？
                                      此操作将永久删除该账号。此操作无法撤销。
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>取消</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      onClick={deleteManager}
                                      disabled={isDeleting}
                                    >
                                      {isDeleting ? (
                                        <>
                                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                          正在删除...
                                        </>
                                      ) : (
                                        '删除'
                                      )}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              )}
                            </AlertDialog>
                          </div>
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

      <CreateManagerDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onManagerCreated={handleManagerCreated}
      />

      <EditManagerDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        manager={managerToEdit}
        currentAdminId={currentUser?.id || null}
        onManagerUpdated={handleManagerUpdated}
      />
    </AdminLayout>
  );
}
