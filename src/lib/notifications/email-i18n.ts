import type { Locale } from "@/lib/i18n/config";

export const NOTIFICATION_EMAIL_MESSAGES = {
  en: {
    common: {
      brand: "InsightFlare",
      date: "Date",
      coreMetrics: "Core metrics",
      topPages: "Top Pages",
      topReferrers: "Top Referrers",
      views: "Views",
      visitors: "Visitors",
      sessions: "Sessions",
      visits: "visits",
      viewsUnit: "views",
      direct: "Direct",
      metric: "Metric",
      window: "Window",
      currentValue: "Current value",
      threshold: "Threshold",
      lastSeen: "Last seen",
      never: "never",
      noPageData: "No page data.",
      noReferrerData: "No referrer data.",
      footer: "This message was sent by InsightFlare notifications.",
      fallbackSubject: "InsightFlare notification",
      trackingHint:
        "Please check whether the tracking script is installed correctly or whether the site still has traffic.",
      severity: {
        info: "Info",
        success: "Success",
        warning: "Warning",
        critical: "Critical",
      },
    },
    test: {
      subject: "InsightFlare notification test",
      title: "InsightFlare notification test",
      summary: "This is a test notification from InsightFlare.",
      body: "This is a test notification from InsightFlare. If email is configured and enabled, this message also verifies Resend delivery.",
    },
    report: {
      subject: "{site} {periodLabel} traffic report",
      title: "{site} {periodLabel} traffic report",
      summary: "{date}: {visitors} visitors and {views} views.",
    },
    milestone: {
      subject: "{site} reached {bucket} {metric}",
      title: "{site} reached {bucket} {metric}",
      summary: "Traffic milestone reached: {bucket} {metric}.",
    },
    threshold: {
      subject: "{site} traffic threshold reached",
      title: "{site} traffic threshold reached",
      summary:
        "{window} {metric} is {value}, matching threshold {operator} {target}.",
      metricLabels: {
        views: "views",
        visitors: "visitors",
        sessions: "sessions",
      },
      windows: {
        last_1h: "last 1 hour",
        last_24h: "last 24 hours",
        yesterday: "yesterday",
      },
    },
    health: {
      subject: "{site} has not received data for {hours} hours",
      title: "{site} has not received data for {hours} hours",
      noHistory:
        "No historical traffic data was found. Check that the tracking script is installed.",
    },
    change: {
      subject: "{site} traffic change detected",
      title: "{site} traffic change detected",
      summary: "{window} {metric} changed by {change}.",
    },
  },
  zh: {
    common: {
      brand: "InsightFlare",
      date: "日期",
      coreMetrics: "核心指标",
      topPages: "热门页面",
      topReferrers: "主要来源",
      views: "浏览量",
      visitors: "访客数",
      sessions: "会话数",
      visits: "次访问",
      viewsUnit: "次浏览",
      direct: "直接访问",
      metric: "指标",
      window: "时间窗口",
      currentValue: "当前值",
      threshold: "阈值",
      lastSeen: "最后收到数据",
      never: "从未收到",
      noPageData: "暂无页面数据。",
      noReferrerData: "暂无来源数据。",
      footer: "这封邮件由 InsightFlare 通知系统发送。",
      fallbackSubject: "InsightFlare 通知",
      trackingHint: "请检查统计脚本是否正常安装，或确认站点是否仍有流量。",
      severity: {
        info: "信息",
        success: "成功",
        warning: "警告",
        critical: "严重",
      },
    },
    test: {
      subject: "InsightFlare 通知测试",
      title: "InsightFlare 通知测试",
      summary: "这是一条来自 InsightFlare 的测试通知。",
      body: "这是一条来自 InsightFlare 的测试通知。如果邮件已配置并启用，它也会验证 Resend 投递是否正常。",
    },
    report: {
      subject: "{site} {periodLabel}访问报告",
      title: "{site} {periodLabel}访问报告",
      summary: "{date}：{visitors} 位访客，{views} 次浏览。",
    },
    milestone: {
      subject: "{site} 达到 {bucket} {metric}",
      title: "{site} 达到 {bucket} {metric}",
      summary: "已达到流量里程碑：{bucket} {metric}。",
    },
    threshold: {
      subject: "{site} 访问量达到阈值",
      title: "{site} 访问量达到阈值",
      summary: "{window}的{metric}为 {value}，已匹配阈值 {operator} {target}。",
      metricLabels: {
        views: "浏览量",
        visitors: "访客数",
        sessions: "会话数",
      },
      windows: {
        last_1h: "过去 1 小时",
        last_24h: "过去 24 小时",
        yesterday: "昨天",
      },
    },
    health: {
      subject: "{site} 已超过 {hours} 小时没有收到访问数据",
      title: "{site} 已超过 {hours} 小时没有收到访问数据",
      noHistory: "当前没有历史访问数据。请检查统计脚本是否已正确安装。",
    },
    change: {
      subject: "{site} 流量变化提醒",
      title: "{site} 流量变化提醒",
      summary: "{window}的{metric}变化了 {change}。",
    },
  },
} satisfies Record<Locale, Record<string, unknown>>;

export type NotificationEmailMessages =
  (typeof NOTIFICATION_EMAIL_MESSAGES)[Locale];
