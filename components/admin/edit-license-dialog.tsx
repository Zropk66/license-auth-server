'use client';

import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  allowSelfUnbind?: boolean;
  monthlyUnbindCount?: number;
  extraUnbindCount?: number;
  hwid: string | null;
  status: string;
  licenseType: string;
  duration?: number | null;
  activatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  hardwareHistories?: {
    id: string;
    hwid: string;
    firstBoundAt: string;
    lastSeenAt: string;
  }[];
}

const formSchema = z.object({
  softwareName: z.string().min(1, '请选择所属软件'),
  expirationDate: z.date().optional(),
  durationValue: z.coerce.number().int().positive('时长必须大于0').optional(),
  durationUnit: z.enum(['minutes', 'hours', 'days', 'weeks']).default('days'),
  hardwareBindingEnabled: z.boolean(),
  allowSelfUnbind: z.boolean().default(true),
}).refine(data => {
  // If it's a fixed license, or if it's already activated (which means it behaves like fixed on expirationDate modification)
  // we require expirationDate
  return true;
});

type FormValues = z.infer<typeof formSchema>;

interface SoftwareOption {
  id: string;
  name: string;
  code?: string | null;
  enabled: boolean;
}

interface EditLicenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  license: License;
  onLicenseUpdated: (license: License) => void;
}

const formatDateForInput = (d?: Date | null) => {
  if (!d || isNaN(d.getTime())) return '';
  return format(d, 'yyyy-MM-dd HH:mm');
};

