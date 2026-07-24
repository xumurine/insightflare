import { useEffect, useState } from "react";
import { RiMoonLine, RiSunLine } from "@remixicon/react";

import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  lightLabel: string;
  darkLabel: string;
  className?: string;
}

export function ThemeToggle({
  lightLabel,
  darkLabel,
  className,
}: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      onClick={() => {
        setTheme(isDark ? "light" : "dark");
      }}
      className={cn("gap-1.5", className)}
    >
      {isDark ? <RiSunLine /> : <RiMoonLine />}
      <span>{isDark ? lightLabel : darkLabel}</span>
    </Button>
  );
}
