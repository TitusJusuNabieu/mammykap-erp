import { Sidebar } from '@/components/layout/sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-background">
      <Sidebar />
      <div className="pl-60">
        <main className="min-h-screen p-6">{children}</main>
      </div>
    </div>
  );
}
