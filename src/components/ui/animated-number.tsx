import { type CSSProperties, lazy, Suspense } from "react";
import { createIsomorphicFn } from "@tanstack/react-start";

export interface AnimatedNumberProps {
  value: number;
  continuous?: boolean;
  className?: string;
  style?: CSSProperties;
}

function StaticNumber({ value, className, style }: AnimatedNumberProps) {
  return (
    <span className={className} style={style}>
      {value}
    </span>
  );
}

const ClientNumber = lazy(() =>
  import("@/components/ui/animated-number-client").then((module) => ({
    default: module.AnimatedNumberClient,
  })),
);

function HydratedNumber(props: AnimatedNumberProps) {
  return (
    <Suspense fallback={<StaticNumber {...props} />}>
      <ClientNumber {...props} />
    </Suspense>
  );
}

const NumberImplementation = createIsomorphicFn()
  .server(() => StaticNumber)
  .client(() => HydratedNumber)();

export function AnimatedNumber(props: AnimatedNumberProps) {
  return <NumberImplementation {...props} />;
}
