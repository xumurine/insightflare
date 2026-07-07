"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RiTranslate2 } from "@remixicon/react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { type Locale, SUPPORTED_LOCALES } from "@/lib/i18n/config";

interface AccountLinkPageActionsProps {
  locale: Locale;
  path: "/invite" | "/reset-password";
  lightLabel: string;
  darkLabel: string;
  englishLabel: string;
  chineseLabel: string;
  japaneseLabel: string;
}

export function AccountLinkPageActions({
  locale,
  path,
  lightLabel,
  darkLabel,
  englishLabel,
  chineseLabel,
  japaneseLabel,
}: AccountLinkPageActionsProps) {
  const [hash, setHash] = useState("");
  const languageLabels: Record<Locale, string> = {
    en: englishLabel,
    zh: chineseLabel,
    ja: japaneseLabel,
  };

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
      {SUPPORTED_LOCALES.map((item) => (
        <Button
          key={item}
          variant={locale === item ? "default" : "outline"}
          size="xs"
          asChild
        >
          <Link href={`/${item}${path}${hash}`}>
            <RiTranslate2 className="size-3" />
            <span>{languageLabels[item]}</span>
          </Link>
        </Button>
      ))}
    </div>
  );
}
