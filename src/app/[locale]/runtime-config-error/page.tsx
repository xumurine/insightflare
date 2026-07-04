import Link from "next/link";
import {
  RiErrorWarningLine,
  RiExternalLinkLine,
  RiKey2Line,
  RiTerminalBoxLine,
} from "@remixicon/react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { type Locale, resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

interface RuntimeConfigErrorPageProps {
  params: Promise<{
    locale: string;
  }>;
}

const COPY: Record<
  Locale,
  {
    title: string;
    eyebrow: string;
    heading: string;
    description: string;
    requiredTitle: string;
    requiredDescription: string;
    secretHint: string;
    commandTitle: string;
    commandDescription: string;
    quickStartHint: string;
    docsLabel: string;
    homeLabel: string;
  }
> = {
  en: {
    title: "Runtime configuration required",
    eyebrow: "Deployment paused",
    heading: "InsightFlare needs one runtime secret before the UI can load.",
    description:
      "The app is running, but the dashboard is blocked because the required root secret is not available in the runtime environment.",
    requiredTitle: "Required runtime secret",
    requiredDescription:
      "Set at least one of these values in your Cloudflare runtime secrets.",
    secretHint:
      "MAIN_SECRET is recommended. DAILY_SALT_SECRET is accepted for legacy deployments.",
    commandTitle: "Cloudflare command",
    commandDescription:
      "Use the project helper to add the recommended secret, then redeploy.",
    quickStartHint:
      "Or, see the Quick Start section in the GitHub README to set this variable.",
    docsLabel: "Open GitHub",
    homeLabel: "Retry dashboard",
  },
  zh: {
    title: "需要运行时配置",
    eyebrow: "部署已暂停",
    heading: "InsightFlare 需要一个运行时密钥后才能加载控制台。",
    description:
      "应用已经启动，但当前运行环境没有读取到必需的 root secret，因此暂时阻止进入控制台。",
    requiredTitle: "必需的运行时密钥",
    requiredDescription: "请在 Cloudflare 运行时密钥中至少设置以下其中一个值。",
    secretHint: "推荐使用 MAIN_SECRET。旧部署仍可继续使用 DAILY_SALT_SECRET。",
    commandTitle: "Cloudflare 命令",
    commandDescription: "使用项目内置命令写入推荐密钥，然后重新部署。",
    quickStartHint:
      "或者，请查看 GitHub README 的“快速开始”章节来设置这个变量。",
    docsLabel: "打开 GitHub",
    homeLabel: "重试控制台",
  },
};

export async function generateMetadata({
  params,
}: RuntimeConfigErrorPageProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);

  return {
    title: COPY[resolvedLocale].title,
  };
}

export default async function RuntimeConfigErrorPage({
  params,
}: RuntimeConfigErrorPageProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);
  const copy = COPY[resolvedLocale];

  return (
    <main className="min-h-svh bg-background text-foreground">
      <section className="mx-auto grid min-h-svh w-full max-w-5xl place-items-center px-4 py-8">
        <Card className="w-full border-destructive/30 bg-card shadow-2xl shadow-destructive/5 ring-destructive/10">
          <CardHeader className="gap-5 border-b border-destructive/20 px-6 py-6 md:px-8">
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div className="space-y-4">
                <div className="inline-flex w-fit items-center gap-2 border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-destructive">
                  <RiErrorWarningLine className="size-3.5" />
                  {copy.eyebrow}
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {messages.appName}
                  </p>
                  <CardTitle className="max-w-3xl text-balance text-2xl font-semibold leading-tight md:text-3xl">
                    {copy.heading}
                  </CardTitle>
                  <CardDescription className="max-w-2xl text-sm leading-6">
                    {copy.description}
                  </CardDescription>
                </div>
              </div>
              <div className="grid size-14 shrink-0 place-items-center border border-destructive/30 bg-destructive/10 text-destructive">
                <RiKey2Line className="size-7" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-6 px-6 py-6 md:grid-cols-[1fr_1fr] md:px-8">
            <div className="space-y-4">
              <div className="space-y-1">
                <h2 className="text-sm font-medium">{copy.requiredTitle}</h2>
                <p className="text-xs/relaxed text-muted-foreground">
                  {copy.requiredDescription}
                </p>
              </div>
              <div className="grid gap-2">
                <code className="border border-border bg-muted px-3 py-2 text-xs">
                  MAIN_SECRET
                </code>
                <code className="border border-border bg-muted px-3 py-2 text-xs">
                  DAILY_SALT_SECRET
                </code>
              </div>
              <p className="text-xs/relaxed text-muted-foreground">
                {copy.secretHint}
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <h2 className="inline-flex items-center gap-2 text-sm font-medium">
                  <RiTerminalBoxLine className="size-4" />
                  {copy.commandTitle}
                </h2>
                <p className="text-xs/relaxed text-muted-foreground">
                  {copy.commandDescription}
                </p>
              </div>
              <code className="block overflow-x-auto border border-border bg-muted px-3 py-2 text-xs">
                npm run ops:secret:main
              </code>
              <p className="text-xs/relaxed text-muted-foreground">
                {copy.quickStartHint}
              </p>
            </div>

            <div className="flex flex-col gap-2 border-t border-border pt-5 md:col-span-2 md:flex-row md:justify-end">
              <Button variant="outline" asChild>
                <Link href="https://github.com/RavelloH/InsightFlare">
                  {copy.docsLabel}
                  <RiExternalLinkLine className="size-3.5" />
                </Link>
              </Button>
              <Button asChild>
                <Link href={`/${resolvedLocale}/app`}>{copy.homeLabel}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
