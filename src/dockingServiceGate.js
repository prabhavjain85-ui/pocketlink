/** Whether the UI should call the remote Vina API (vs RCSB-only co-crystal). */
export function shouldRunRemoteDocking({ dockingEnabled, serviceStatus }) {
  if (!dockingEnabled) return false;
  return serviceStatus === "online";
}

/** Whether the docking page can run its initial auto-dock (not co-crystal bootstrap). */
export function shouldAutoRunDockingOnLoad({ dockingUiEnabled, dockingEnabled, serviceStatus }) {
  if (!dockingUiEnabled()) return false;
  if (!dockingEnabled) return true;
  return serviceStatus === "online";
}
