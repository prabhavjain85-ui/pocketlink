import {
  applyCocrystalInteractionVisuals,
  boundingSphereFromStructure,
  fetchRcsbBcifBuffer,
  isWebGLAvailable,
  rcsbBcifUrl,
  scheduleCocrystalMolstarResize,
} from "./cocrystalMolstar";

describe("cocrystalMolstar helpers", () => {
  test("boundingSphereFromStructure computes center and radius", () => {
    const structure = {
      units: [
        {
          elements: [0, 1],
          conformation: {
            position: (el, out) => {
              out[0] = el === 0 ? 0 : 4;
              out[1] = 0;
              out[2] = 0;
            },
          },
        },
      ],
    };
    const sphere = boundingSphereFromStructure(structure, 2);
    expect(sphere.center[0]).toBe(2);
    expect(sphere.radius).toBeGreaterThan(3);
  });

  test("rcsbBcifUrl uppercases PDB id", () => {
    expect(rcsbBcifUrl("1iep")).toBe("https://models.rcsb.org/1IEP.bcif");
  });

  test("isWebGLAvailable returns boolean without throwing", () => {
    expect(typeof isWebGLAvailable()).toBe("boolean");
  });

  test("scheduleCocrystalMolstarResize calls canvas handleResize when present", () => {
    const handleResize = jest.fn();
    const raf = jest
      .spyOn(global, "requestAnimationFrame")
      .mockImplementation((cb) => {
        cb();
        return 0;
      });
    scheduleCocrystalMolstarResize({
      plugin: {
        canvas3d: { handleResize },
        layout: { events: { layoutUpdated: { dispatch: jest.fn() } } },
      },
    });
    raf.mockRestore();
    expect(handleResize).toHaveBeenCalled();
  });

  test("fetchRcsbBcifBuffer rejects HTML payloads", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        headers: { get: () => "text/html" },
        arrayBuffer: async () => new TextEncoder().encode("<html></html>").buffer,
      })
    );
    try {
      await expect(fetchRcsbBcifBuffer("1IEP")).rejects.toThrow(/HTML/i);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("applyCocrystalInteractionVisuals adds ligand interaction representations", async () => {
    const addRepresentation = jest.fn(() => Promise.resolve());
    const tryCreateComponentStatic = jest.fn(() =>
      Promise.resolve({
        ref: "ligand-ref",
        cell: {
          obj: {
            data: {
              units: [
                {
                  elements: [0],
                  conformation: {
                    position: (_el, out) => {
                      out[0] = 1;
                      out[1] = 2;
                      out[2] = 3;
                    },
                  },
                },
              ],
              elementCount: 1,
              serialMapping: { unitIndices: [0], elementIndices: [0] },
            },
          },
        },
      })
    );
    const setFromLoci = jest.fn();
    const setParams = jest.fn();
    const focusObject = jest.fn();
    const focusSphere = jest.fn();
    const requestCameraReset = jest.fn();
    const viewer = {
      plugin: {
        canvas3d: {
          camera: { getFocus: jest.fn(() => ({ target: [0, 0, 0], position: [0, 0, 10] })) },
          requestCameraReset,
        },
        managers: {
          structure: {
            hierarchy: { current: { structures: [{ cell: { ref: "struct", obj: { data: {} } } }] } },
            focus: { setFromLoci, setParams },
          },
          camera: { focusObject, focusSphere },
        },
        builders: {
          structure: {
            tryCreateComponentStatic,
            representation: { addRepresentation },
          },
        },
        canvas3d: { handleResize: jest.fn() },
        layout: { events: { layoutUpdated: { dispatch: jest.fn() } } },
      },
    };
    await applyCocrystalInteractionVisuals(viewer, {
      pocketRadiusAngstrom: 5,
      focusCenter: { x: 1, y: 2, z: 3 },
    });
    expect(tryCreateComponentStatic).toHaveBeenCalledWith(
      { ref: "struct", obj: { data: {} } },
      "ligand"
    );
    expect(setParams).toHaveBeenCalled();
    expect(setFromLoci).toHaveBeenCalled();
    expect(requestCameraReset).toHaveBeenCalled();
    expect(addRepresentation).toHaveBeenCalledTimes(2);
    expect(addRepresentation.mock.calls[1][1].type).toBe("interactions");
  });

  test("fetchRcsbBcifBuffer rejects HTTP errors", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 404,
        headers: { get: () => "application/octet-stream" },
        arrayBuffer: async () => new ArrayBuffer(0),
      })
    );
    try {
      await expect(fetchRcsbBcifBuffer("ZZZZ")).rejects.toThrow(/404/);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
