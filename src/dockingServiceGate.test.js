import { shouldAutoRunDockingOnLoad, shouldRunRemoteDocking } from "./dockingServiceGate";

const uiOn = () => true;
const uiOff = () => false;

describe("dockingServiceGate", () => {
  test("shouldRunRemoteDocking requires online status when docking enabled", () => {
    expect(shouldRunRemoteDocking({ dockingEnabled: false, serviceStatus: "offline" })).toBe(false);
    expect(shouldRunRemoteDocking({ dockingEnabled: true, serviceStatus: "checking" })).toBe(false);
    expect(shouldRunRemoteDocking({ dockingEnabled: true, serviceStatus: "offline" })).toBe(false);
    expect(shouldRunRemoteDocking({ dockingEnabled: true, serviceStatus: "online" })).toBe(true);
  });

  test("shouldAutoRunDockingOnLoad waits for online when remote docking enabled", () => {
    expect(
      shouldAutoRunDockingOnLoad({
        dockingUiEnabled: uiOn,
        dockingEnabled: true,
        serviceStatus: "checking",
      })
    ).toBe(false);
    expect(
      shouldAutoRunDockingOnLoad({
        dockingUiEnabled: uiOn,
        dockingEnabled: true,
        serviceStatus: "offline",
      })
    ).toBe(false);
    expect(
      shouldAutoRunDockingOnLoad({
        dockingUiEnabled: uiOn,
        dockingEnabled: true,
        serviceStatus: "online",
      })
    ).toBe(true);
    expect(
      shouldAutoRunDockingOnLoad({
        dockingUiEnabled: uiOn,
        dockingEnabled: false,
        serviceStatus: "offline",
      })
    ).toBe(true);
  });

  test("shouldAutoRunDockingOnLoad respects docking UI disabled", () => {
    expect(
      shouldAutoRunDockingOnLoad({
        dockingUiEnabled: uiOff,
        dockingEnabled: true,
        serviceStatus: "online",
      })
    ).toBe(false);
  });
});