const parseDateFromInput = (str: string): Date | null => {
  if (!str.trim()) return null;
  const cleanStr = str.trim().replace(/\//g, '-');
  const d = new Date(cleanStr);
  if (!isNaN(d.getTime())) return d;
  const match = cleanStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (match) {
    const [_, y, m, day, h, min, s] = match;
    const parsed = new Date(
      parseInt(y, 10),
      parseInt(m, 10) - 1,
      parseInt(day, 10),
      h ? parseInt(h, 10) : 0,
      min ? parseInt(min, 10) : 0,
      s ? parseInt(s, 10) : 0
    );
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return null;
};

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
  const [globalUnbindEnabled, setGlobalUnbindEnabled] = useState(false);
  const [softwares, setSoftwares] = useState<SoftwareOption[]>([]);
  const [loadingSoftwares, setLoadingSoftwares] = useState(false);
  const [dateInputText, setDateInputText] = useState('');
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const initialDuration = getInitialDuration(license.duration);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      softwareName: license.softwareName,
      expirationDate: new Date(license.expirationDate),
      durationValue: initialDuration.value,
      durationUnit: initialDuration.unit,
      hardwareBindingEnabled: license.hardwareBindingEnabled,
      allowSelfUnbind: license.allowSelfUnbind !== undefined ? license.allowSelfUnbind : true,
    },
  });

  const watchHardwareBindingEnabled = form.watch('hardwareBindingEnabled');
  const prevOpenRef = useRef(false);

  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;

    if (open && !wasOpen) {
      fetchGlobalSettings();
      fetchSoftwares();
      const dur = getInitialDuration(license.duration);
      const expDate = new Date(license.expirationDate);
      setDateInputText(formatDateForInput(expDate));
      form.reset({
        softwareName: license.softwareName,
        expirationDate: expDate,
        durationValue: dur.value,
        durationUnit: dur.unit,
        hardwareBindingEnabled: license.hardwareBindingEnabled,
        allowSelfUnbind: license.allowSelfUnbind !== undefined ? license.allowSelfUnbind : true,
      });
    }
  }, [open, license, form]);

  const fetchSoftwares = async () => {
    setLoadingSoftwares(true);
    try {
      const res = await fetch('/api/admin/softwares');
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setSoftwares(data);
      }
    } catch (e) {
      console.error('Error fetching softwares:', e);
    } finally {
      setLoadingSoftwares(false);
    }
  };

  const fetchGlobalSettings = async () => {
    try {
      const res = await fetch('/api/settings/public');
      if (res.ok) {
        const data = await res.json();
        setGlobalUnbindEnabled(!!data.unbindEnabled);
      }
    } catch {}
  };

  const onSubmit = async (data: FormValues) => {
    setIsSubmitting(true);

    try {
      const payload: any = {
        softwareName: data.softwareName,
        hardwareBindingEnabled: data.hardwareBindingEnabled,
        allowSelfUnbind: data.allowSelfUnbind,
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
        description: '已成功更新授权配置',
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
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑授权</DialogTitle>
          <DialogDescription>
            更新授权详情（所属软件：{license.softwareName}）
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="softwareName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>所属软件</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={isSubmitting || loadingSoftwares}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={loadingSoftwares ? "正在加载所属软件..." : "请选择所属软件"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {loadingSoftwares ? (
                        <div className="flex items-center justify-center p-2 text-xs">
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          正在加载软件列表...
                        </div>
                      ) : softwares.length === 0 ? (
                        <div className="p-2 text-center text-xs text-muted-foreground">
                          暂无可用所属软件
                        </div>
                      ) : (
                        softwares.map((sw) => (
                          <SelectItem key={sw.id} value={sw.name}>
                            {sw.name} {sw.code ? `(${sw.code})` : ''}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
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
                    setDateInputText(formatDateForInput(newDate));
                  };

                  const handleHoursChange = (hStr: string) => {
                    const h = parseInt(hStr, 10);
                    const newDate = new Date(currentDate);
                    newDate.setHours(h);
                    field.onChange(newDate);
                    setDateInputText(formatDateForInput(newDate));
                  };

                  const handleMinutesChange = (mStr: string) => {
                    const m = parseInt(mStr, 10);
                    const newDate = new Date(currentDate);
                    newDate.setMinutes(m);
                    field.onChange(newDate);
                    setDateInputText(formatDateForInput(newDate));
                  };

                  const handleSetPermanent = () => {
                    const permDate = new Date(2099, 11, 31, 23, 59, 59, 0);
                    field.onChange(permDate);
                    setDateInputText(formatDateForInput(permDate));
                  };

                  return (
                    <FormItem className="flex flex-col">
                      <FormLabel>到期时间</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            value={dateInputText}
                            onChange={(e) => {
                              setDateInputText(e.target.value);
                              const parsed = parseDateFromInput(e.target.value);
                              if (parsed) {
                                field.onChange(parsed);
                              }
                            }}
                            onBlur={() => {
                              const parsed = parseDateFromInput(dateInputText);
                              if (parsed) {
                                field.onChange(parsed);
                                setDateInputText(formatDateForInput(parsed));
                              } else if (field.value) {
                                setDateInputText(formatDateForInput(field.value));
                              }
                            }}
                            placeholder="YYYY-MM-DD HH:mm"
                            disabled={isSubmitting}
                            className="font-mono text-sm"
                          />
                        </FormControl>
                        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              disabled={isSubmitting}
                              title="打开时间选择器"
                              className="shrink-0"
                            >
                              <CalendarIcon className="h-4 w-4 opacity-70" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0 flex flex-row" align="end">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={handleDateChange}
                              initialFocus
                            />
                            <div className="flex flex-col justify-between border-l border-border p-3 bg-muted/10 w-36">
                              <div className="space-y-3">
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
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="w-full text-xs h-7 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800/60 hover:bg-purple-50 dark:hover:bg-purple-950/30 font-medium whitespace-nowrap"
                                onClick={handleSetPermanent}
                              >
                                设为永久
                              </Button>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                      <FormDescription>
                        支持直接手动输入或点击日历图标选择时间。
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
                        允许终端用户在控制台自助解绑（遵循系统月度限次与冷却时间策略）。
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
                提示：系统设置中「用户自助换绑策略」当前为关闭状态，该卡密为一机一卡不可换绑。
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