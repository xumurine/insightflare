export const FLOATING_LAYER_Z_ATTR = "data-dashboard-floating-layer-z";

export const DETAIL_DRAWER_Z_INDEX = 96;
export const DETAIL_DRAWER_Z_INDEX_STEP = 4;
export const EVENT_FILTER_DIALOG_OVERLAY_Z_INDEX = 999;
export const EVENT_FILTER_DIALOG_Z_INDEX = 1000;
export const EVENT_RECORD_DRAWER_OVERLAY_Z_INDEX = 1099;
export const EVENT_RECORD_DRAWER_Z_INDEX = 1100;
export const NESTED_DETAIL_DRAWER_Z_INDEX = 1200;

interface RegisteredDetailDrawerLayer {
  id: string;
  baseZIndex: number;
  order: number;
}

export interface DetailDrawerLayer {
  id: string;
  baseZIndex: number;
  effectiveZIndex: number;
  order: number;
}

let nextDetailDrawerLayerOrder = 0;
let detailDrawerLayerSnapshot: DetailDrawerLayer[] = [];
const detailDrawerLayers = new Map<string, RegisteredDetailDrawerLayer>();
const detailDrawerLayerSubscribers = new Set<() => void>();

function emitDetailDrawerLayerChange() {
  const rankByBaseZIndex = new Map<number, number>();
  detailDrawerLayerSnapshot = Array.from(detailDrawerLayers.values())
    .sort(
      (left, right) =>
        left.baseZIndex - right.baseZIndex || left.order - right.order,
    )
    .map((layer) => {
      const rank = rankByBaseZIndex.get(layer.baseZIndex) ?? 0;
      rankByBaseZIndex.set(layer.baseZIndex, rank + 1);

      return {
        ...layer,
        effectiveZIndex: layer.baseZIndex + rank * DETAIL_DRAWER_Z_INDEX_STEP,
      };
    });

  detailDrawerLayerSubscribers.forEach((subscriber) => subscriber());
}

export function setDetailDrawerLayer(id: string, baseZIndex: number) {
  const existing = detailDrawerLayers.get(id);
  if (existing?.baseZIndex === baseZIndex) return;

  detailDrawerLayers.set(id, {
    id,
    baseZIndex,
    order: existing?.order ?? ++nextDetailDrawerLayerOrder,
  });
  emitDetailDrawerLayerChange();
}

export function removeDetailDrawerLayer(id: string) {
  if (!detailDrawerLayers.delete(id)) return;
  emitDetailDrawerLayerChange();
}

export function subscribeDetailDrawerLayers(onStoreChange: () => void) {
  detailDrawerLayerSubscribers.add(onStoreChange);
  return () => {
    detailDrawerLayerSubscribers.delete(onStoreChange);
  };
}

export function getDetailDrawerLayerSnapshot() {
  return detailDrawerLayerSnapshot;
}

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
