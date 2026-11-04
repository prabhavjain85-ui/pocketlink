/**
 * Server-side stand-in for src/historyService.js.
 * History lives in the visitor's localStorage, so writes are forwarded to the
 * browser as client effects and applied there by src/serverApi.js.
 */
import { emitClientEffect } from "./requestContext.js";

export const ACTIVE_STATE_KEYS = {
  BENCH: "pocketlink_active_bench_v1",
  TARGET_DISCOVERY: "pocketlink_active_discovery_v1",
  REPURPOSING: "pocketlink_active_repurpose_v1",
};

export function saveHistoryEntry(entry) {
  emitClientEffect("saveHistoryEntry", [entry]);
  return null;
}

export function setActiveState(key, state) {
  emitClientEffect("setActiveState", [key, state]);
}
