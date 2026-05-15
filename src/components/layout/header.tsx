"use client";

import * as React from "react";
import { cn } from "@root/lib/utils";
import { Separator } from "@root/components/ui/separator";
import { SidebarTrigger } from "@root/components/ui/sidebar";

interface HeaderProps extends React.HTMLAttributes<HTMLElement> {
  fixed?: boolean;
}

export function Header({ className, fixed, children, ...props }: HeaderProps) {
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    document.addEventListener("scroll", onScroll, { passive: true });
    return () => document.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "z-40 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur sm:gap-4",
        fixed && "sticky top-0",
        scrolled && fixed && "shadow-sm",
        className,
      )}
      {...props}
    >
      <SidebarTrigger variant="outline" className="max-md:scale-125" />
      <Separator orientation="vertical" className="h-6" />
      <div className="flex flex-1 items-center gap-3 sm:gap-4">{children}</div>
    </header>
  );
}

export function PageHeading({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
