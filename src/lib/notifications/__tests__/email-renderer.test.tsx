import { describe, expect, it } from "vitest";

import { notificationEmailPreviewMessage } from "@/components/email/notification-email-preview-data";
import { renderNotificationEmail } from "@/lib/notifications/email-renderer";
import type { NotificationMessage } from "@/lib/notifications/message-store";

function fallbackMessage(): NotificationMessage {
  return {
    ...notificationEmailPreviewMessage("test", "zh"),
    id: "preview-fallback",
    type: "system",
    title: "Fallback title",
    summary: "Fallback summary",
    bodyText: "Fallback body",
    data: { locale: "zh" },
  };
}

describe("renderNotificationEmail", () => {
  it("renders report html and text in Chinese", async () => {
    const rendered = await renderNotificationEmail({
      message: notificationEmailPreviewMessage("report", "zh"),
      locale: "zh",
      timeZone: "Asia/Shanghai",
    });

    expect(rendered.subject).toContain("每日访问报告");
    expect(rendered.html).toContain("每日访问报告");
    expect(rendered.html).toContain("浏览量");
    expect(rendered.html).toContain("访客数");
    expect(rendered.html).toContain("会话数");
    expect(rendered.html).toContain("热门页面");
    expect(rendered.html).toContain("主要来源");
    expect(rendered.html).toContain("<!doctype html>");
    expect(rendered.text).toContain("核心指标");
    expect(rendered.text).not.toContain("<html");
    expect(rendered.text).not.toContain("[object Object]");
  });

  it("renders threshold html and text in Chinese", async () => {
    const rendered = await renderNotificationEmail({
      message: notificationEmailPreviewMessage("threshold", "zh"),
      locale: "zh",
      timeZone: "Asia/Shanghai",
    });

    expect(rendered.html).toContain("访问量达到阈值");
    expect(rendered.html).toContain("警告");
    expect(rendered.html).toContain("访客数");
    expect(rendered.html).toContain("&gt;=");
    expect(rendered.text).toContain("指标：访客数");
  });

  it("renders milestone html with the shared email design", async () => {
    const rendered = await renderNotificationEmail({
      message: notificationEmailPreviewMessage("milestone", "zh"),
      locale: "zh",
      timeZone: "Asia/Shanghai",
    });

    expect(rendered.html).toContain("达到");
    expect(rendered.html).toContain("成功");
    expect(rendered.html).toContain("里程碑");
    expect(rendered.html).toContain("当前值");
    expect(rendered.text).toContain("已达到流量里程碑");
  });

  it("renders change html with the shared email design", async () => {
    const rendered = await renderNotificationEmail({
      message: notificationEmailPreviewMessage("change", "zh"),
      locale: "zh",
      timeZone: "Asia/Shanghai",
    });

    expect(rendered.html).toContain("流量变化提醒");
    expect(rendered.html).toContain("警告");
    expect(rendered.html).toContain("上一值");
    expect(rendered.html).toContain("变化");
    expect(rendered.text).toContain("变化了");
  });

  it("renders health html and text with timezone", async () => {
    const rendered = await renderNotificationEmail({
      message: notificationEmailPreviewMessage("health", "zh"),
      locale: "zh",
      timeZone: "Asia/Shanghai",
    });

    expect(rendered.html).toContain("最后收到数据");
    expect(rendered.html).toContain("严重");
    expect(rendered.text).toContain("最后收到数据：");
    expect(rendered.text).toContain("2026");
  });

  it("renders fallback messages without object or html leakage", async () => {
    const rendered = await renderNotificationEmail({
      message: fallbackMessage(),
      locale: "zh",
    });

    expect(rendered.subject).toBe("Fallback title");
    expect(rendered.text).toContain("Fallback body");
    expect(rendered.html).not.toContain("[object Object]");
    expect(rendered.text).not.toContain("<html");
  });
});
