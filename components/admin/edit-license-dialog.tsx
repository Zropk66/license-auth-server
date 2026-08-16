'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface License {
  id: string;
  licenseKey: string;
  userId: string;
  username: string;
  softwareName: string;
  expirationDate: string;
  hardwareBindingEnabled: boolean;
  hardwareId: string | null;
  status: string;
  licenseType: string;
  duration?: number | null;
  activatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

const formSchema = z.object({
  softwareName: z.string().min(3, '软件名称至少需要3个字符'),
  expirationDate: z.date().optional(),
  durationValue: z.coerce.number().int().positive('时长必须大于0').optional(),
  durationUnit: z.enum(['minutes', 'hours', 'days', 'weeks']).default('days'),
  hardwareBindingEnabled: z.boolean(),
}).refine(data => {
  // If it's a fixed license, or if it's already activated (which means it behaves like fixed on expirationDate modification)
  // we require expirationDate
  return true;
});

type FormValues = z.infer<typeof formSchema>;

interface EditLicenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  license: License;
  onLicenseUpdated: (license: License) => void;
}

const getInitialDuration = (minutes?: number | null) => {
  if (!minutes) return { value: 30, unit: 'days' as const };
  if (minutes % (7 * 24 * 60) === 0) return { value: minutes / (7 * 24 * 60), unit: 'weeks' as const };
  if (minutes % (24 * 60) === 0) return { value: minutes / (24 * 60), unit: 'days' as const };
  if (minutes % 60 === 0) return { value: minutes / 60, unit: 'hours' as const };
  return { value: minutes, unit: 'minutes' as const };
};

export default function EditLicenseDialog({
  open,
  onOpenChange,
  license,
  onLicenseUpdated,
}: EditLicenseDialogProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResettingHardware, setIsResettingHardware] = useState(false);

  const initialDuration = getInitialDuration(license.duration);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      softwareName: license.softwareName,
      expirationDate: new Date(license.expirationDate),
      durationValue: initialDuration.value,
      durationUnit: initialDuration.unit,
      hardwareBindingEnabled: license.hardwareBindingEnabled,
    },
  });

  const onSubmit = async (data: FormValues) => {
    setIsSubmitting(true);

    try {
      const payload: any = {
        softwareName: data.softwareName,
        hardwareBindingEnabled: data.hardwareBindingEnabled,
      };

      const isUnactivatedDuration = license.status === 'unactivated' && license.licenseType === 'duration';

      if (isUnactivatedDuration) {
        let multiplier = 1;
        if (data.durationUnit === 'hours') multiplier = 60;
        else if (data.durationUnit === 'days') multiplier = 24 * 60;
        else if (data.durationUnit === 'weeks') multiplier = 7 * 24 * 60;
        payload.duration = data.durationValue! * multiplier;
      } else {
        payload.expirationDate = data.expirationDate;
      }

      const response = await fetch(`/api/admin/licenses/${license.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '更新授权失败');
      }

      toast({
        title: '授权已更新',
        description: '已成功更新授权',
      });

      onOpenChange(false);
      onLicenseUpdated(result);
    } catch (error) {
      toast({
        title: '错误',
        description: error instanceof Error ? error.message : '更新授权失败',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetHardwareId = async () => {
    if (!license.hardwareId) return;

    setIsResettingHardware(true);
    try {
      const response = await fetch(`/api/admin/licenses/${license.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          resetHardwareId: true,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '重置硬件 ID 失败');
      }

      toast({
        title: '硬件 ID 已重置',
        description: '已成功重置硬件 ID',
      });

      onLicenseUpdated(result);
    } catch (error) {
      toast({
        title: '错误',
        description: error instanceof Error ? error.message : '重置硬件 ID 失败',
        variant: 'destructive',
      });
    } finally {
      setIsResettingHardware(false);
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑授权</DialogTitle>
          <DialogDescription>
            更新授权详情：{license.softwareName}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

            {license.status === 'unactivated' && license.licenseType === 'duration' ? (
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
            ) : (
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
            )}

            <FormField
              control={form.control}
              name="hardwareBindingEnabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">硬件绑定</FormLabel>
                    <FormDescription>
                      启用后，授权将与特定的硬件 ID 绑定。
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

            {license.hardwareBindingEnabled && license.hardwareId && (
              <div className="p-3 border rounded-lg">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="text-sm font-medium">当前硬件 ID</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      此授权目前已与特定硬件绑定。
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetHardwareId}
                    disabled={isResettingHardware || !license.hardwareId}
                  >
                    {isResettingHardware ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        正在重置...
                      </>
                    ) : (
                      '重置 ID'
                    )}
                  </Button>
                </div>
                <div className="mt-2">
                  <code className="text-xs bg-muted p-1 rounded break-all block">
                    {license.hardwareId}
                  </code>
                </div>
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
                    正在更新...
                  </>
                ) : (
                  '更新授权'
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}