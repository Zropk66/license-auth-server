'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const formSchema = z.object({
  userId: z.string().min(1, '请选择用户'),
  softwareName: z.string().min(3, '软件名称至少需要3个字符'),
  licenseType: z.enum(['fixed', 'duration']).default('fixed'),
  expirationDate: z.date().optional(),
  durationValue: z.coerce.number().int().positive('时长必须大于0').optional(),
  durationUnit: z.enum(['minutes', 'hours', 'days', 'weeks']).default('days'),
  hardwareBindingEnabled: z.boolean().default(false),
  allowSelfUnbind: z.boolean().default(true),
}).refine(data => {
  if (data.licenseType === 'fixed') {
    return !!data.expirationDate && data.expirationDate > new Date();
  }
  return true;
}, {
  message: '过期时间是必填项且必须在未来',
  path: ['expirationDate']
}).refine(data => {
  if (data.licenseType === 'duration') {
    return !!data.durationValue && data.durationValue > 0;
  }
  return true;
}, {
  message: '请填写合法的授权时长',
  path: ['durationValue']
});

type FormValues = z.infer<typeof formSchema>;

interface User {
  id: string;
  username: string;
}

interface CreateLicenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLicenseCreated: (license: any) => void;
}

export default function CreateLicenseDialog({
  open,
  onOpenChange,
  onLicenseCreated,
}: CreateLicenseDialogProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [globalUnbindEnabled, setGlobalUnbindEnabled] = useState(false);
  const [globalDefaultAllow, setGlobalDefaultAllow] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      userId: '',
      softwareName: '',
      licenseType: 'fixed',
      expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      durationValue: 30,
      durationUnit: 'days',
      hardwareBindingEnabled: false,
      allowSelfUnbind: false,
    },
  });

  const watchLicenseType = form.watch('licenseType');
  const watchHardwareBindingEnabled = form.watch('hardwareBindingEnabled');

  useEffect(() => {
    if (open) {
      fetchUsers();
      fetchGlobalSettings();
    }
  }, [open]);

  const fetchGlobalSettings = async () => {
    try {
      const res = await fetch('/api/settings/public');
      if (res.ok) {
        const data = await res.json();
        const isEnabled = !!data.unbindEnabled;
        const defaultAllow = !!data.unbindDefaultAllow;
        setGlobalUnbindEnabled(isEnabled);
        setGlobalDefaultAllow(defaultAllow);
        form.setValue('allowSelfUnbind', isEnabled && defaultAllow);
      }
    } catch {}
  };

  const fetchUsers = async () => {
    setLoadingUsers(true);
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
      setLoadingUsers(false);
    }
  };

  const onSubmit = async (data: FormValues) => {
    setIsSubmitting(true);

    try {
      const payload: any = {
        userId: data.userId,
        softwareName: data.softwareName,
        licenseType: data.licenseType,
        hardwareBindingEnabled: data.hardwareBindingEnabled,
        allowSelfUnbind: data.allowSelfUnbind,
      };

      if (data.licenseType === 'fixed') {
        payload.expirationDate = data.expirationDate;
      } else {
        let multiplier = 1;
        if (data.durationUnit === 'hours') multiplier = 60;
        else if (data.durationUnit === 'days') multiplier = 24 * 60;
        else if (data.durationUnit === 'weeks') multiplier = 7 * 24 * 60;
        payload.duration = data.durationValue! * multiplier;
      }

      const response = await fetch('/api/admin/licenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '创建授权失败');
      }

      toast({
        title: '授权已创建',
        description: '已成功创建授权',
      });

      form.reset({
        userId: '',
        softwareName: '',
        licenseType: 'fixed',
        expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        durationValue: 30,
        durationUnit: 'days',
        hardwareBindingEnabled: false,
        allowSelfUnbind: globalUnbindEnabled && globalDefaultAllow,
      });
      onOpenChange(false);
      onLicenseCreated(result);
    } catch (error) {
      toast({
        title: '错误',
        description: error instanceof Error ? error.message : '创建授权失败',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>创建新授权</DialogTitle>
          <DialogDescription>
            为用户创建新的授权密钥。授权密钥将自动生成。
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="userId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>选择用户</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    disabled={isSubmitting || loadingUsers}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="请选择一个用户" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {loadingUsers ? (
                        <div className="flex items-center justify-center p-2">
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          正在加载用户...
                        </div>
                      ) : users.length === 0 ? (
                        <div className="p-2 text-center text-muted-foreground">
                          未找到用户
                        </div>
                      ) : (
                        users.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.username}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="softwareName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>软件名称</FormLabel>
                  <FormControl>
                    <Input placeholder="请输入软件名称" {...field} disabled={isSubmitting} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="licenseType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>到期类型</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    disabled={isSubmitting}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="请选择到期类型" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="fixed">即时卡 (创建即刻生效)</SelectItem>
                      <SelectItem value="duration">激活卡 (首次登录起算时长)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {watchLicenseType === 'fixed' ? (
              <FormField
                control={form.control}
                name="expirationDate"
                render={({ field }) => {
                  const currentDate = field.value || new Date();
                  const hours = currentDate.getHours();
                  const minutes = currentDate.getMinutes();

                  const handleDateChange = (date: Date | undefined) => {
                    if (!date) return;
                    const newDate = new Date(date);
                    newDate.setHours(hours);
                    newDate.setMinutes(minutes);
                    newDate.setSeconds(0);
                    newDate.setMilliseconds(0);
                    field.onChange(newDate);
                  };

                  const handleHoursChange = (hStr: string) => {
                    const h = parseInt(hStr, 10);
                    const newDate = new Date(currentDate);
                    newDate.setHours(h);
                    field.onChange(newDate);
                  };

                  const handleMinutesChange = (mStr: string) => {
                    const m = parseInt(mStr, 10);
                    const newDate = new Date(currentDate);
                    newDate.setMinutes(m);
                    field.onChange(newDate);
                  };

                  return (
                    <FormItem className="flex flex-col">
                      <FormLabel>到期时间</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                              disabled={isSubmitting}
                            >
                              {field.value ? (
                                format(field.value, "yyyy年MM月dd日 HH:mm")
                              ) : (
                                <span>选择日期</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 flex flex-row" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={handleDateChange}
                            disabled={(date) => {
                              const today = new Date();
                              today.setHours(0, 0, 0, 0);
                              return date < today;
                            }}
                            initialFocus
                          />
                          <div className="flex flex-col justify-center border-l border-border px-4 py-2 gap-3 bg-muted/10 w-32">
                            <div className="text-xs font-semibold text-muted-foreground text-center">具体时间</div>
                            <div className="flex flex-col gap-2 items-center">
                              <div className="flex items-center gap-1">
                                <select
                                  value={String(hours).padStart(2, '0')}
                                  onChange={(e) => handleHoursChange(e.target.value)}
                                  disabled={isSubmitting}
                                  className="border rounded p-1 bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-ring w-12 text-center"
                                >
                                  {Array.from({ length: 24 }, (_, i) => {
                                    const val = String(i).padStart(2, '0');
                                    return (
                                      <option key={val} value={val}>
                                        {val}
                                      </option>
                                    );
                                  })}
                                </select>
                                <span className="text-xs font-medium text-muted-foreground">时</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <select
                                  value={String(minutes).padStart(2, '0')}
                                  onChange={(e) => handleMinutesChange(e.target.value)}
                                  disabled={isSubmitting}
                                  className="border rounded p-1 bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-ring w-12 text-center"
                                >
                                  {Array.from({ length: 60 }, (_, i) => {
                                    const val = String(i).padStart(2, '0');
                                    return (
                                      <option key={val} value={val}>
                                        {val}
                                      </option>
                                    );
                                  })}
                                </select>
                                <span className="text-xs font-medium text-muted-foreground">分</span>
                              </div>
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                      <FormDescription>
                        授权将在所选时间的具体分秒失效。
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
            ) : (
              <div className="grid grid-cols-3 gap-2 items-end">
                <div className="col-span-2">
                  <FormField
                    control={form.control}
                    name="durationValue"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>授权时长</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="请输入数字"
                            {...field}
                            disabled={isSubmitting}
                            min={1}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div>
                  <FormField
                    control={form.control}
                    name="durationUnit"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                            disabled={isSubmitting}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="minutes">分钟</SelectItem>
                              <SelectItem value="hours">小时</SelectItem>
                              <SelectItem value="days">天</SelectItem>
                              <SelectItem value="weeks">周</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            )}

            <FormField
              control={form.control}
              name="hardwareBindingEnabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">HWID 绑定</FormLabel>
                    <FormDescription>
                      启用后，授权将与特定的HWID 绑定。
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {watchHardwareBindingEnabled && globalUnbindEnabled && (
              <FormField
                control={form.control}
                name="allowSelfUnbind"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 bg-muted/20">
                    <div className="space-y-0.5">
                      <FormLabel className="text-sm font-medium">允许用户端自助换绑设备</FormLabel>
                      <FormDescription className="text-xs">
                        允许终端用户在个人控制台自助解绑（遵循系统月度限次与冷却时间策略）。
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isSubmitting}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}

            {watchHardwareBindingEnabled && !globalUnbindEnabled && (
              <div className="p-2.5 border rounded-lg bg-muted/20 text-xs text-muted-foreground">
                提示：系统设置中「用户自助换绑策略」当前为关闭状态，该卡密将严格执行一机一卡不可换绑。
              </div>
            )}

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
                    正在创建...
                  </>
                ) : (
                  '创建授权'
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}