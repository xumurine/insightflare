"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, type HTMLMotionProps, motion } from "motion/react";

import {
  FLOATING_LAYER_Z_ATTR,
  getModalLayerSnapshot,
  MODAL_LAYER_Z_INDEX,
  removeModalLayer,
  setModalLayer,
  subscribeModalLayers,
} from "@/components/ui/floating-layer";
import { cn } from "@/lib/utils";

export { overlayZIndexFor } from "@/components/ui/floating-layer";

export const MODAL_OVERLAY_FADE_MS = 160;

interface ControllableOpenProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export interface ModalRootState {
  layerId: string;
  modal: boolean;
  open: boolean;
}

interface ModalOverlayProps extends React.ComponentPropsWithoutRef<"div"> {
  layerId: string;
  open: boolean;
  portal?: boolean;
  zIndex?: number;
}

interface ModalLayerOptions {
  baseZIndex?: number;
  enabled?: boolean;
  layerId: string;
  open: boolean;
}

export function parseZIndex(value: React.CSSProperties["zIndex"]) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function useControllableOpen({
  defaultOpen = false,
  onOpenChange,
  open,
}: ControllableOpenProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const isControlled = open !== undefined;
  const currentOpen = isControlled ? open : uncontrolledOpen;

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [isControlled, onOpenChange],
  );

  return [currentOpen, handleOpenChange] as const;
}

export function useModalLayerId(prefix: string) {
  const reactId = React.useId();
  return `${prefix}-${reactId}`;
}

export function useModalLayerZIndex({
  baseZIndex = MODAL_LAYER_Z_INDEX,
  enabled = true,
  layerId,
  open,
}: ModalLayerOptions) {
  const shouldRegister = enabled && open;

  React.useEffect(() => {
    if (!shouldRegister) return;

    setModalLayer(layerId, baseZIndex);
    return () => {
      removeModalLayer(layerId);
    };
  }, [baseZIndex, layerId, shouldRegister]);

  const modalLayers = React.useSyncExternalStore(
    subscribeModalLayers,
    getModalLayerSnapshot,
    getModalLayerSnapshot,
  );

  if (!enabled) return baseZIndex;
  return (
    modalLayers.find((layer) => layer.id === layerId)?.effectiveZIndex ??
    baseZIndex
  );
}

export function ModalOverlay({
  className,
  layerId,
  open,
  portal = false,
  style,
  zIndex,
  ...props
}: ModalOverlayProps) {
  const floatingLayerZIndex =
    zIndex ?? parseZIndex(style?.zIndex) ?? MODAL_LAYER_Z_INDEX;
  const motionProps = props as HTMLMotionProps<"div">;

  const overlay = (
    <AnimatePresence>
      {open ? (
        <motion.div
          {...motionProps}
          aria-hidden="true"
          data-dashboard-floating-layer={`${layerId}-overlay`}
          {...{ [FLOATING_LAYER_Z_ATTR]: floatingLayerZIndex }}
          className={cn(
            "pointer-events-auto fixed inset-0 bg-black/10 supports-backdrop-filter:backdrop-blur-xs",
            className,
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{
            duration: MODAL_OVERLAY_FADE_MS / 1000,
            ease: "easeOut",
          }}
          style={{ ...style, zIndex: floatingLayerZIndex }}
        />
      ) : null}
    </AnimatePresence>
  );

  if (!portal) return overlay;
  if (typeof document === "undefined") return null;

  return createPortal(overlay, document.body);
}
