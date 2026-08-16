import { ReactNode } from "react";
import { Outlet } from "react-router";
import { AppSidebar } from "./AppSidebar";

export function AppShell({ children }: { children?: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="lg:pl-64 min-h-screen">
        <div className="p-4 sm:p-6 lg:p-8">
          {children ?? <Outlet />}
        </div>
      </main>
    </div>
  );
}
