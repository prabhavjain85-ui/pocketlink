import React, { act } from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter, Routes, Route, Link } from "react-router-dom";
import AnalyticsTracker, { GA_MEASUREMENT_ID } from "./AnalyticsTracker";

global.IS_REACT_ACT_ENVIRONMENT = true;

describe("src/AnalyticsTracker", () => {
  let container = null;
  let root = null;
  const originalGtag = window.gtag;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = ReactDOM.createRoot(container);
    jest.useFakeTimers();
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    window.gtag = originalGtag;
    jest.useRealTimers();
  });

  test("exports correct GA4 measurement ID", () => {
    expect(GA_MEASUREMENT_ID).toBe("G-43LPE4331X");
  });

  test("dispatches page_view on initial mount when window.gtag is available", () => {
    const mockGtag = jest.fn();
    window.gtag = mockGtag;
    document.title = "TargetForge Test";

    act(() => {
      root.render(
        <MemoryRouter initialEntries={["/docking"]}>
          <AnalyticsTracker />
        </MemoryRouter>
      );
    });

    act(() => {
      jest.runAllTimers();
    });

    expect(mockGtag).toHaveBeenCalledWith("event", "page_view", {
      page_title: "TargetForge Test",
      page_location: expect.stringContaining("/docking"),
      page_path: "/docking",
    });
  });

  test("handles client-side navigation between routes", () => {
    const mockGtag = jest.fn();
    window.gtag = mockGtag;

    function TestApp() {
      return (
        <MemoryRouter initialEntries={["/"]}>
          <AnalyticsTracker />
          <nav>
            <Link to="/adme" id="nav-adme">ADME</Link>
          </nav>
          <Routes>
            <Route path="/" element={<div>Home</div>} />
            <Route path="/adme" element={<div>ADME Page</div>} />
          </Routes>
        </MemoryRouter>
      );
    }

    act(() => {
      root.render(<TestApp />);
    });

    act(() => {
      jest.runAllTimers();
    });

    expect(mockGtag).toHaveBeenCalledTimes(1);
    expect(mockGtag).toHaveBeenLastCalledWith("event", "page_view", expect.objectContaining({
      page_path: "/",
    }));

    // Click link to navigate to /adme
    const link = container.querySelector("#nav-adme");
    act(() => {
      link.click();
    });

    act(() => {
      jest.runAllTimers();
    });

    expect(mockGtag).toHaveBeenCalledTimes(2);
    expect(mockGtag).toHaveBeenLastCalledWith("event", "page_view", expect.objectContaining({
      page_path: "/adme",
    }));
  });

  test("does not crash if window.gtag is not defined", () => {
    delete window.gtag;

    expect(() => {
      act(() => {
        root.render(
          <MemoryRouter initialEntries={["/"]}>
            <AnalyticsTracker />
          </MemoryRouter>
        );
      });

      act(() => {
        jest.runAllTimers();
      });
    }).not.toThrow();
  });
});
