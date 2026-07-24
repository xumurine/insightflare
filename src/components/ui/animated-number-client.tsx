import NumberFlow, { continuous } from "@number-flow/react";

import type { AnimatedNumberProps } from "@/components/ui/animated-number";

const CONTINUOUS_PLUGINS = [continuous];

export function AnimatedNumberClient({
  continuous: useContinuous,
  ...props
}: AnimatedNumberProps) {
  return (
    <NumberFlow
      {...props}
      plugins={useContinuous ? CONTINUOUS_PLUGINS : undefined}
    />
  );
}
