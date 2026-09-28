"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarCheck,
  FileText,
  Inbox,
  Settings,
  Users,
  HeartHandshake,
  LogOut,
  Plus,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AppSidebar({
  user,
  counts,
}: {
  user: { name: string; email: string };
  counts: { today: number; inbox: number; customers: number };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const NAV = [
    { href: "/today", label: "Today", icon: CalendarCheck, count: counts.today },
    { href: "/prospects", label: "Prospects", icon: Users, count: 0 },
    { href: "/customers", label: "Customers", icon: HeartHandshake, count: counts.customers },
    { href: "/articles", label: "Articles", icon: FileText, count: 0 },
    { href: "/inbox", label: "Inbox", icon: Inbox, count: counts.inbox },
    { href: "/settings", label: "Settings", icon: Settings, count: 0 },
  ];

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <Link href="/today" className="flex h-14 items-center gap-2.5 border-b px-4 transition-colors hover:bg-sidebar-accent/50">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary font-heading text-sm font-bold text-primary-foreground">
          N
        </div>
        <span className="font-heading text-[15px] font-semibold tracking-tight">Nexa</span>
      </Link>
      <div className="p-2 pb-0">
        <Link
          href="/prospects/new"
          className="flex items-center justify-center gap-1.5 rounded-md border border-dashed border-sidebar-border bg-card/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />Add a business
        </Link>
      </div>
      <nav className="flex-1 space-y-0.5 p-2">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
            >
              <item.icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} />
              <span className="flex-1">{item.label}</span>
              {item.count > 0 && (
                <span
                  className={cn(
                    "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold",
                    item.href === "/today" || item.href === "/inbox" || item.href === "/customers"
                      ? "bg-primary text-primary-foreground"
                      : "bg-sidebar-accent text-muted-foreground",
                  )}
                >
                  {item.count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-2">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left hover:bg-sidebar-accent/60">
            <Avatar className="h-7 w-7">
              <AvatarFallback className="bg-accent text-[11px] text-accent-foreground">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{user.name}</div>
              <div className="truncate text-xs text-muted-foreground">{user.email}</div>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuItem
              onClick={async () => {
                await supabaseBrowser().auth.signOut();
                router.push("/login");
                router.refresh();
              }}
            >
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
