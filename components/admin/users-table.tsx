'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
} from "@/components/ui/alert-dialog";
import { Loader2, Plus, Search, RefreshCcw, Copy, User, Trash2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import CreateUserDialog from './create-user-dialog';

type User = {
  id: string;
  username: string;
  userHash: string;
  createdAt: string;
  licenseCount: number;
  createdBy?: string | null;
};

export default function UsersTable() {
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  useEffect(() => {
    fetchUsers();
  }, []);
  
  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/users');
      const data = await response.json();

      if (response.ok) {
        setUsers(data);
      } else {
        throw new Error(data.error || '获取用户列表失败');
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: '错误',
        description: '获取用户列表失败',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: '已复制到剪贴板',
      description: '用户哈希已复制到剪贴板',
    });
  };

  const filteredUsers = users.filter(user =>
    user.username.toLowerCase().includes(search.toLowerCase()) ||
    user.userHash.toLowerCase().includes(search.toLowerCase())
  );

  const handleUserCreated = (newUser: User) => {
    setUsers(prev => [newUser, ...prev]);
  };

  const deleteUser = async () => {
    if (!userToDelete) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/admin/users/${userToDelete.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok) {
        setUsers(prev => prev.filter(user => user.id !== userToDelete.id));
        toast({
          title: '用户已删除',
          description: data.message || '用户及其关联的授权已被删除',
        });
        setUserToDelete(null);
      } else {
        throw new Error(data.error || '删除用户失败');
      }
    } catch (error) {
      toast({
        title: '错误',
        description: error instanceof Error ? error.message : '删除用户失败',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };
  
  return (
    <>
      <Card>
        <CardHeader className="flex flex-col space-y-2 md:flex-row md:items-center md:justify-between md:space-y-0">
          <div>
            <CardTitle className="text-xl">用户列表</CardTitle>
            <CardDescription>管理系统中的用户账号</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchUsers}
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
              onClick={() => setIsDialogOpen(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              添加用户
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center pb-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="搜索用户名或用户哈希..."
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
                  <TableHead>用户哈希</TableHead>
                  <TableHead>创建者</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead>授权数</TableHead>
                  <TableHead className="w-[150px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center h-24">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                      <p className="text-sm text-muted-foreground mt-2">正在加载用户...</p>
                    </TableCell>
                  </TableRow>
                ) : filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center h-24">
                      <User className="h-8 w-8 mx-auto text-muted-foreground" />
                      <p className="text-muted-foreground mt-2">未找到用户</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.username}</TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs sm:text-sm font-mono truncate max-w-[100px] sm:max-w-[200px]">
                            {user.userHash}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => copyToClipboard(user.userHash)}
                          >
                            <Copy className="h-3 w-3" />
                            <span className="sr-only">复制哈希</span>
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>{user.createdBy || '-'}</TableCell>
                      <TableCell>{formatDate(user.createdAt)}</TableCell>
                      <TableCell>{user.licenseCount}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                          >
                            <a href={`/admin/users/${user.id}`}>查看</a>
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                onClick={() => setUserToDelete(user)}
                              >
                                <Trash2 className="h-4 w-4" />
                                <span className="sr-only">删除</span>
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>删除用户</AlertDialogTitle>
                                <AlertDialogDescription>
                                  您确定要删除用户 <span className="font-semibold">{user.username}</span> 吗？
                                  这将永久删除该用户及其所有关联的软件授权。此操作无法撤销。
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>取消</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={deleteUser}
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
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
      <CreateUserDialog 
        open={isDialogOpen} 
        onOpenChange={setIsDialogOpen}
        onUserCreated={handleUserCreated}
      />
    </>
  );
}