import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";

import { isValidLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

export const Route = createFileRoute("/$locale")({
  beforeLoad: ({ params }) => {
    if (!isValidLocale(params.locale)) throw notFound();
    return {
      locale: params.locale,
      messages: getMessages(params.locale),
    };
  },
  component: Outlet,
});
