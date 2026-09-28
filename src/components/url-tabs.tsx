"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export type UrlTab = {
  value: string;
  label: string;
  count?: number;
  content: React.ReactNode;
};

/**
 * Tabs that live in the URL (?tab=…) so "jump to messages" links work
 * and refreshing keeps you where you were.
 */
export function UrlTabs({ defaultValue, tabs }: { defaultValue: string; tabs: UrlTab[] }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const current = tabs.some((t) => t.value === searchParams.get("tab"))
    ? (searchParams.get("tab") as string)
    : defaultValue;

  return (
    <Tabs
      value={current}
      onValueChange={(v) => {
        const tab = String(v);
        router.replace(tab === defaultValue ? pathname : `${pathname}?tab=${tab}`, { scroll: false });
      }}
    >
      <TabsList>
        {tabs.map((t) => (
          <TabsTrigger key={t.value} value={t.value} className="px-3">
            {t.label}
            {typeof t.count === "number" && t.count > 0 && (
              <span className="ml-1 text-xs text-muted-foreground">{t.count}</span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent key={t.value} value={t.value} className="mt-4">
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
