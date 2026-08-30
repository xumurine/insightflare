import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/$locale/app/$teamSlug/members")({
  beforeLoad: ({ params }) => {
    throw redirect({
      href: `/${params.locale}/app/${params.teamSlug}/settings`,
    });
  },
});
