"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RiTranslate2 } from "@remixicon/react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n/config";

interface AccountLinkPageActionsProps {
  locale: Locale;
  path: "/invite" | "/reset-password";
  lightLabel: string;
  darkLabel: string;
  englishLabel: string;
  chineseLabel: string;
}

export function AccountLinkPageActions({
  locale,
  path,
  lightLabel,
  darkLabel,
  englishLabel,
  chineseLabel,
}: AccountLinkPageActionsProps) {
  const [hash, setHash] = useState("");

  useEffect(() => {
    setHash(window.location.hash);
  }, []);

  return (
    <div className="flex items-center gap-1">
      <ThemeToggle
        lightLabel={lightLabel}
        darkLabel={darkLabel}
        className="w-fit self-end"
      />
      <Button
        variant={locale === "en" ? "default" : "outline"}
        size="xs"
        asChild
      >
        <Link href={`/en${path}${hash}`}>
          <RiTranslate2 className="size-3" />
          <span>{englishLabel}</span>
        </Link>
      </Button>
      <Button
        variant={locale === "zh" ? "default" : "outline"}
        size="xs"
        asChild
      >
        <Link href={`/zh${path}${hash}`}>
          <RiTranslate2 className="size-3" />
          <span>{chineseLabel}</span>
        </Link>
      </Button>
    </div>
  );
}
