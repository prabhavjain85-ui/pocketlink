import React, { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { ACTIVE_STATE_KEYS, clearActiveState, getHistory, subscribeToHistory } from "./historyService";

const TOOL_LINKS = [
  { to: "/hypothesis", label: "Hypothesis Testing" },
  { to: "/target-discovery", label: "Target Discovery" },
  { to: "/repurposing", label: "Repurposing" },
  { to: "/adme", label: "ADME" },
  { to: "/docking", label: "Docking" },
  { to: "/evolution", label: "Local mol. search" },
];

const TOOL_PATHS = new Set(TOOL_LINKS.map((item) => item.to));

function isToolsRouteActive(pathname) {
  return TOOL_PATHS.has(pathname) || pathname === "/history";
}

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const [historyCount, setHistoryCount] = useState(0);
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsWrapRef = useRef(null);

  useEffect(() => {
    setHistoryCount(getHistory().length);
    const unsub = subscribeToHistory((list) => {
      setHistoryCount(list.length);
    });
    return unsub;
  }, []);

  useEffect(() => {
    setToolsOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!toolsOpen) return undefined;

    const onPointerDown = (event) => {
      if (toolsWrapRef.current && !toolsWrapRef.current.contains(event.target)) {
        setToolsOpen(false);
      }
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setToolsOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [toolsOpen]);

  const handleNewScreen = () => {
    clearActiveState(ACTIVE_STATE_KEYS.BENCH);
    navigate("/");
  };

  const toolsActive = isToolsRouteActive(location.pathname);
  const showHeaderCta = location.pathname !== "/";

  const toggleToolsMenu = () => {
    setToolsOpen((open) => !open);
  };

  const onToolsTriggerKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleToolsMenu();
    }
    if (event.key === "ArrowDown" && !toolsOpen) {
      event.preventDefault();
      setToolsOpen(true);
    }
  };

  return (
    <header className="site-header" id="main-navigation">
      <NavLink to="/" className="site-brand" end title="TargetForge Drug Discovery Bench">
        <div className="brand-badge-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
        <div className="brand-text-wrap">
          <span className="site-brand-name">TargetForge</span>
          <span className="site-brand-tag">Drug Discovery Bench</span>
        </div>
      </NavLink>

      <nav className="site-nav" aria-label="Main Navigation">
        <NavLink to="/" end className={({ isActive }) => "site-nav-link" + (isActive ? " active" : "")}>
          Run a screen
        </NavLink>

        <div className="site-nav-dropdown" ref={toolsWrapRef}>
          <button
            type="button"
            className={"site-nav-link site-nav-dropdown-trigger" + (toolsActive ? " active" : "")}
            aria-expanded={toolsOpen}
            aria-haspopup="true"
            aria-controls="tools-nav-menu"
            id="tools-nav-trigger"
            onClick={toggleToolsMenu}
            onKeyDown={onToolsTriggerKeyDown}
          >
            Tools
            <svg
              className="site-nav-dropdown-chevron"
              viewBox="0 0 20 20"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M5 7.5l5 5 5-5" />
            </svg>
          </button>
          {toolsOpen && (
            <div
              className="site-nav-dropdown-menu"
              id="tools-nav-menu"
              role="menu"
              aria-labelledby="tools-nav-trigger"
            >
              {TOOL_LINKS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  role="menuitem"
                  className={({ isActive }) => "site-nav-dropdown-item" + (isActive ? " active" : "")}
                  onClick={() => setToolsOpen(false)}
                >
                  {item.label}
                </NavLink>
              ))}
              <NavLink
                to="/history"
                role="menuitem"
                className={({ isActive }) =>
                  "site-nav-dropdown-item site-nav-dropdown-item-secondary" + (isActive ? " active" : "")
                }
                onClick={() => setToolsOpen(false)}
              >
                My runs
                {historyCount > 0 && <span className="nav-history-badge">{historyCount}</span>}
              </NavLink>
            </div>
          )}
        </div>

        <NavLink to="/methodology" className={({ isActive }) => "site-nav-link" + (isActive ? " active" : "")}>
          Methodology
        </NavLink>
        <NavLink to="/contact" className={({ isActive }) => "site-nav-link" + (isActive ? " active" : "")}>
          Contact
        </NavLink>
      </nav>

      {showHeaderCta && (
        <div className="header-cta-wrap">
          <button
            type="button"
            id="btn-header-cta"
            className="btn btn-header-cta"
            onClick={handleNewScreen}
            title="Start a fresh staging or target screening session"
          >
            <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ marginRight: 6 }}>
              <path d="M10 4v12M4 10h12" />
            </svg>
            Run New Screen
          </button>
        </div>
      )}
    </header>
  );
}
