export const FLOATING_LAYER_Z_ATTR = "data-dashboard-floating-layer-z";

export const DETAIL_DRAWER_Z_INDEX = 96;
export const EVENT_FILTER_DIALOG_OVERLAY_Z_INDEX = 999;
export const EVENT_FILTER_DIALOG_Z_INDEX = 1000;
export const EVENT_RECORD_DRAWER_OVERLAY_Z_INDEX = 1099;
export const EVENT_RECORD_DRAWER_Z_INDEX = 1100;
export const NESTED_DETAIL_DRAWER_Z_INDEX = 1200;

export function getTopFloatingLayerZIndex() {
  if (typeof document === "undefined") return Number.NEGATIVE_INFINITY;

  return Array.from(
    document.querySelectorAll(`[${FLOATING_LAYER_Z_ATTR}]`),
  ).reduce((topZIndex, element) => {
    const zIndex = Number(element.getAttribute(FLOATING_LAYER_Z_ATTR));
    if (!Number.isFinite(zIndex)) return topZIndex;
    return Math.max(topZIndex, zIndex);
  }, Number.NEGATIVE_INFINITY);
}

export function hasHigherFloatingLayer(currentZIndex: number) {
  return getTopFloatingLayerZIndex() > currentZIndex;
}
