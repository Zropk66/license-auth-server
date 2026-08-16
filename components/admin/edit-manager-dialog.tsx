'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const formSchema = z.object({
  password: z.string().refine((val) => val === '' || val.length >= 6, {
    message: '密码至少需要6个字符',
  }),
  role: z.enum(['admin', 'owner']),
});

type FormValues = z.infer<typeof formSchema>;

interface Manager {
  id: string;
  username: string;
  role: string;
  createdAt: string;
}

interface EditManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  manager: Manager | null;
  currentAdminId: string | null;
  onManagerUpdated: (manager: Manager) => void;
}

export default function EditManagerDialog({
  open,
  onOpenChange,
  manager,
  currentAdminId,
  onManagerUpdated,
}: EditManagerDialogProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      password: '',
      role: 'admin',
    },
  });

  useEffect(() => {
    if (manager) {
      form.reset({
        password: '',
        role: manager.role as 'admin' | 'owner',
      });
    }
  }, [manager, form]);

  const onSubmit = async (data: FormValues) => {
    if (!manager) return;
    setIsSubmitting(true);

    const body: Record<string, string> = {
      role: data.role,
    };
    if (data.password) {
      body.password = data.password;
    }

    try {
      const response = await fetch(`/api/admin/managers/${manager.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '更新管理员失败');
      }

      toast({
        title: '更新成功',
        description: '已成功更新管理员账号信息',
      });

      form.reset({
        password: '',
        role: result.role,
      });
      onOpenChange(false);
      onManagerUpdated(result);
    } catch (error) {
      toast({
        title: '错误',
        description: error instanceof Error ? error.message : '更新管理员失败',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isSelf = manager?.id === currentAdminId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑管理员: {manager?.username}</DialogTitle>
          <DialogDescription>
            修改管理员角色或重置其密码。如果不需要修改密码，请留空。
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>新密码 (留空则不修改)</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="请输入新密码" {...field} disabled={isSubmitting} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>角色</FormLabel>
                  <Select
                    disabled={isSubmitting || isSelf}
                    onValueChange={field.onChange}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="请选择角色" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="admin">普通管理员 (admin)</SelectItem>
                      <SelectItem value="owner">系统所有者 (owner)</SelectItem>
                    </SelectContent>
                  </Select>
                  {isSelf && (
                    <FormDescription className="text-amber-500 font-medium">
                      您正在编辑自己的账号，为了防止系统锁定，无法在此修改您自己的角色。
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                取消
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    正在保存...
                  </>
                ) : (
                  '保存修改'
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
