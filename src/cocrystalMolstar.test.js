import {
  fetchRcsbBcifBuffer,
  isWebGLAvailable,
  rcsbBcifUrl,
  scheduleCocrystalMolstarResize,
} from "./cocrystalMolstar";

describe("cocrystalMolstar helpers", () => {
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
