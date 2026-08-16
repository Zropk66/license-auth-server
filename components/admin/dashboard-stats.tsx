'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { User, Dice1 as License, Clock, CheckCircle, AlertCircle, Activity } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { formatDate, formatOnlyDate } from '@/lib/utils';

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

export default function DashboardStats() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/admin/dashboard/stats');
        const data = await response.json();

        if (response.ok) {
          setStats(data);
        }
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();

    const timer = setInterval(() => {
      fetchStats();
    }, 10000);

    return () => clearInterval(timer);
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
        <CardHeader>
          <CardTitle className="text-lg flex items-center">
            <Clock className="h-5 w-5 mr-2 text-muted-foreground" />
            近期授权动态
          </CardTitle>
          <CardDescription>
            过去 7 天内新生成和新激活的授权趋势
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={placeholderStats.recentActivity}
                margin={{
                  top: 5,
                  right: 30,
                  left: 20,
                  bottom: 60,
                }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  angle={-45}
                  textAnchor="end"
                  height={60}
                  tick={{ fontSize: 12 }}
                />
                <YAxis allowDecimals={false} />
                <Tooltip
                  formatter={(value, name) => [`${value} 个`, name]}
                  labelFormatter={(label) => `日期: ${label}`}
                />
                <Legend verticalAlign="top" height={36} />
                <Bar
                  dataKey="created"
                  name="新生成授权"
                  fill="hsl(var(--chart-1))"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="activated"
                  name="新激活授权"
                  fill="hsl(var(--chart-2))"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
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