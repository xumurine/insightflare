import type { ReactNode } from "react";

interface RootAppLayoutProps {
  children: ReactNode;
}

export default function RootAppLayout({ children }: RootAppLayoutProps) {
  return <>{children}</>;
}
