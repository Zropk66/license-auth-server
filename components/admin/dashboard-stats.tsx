'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { User, Dice1 as License, Clock, CheckCircle, AlertCircle, Activity, BarChart3, Table as TableIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatOnlyDate, cn } from '@/lib/utils';

type StatsData = {
  totalUsers: number;
  totalLicenses: number;
  activeUsers: number;
  activeUsersPercent: number;
  expiringSoonLicenses: number;
  onlineSessions: number;
  recentActivity: {
    date: string;
    created: number;
    activated: number;
  }[];
  types: {
    duration: number;
    fixed: number;
  };
  statuses: {
    valid: number;
    unactivated: number;
    expired: number;
    suspended: number;
    revoked: number;
  };
};

function ActivityBarChart({ data }: { data: { date: string; created: number; activated: number }[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const maxVal = Math.max(5, ...data.map((d) => Math.max(d.created, d.activated)));
  const yMax = Math.ceil(maxVal / 5) * 5;

  const chartHeight = 180;
  const chartWidth = 600;
  const paddingLeft = 40;
  const paddingRight = 20;
  const paddingTop = 24;
  const paddingBottom = 36;

  const plotWidth = chartWidth - paddingLeft - paddingRight;
  const plotHeight = chartHeight;

  const yTicks = [0, Math.round(yMax * 0.25), Math.round(yMax * 0.5), Math.round(yMax * 0.75), yMax];
  const groupWidth = plotWidth / Math.max(1, data.length);
  const barWidth = Math.min(20, groupWidth * 0.32);

  return (
    <div className="w-full flex flex-col items-center select-none">
      <div className="flex items-center justify-center gap-6 mb-3 text-xs font-medium">
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-blue-500 inline-block" />
          <span>新生成授权</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-emerald-500 inline-block" />
          <span>新激活授权</span>
        </div>
      </div>

      <div className="relative w-full max-w-[700px]">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight + paddingTop + paddingBottom}`}
          className="w-full h-auto overflow-visible"
        >
          {yTicks.map((tick) => {
            const y = paddingTop + plotHeight - (tick / yMax) * plotHeight;
            return (
              <g key={tick} className="text-muted-foreground">
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={chartWidth - paddingRight}
                  y2={y}
                  stroke="currentColor"
                  strokeOpacity={0.15}
                  strokeDasharray="4 4"
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  fill="currentColor"
                  className="font-mono text-[10px]"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {data.map((item, idx) => {
            const groupX = paddingLeft + idx * groupWidth;
            const centerX = groupX + groupWidth / 2;

            const createdHeight = (item.created / yMax) * plotHeight;
            const createdY = paddingTop + plotHeight - createdHeight;

            const activatedHeight = (item.activated / yMax) * plotHeight;
            const activatedY = paddingTop + plotHeight - activatedHeight;

            const isHovered = hoveredIndex === idx;

            return (
              <g
                key={item.date}
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
                className="cursor-pointer"
              >
                <rect
                  x={groupX + 2}
                  y={paddingTop}
                  width={groupWidth - 4}
                  height={plotHeight}
                  fill="currentColor"
                  className={cn(
                    "text-muted/20 transition-opacity rounded",
                    isHovered ? "opacity-100" : "opacity-0"
                  )}
                  rx={4}
                />

                <rect
                  x={centerX - barWidth - 2}
                  y={createdHeight > 0 ? createdY : paddingTop + plotHeight - 2}
                  width={barWidth}
                  height={createdHeight > 0 ? createdHeight : 2}
                  fill="#3b82f6"
                  rx={createdHeight > 3 ? 3 : 0}
                  className="transition-all duration-300 hover:brightness-110"
                />

                <rect
                  x={centerX + 2}
                  y={activatedHeight > 0 ? activatedY : paddingTop + plotHeight - 2}
                  width={barWidth}
                  height={activatedHeight > 0 ? activatedHeight : 2}
                  fill="#10b981"
                  rx={activatedHeight > 3 ? 3 : 0}
                  className="transition-all duration-300 hover:brightness-110"
                />

                {item.created > 0 && (
                  <text
                    x={centerX - barWidth / 2 - 2}
                    y={createdY - 4}
                    textAnchor="middle"
                    fill="#3b82f6"
                    className="text-[10px] font-bold"
                  >
                    {item.created}
                  </text>
                )}
                {item.activated > 0 && (
                  <text
                    x={centerX + barWidth / 2 + 2}
                    y={activatedY - 4}
                    textAnchor="middle"
                    fill="#10b981"
                    className="text-[10px] font-bold"
                  >
                    {item.activated}
                  </text>
                )}

                <text
                  x={centerX}
                  y={paddingTop + plotHeight + 20}
                  textAnchor="middle"
                  fill="currentColor"
                  className={cn(
                    "text-[11px] font-mono transition-colors",
                    isHovered ? "font-semibold fill-primary" : "fill-muted-foreground"
                  )}
                >
                  {item.date.length > 5 ? item.date.slice(5) : item.date}
                </text>
              </g>
            );
          })}
        </svg>

        {hoveredIndex !== null && data[hoveredIndex] && (
          <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-popover/95 backdrop-blur border shadow-md rounded-md px-3 py-1 text-xs pointer-events-none z-10 flex items-center gap-3">
            <span className="font-semibold">{data[hoveredIndex].date}</span>
            <span className="text-blue-600 dark:text-blue-400">
              新生成: {data[hoveredIndex].created} 个
            </span>
            <span className="text-emerald-600 dark:text-emerald-400">
              新激活: {data[hoveredIndex].activated} 个
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardStats() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const fetchStats = async (showLoading = false) => {
      if (showLoading) setIsLoading(true);
      try {
        const response = await fetch('/api/admin/dashboard/stats');
        const data = await response.json();

        if (response.ok) {
          setStats(prev => {
            if (!prev) return data;
            if (JSON.stringify(prev) === JSON.stringify(data)) return prev;
            return data;
          });
        }
      } catch (error) {
        if (showLoading) {
          console.error('Failed to fetch stats:', error);
        } else {
          console.warn('Silent refresh stats failed:', error);
        }
      } finally {
        if (showLoading) setIsLoading(false);
      }
    };

    fetchStats(true);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchStats(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchStats(false);
      }
    }, 10000);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
        {[...Array(5)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-2">
              <div className="h-4 bg-muted rounded w-24 mb-2"></div>
              <div className="h-3 bg-muted rounded w-16"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-muted rounded w-16"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // Placeholder data for initial load
  const placeholderStats: StatsData = stats || {
    totalUsers: 0,
    totalLicenses: 0,
    activeUsers: 0,
    activeUsersPercent: 0,
    expiringSoonLicenses: 0,
    onlineSessions: 0,
    recentActivity: [
      { date: formatOnlyDate(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)), created: 0, activated: 0 },
      { date: formatOnlyDate(new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)), created: 0, activated: 0 },
      { date: formatOnlyDate(new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)), created: 0, activated: 0 },
      { date: formatOnlyDate(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)), created: 0, activated: 0 },
      { date: formatOnlyDate(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)), created: 0, activated: 0 },
      { date: formatOnlyDate(new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)), created: 0, activated: 0 },
      { date: formatOnlyDate(new Date()), created: 0, activated: 0 },
    ],
    types: {
      duration: 0,
      fixed: 0,
    },
    statuses: {
      valid: 0,
      unactivated: 0,
      expired: 0,
      suspended: 0,
      revoked: 0,
    }
  };

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <User className="h-4 w-4 mr-2 text-muted-foreground" />
              用户总数
            </CardTitle>
            <CardDescription>所有已注册用户</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{placeholderStats.totalUsers}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <License className="h-4 w-4 mr-2 text-muted-foreground" />
              授权总数
            </CardTitle>
            <CardDescription>所有已生成的授权密钥</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{placeholderStats.totalLicenses}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <CheckCircle className="h-4 w-4 mr-2 text-muted-foreground" />
              活跃用户
            </CardTitle>
            <CardDescription>拥有有效授权的用户</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {placeholderStats.activeUsers}
              <span className="text-sm font-normal text-muted-foreground ml-2">
                ({placeholderStats.activeUsersPercent}%)
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <Activity className="h-4 w-4 mr-2 text-muted-foreground text-emerald-500 animate-pulse" />
              在线用户
            </CardTitle>
            <CardDescription>当前在线活动客户端</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{placeholderStats.onlineSessions}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <AlertCircle className="h-4 w-4 mr-2 text-muted-foreground" />
              即将过期
            </CardTitle>
            <CardDescription>30天内到期的授权</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{placeholderStats.expiringSoonLicenses}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-8">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <CardTitle className="text-lg flex items-center">
              <Clock className="h-5 w-5 mr-2 text-muted-foreground" />
              近期授权动态
            </CardTitle>
            <CardDescription>
              过去 7 天内新生成和新激活的授权趋势
            </CardDescription>
          </div>
          <div className="flex items-center gap-1 border rounded-lg p-0.5 bg-muted/40">
            <Button
              type="button"
              variant={viewMode === 'chart' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => setViewMode('chart')}
            >
              <BarChart3 className="h-3.5 w-3.5 mr-1" />
              柱状图
            </Button>
            <Button
              type="button"
              variant={viewMode === 'table' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => setViewMode('table')}
            >
              <TableIcon className="h-3.5 w-3.5 mr-1" />
              数据表
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {viewMode === 'chart' ? (
            <div className="w-full py-2">
              <ActivityBarChart data={placeholderStats.recentActivity} />
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>日期</TableHead>
                    <TableHead className="text-center">新生成授权数</TableHead>
                    <TableHead className="text-center">新激活授权数</TableHead>
                    <TableHead className="text-right">当日合计</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {placeholderStats.recentActivity.map((item) => (
                    <TableRow key={item.date}>
                      <TableCell className="font-mono text-xs">{item.date}</TableCell>
                      <TableCell className="text-center font-medium text-blue-600 dark:text-blue-400">
                        {item.created} 个
                      </TableCell>
                      <TableCell className="text-center font-medium text-emerald-600 dark:text-emerald-400">
                        {item.activated} 个
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {item.created + item.activated} 个
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">卡密类型分布</CardTitle>
            <CardDescription>各卡密类型的授权占比数量</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center pb-2 border-b">
              <span className="text-sm font-medium">即时卡 (固定过期)</span>
              <span className="font-semibold">{placeholderStats.types.fixed} 个</span>
            </div>
            <div className="flex justify-between items-center pb-2 border-b">
              <span className="text-sm font-medium">激活卡 (时长起算)</span>
              <span className="font-semibold">{placeholderStats.types.duration} 个</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">状态分布</CardTitle>
            <CardDescription>当前各类状态的授权明细数量</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="flex flex-col p-3 border rounded-lg bg-emerald-500/5 border-emerald-500/10">
              <span className="text-xs text-muted-foreground">有效授权</span>
              <span className="text-lg font-bold text-emerald-600">{placeholderStats.statuses.valid}</span>
            </div>
            <div className="flex flex-col p-3 border rounded-lg bg-yellow-500/5 border-yellow-500/10">
              <span className="text-xs text-muted-foreground">待激活</span>
              <span className="text-lg font-bold text-yellow-600">{placeholderStats.statuses.unactivated}</span>
            </div>
            <div className="flex flex-col p-3 border rounded-lg bg-rose-500/5 border-rose-500/10">
              <span className="text-xs text-muted-foreground">已到期</span>
              <span className="text-lg font-bold text-rose-600">{placeholderStats.statuses.expired}</span>
            </div>
            <div className="flex flex-col p-3 border rounded-lg bg-slate-500/5 border-slate-500/10">
              <span className="text-xs text-muted-foreground">已冻结</span>
              <span className="text-lg font-bold text-slate-600">{placeholderStats.statuses.suspended}</span>
            </div>
            <div className="flex flex-col p-3 border rounded-lg bg-red-500/5 border-red-500/10 col-span-2">
              <span className="text-xs text-muted-foreground">已撤销</span>
              <span className="text-lg font-bold text-red-600">{placeholderStats.statuses.revoked}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}