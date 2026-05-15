import * as React from "react";
import { cn } from "@root/lib/utils";

interface MainProps extends React.HTMLAttributes<HTMLElement> {
  fixed?: boolean;
  fluid?: boolean;
}

export function Main({ fixed, className, fluid, ...props }: MainProps) {
  return (
    <main
      data-layout={fixed ? "fixed" : "auto"}
      className={cn(
        "flex flex-1 flex-col gap-4 p-4 sm:gap-6 sm:p-6",
        fixed && "grow overflow-hidden",
        !fluid && "mx-auto w-full max-w-7xl",
        className,
      )}
      {...props}
    />
  );
}
