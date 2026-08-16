import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ShieldCheck, Users, Key } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted">
      <div className="container mx-auto px-4 py-16">
        <header className="flex justify-between items-center mb-12">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold">授权管理系统</h1>
          </div>
        </header>

        <main>
          <section className="max-w-4xl mx-auto text-center mb-16">
            <h2 className="text-4xl font-bold mb-6">全面的软件授权管理解决方案</h2>
            <p className="text-xl text-muted-foreground mb-8">
              为您的软件产品提供安全、高效且易于使用的授权管理服务。
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild size="lg" className="gap-2">
                <Link href="/admin/login">
                  <Users className="h-5 w-5" />
                  管理员后台
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="gap-2">
                <Link href="/user/login">
                  <Key className="h-5 w-5" />
                  用户中心
                </Link>
              </Button>
            </div>
          </section>

          <section className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
            <div className="bg-card rounded-lg p-6 shadow-sm border">
              <div className="mb-4 p-3 bg-primary/10 rounded-md w-fit">
                <ShieldCheck className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">管理员后台</h3>
              <p className="text-muted-foreground">
                为管理员提供全面的仪表盘，用于管理用户、授权证书并监控系统活动。
              </p>
            </div>

            <div className="bg-card rounded-lg p-6 shadow-sm border">
              <div className="mb-4 p-3 bg-primary/10 rounded-md w-fit">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">用户中心</h3>
              <p className="text-muted-foreground">
                为客户提供友好的用户界面，用于查看和管理其授权及相关详情。
              </p>
            </div>

            <div className="bg-card rounded-lg p-6 shadow-sm border">
              <div className="mb-4 p-3 bg-primary/10 rounded-md w-fit">
                <Key className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">授权 API</h3>
              <p className="text-muted-foreground">
                安全且加密的 API，用于授权验证，支持硬件 ID 绑定功能。
              </p>
            </div>
          </section>
        </main>

<footer className="text-center text-sm text-muted-foreground">
  <p>
    © {new Date().getFullYear()} 授权管理系统。保留所有权利。
    <br />
    开发人 <span className="font-semibold">Zropk66</span> &nbsp;|&nbsp;
    <a
      href="https://github.com/Zropk66/license-auth-server"
      className="underline hover:text-blue-600"
      target="_blank"
      rel="noopener noreferrer"
    >
      在 GitHub 上查看
    </a>
  </p>
</footer>
      </div>
    </div>
  );
}