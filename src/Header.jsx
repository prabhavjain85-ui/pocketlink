import React, { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { ACTIVE_STATE_KEYS, clearActiveState, getHistory, subscribeToHistory } from "./historyService";

export default function Header() {
  const navigate = useNavigate();
  const [historyCount, setHistoryCount] = useState(0);

  useEffect(() => {
    setHistoryCount(getHistory().length);
    const unsub = subscribeToHistory((list) => {
      setHistoryCount(list.length);
    });
    return unsub;
  }, []);

  const handleNewScreen = () => {
    clearActiveState(ACTIVE_STATE_KEYS.BENCH);
    navigate("/");
  };

  return (
    <header className="site-header" id="main-navigation">
      <NavLink to="/" className="site-brand" end title="PocketLink Drug Discovery Bench">
        <div className="brand-badge-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
        <div className="brand-text-wrap">
          <span className="site-brand-name">PocketLink</span>
          <span className="site-brand-tag">Drug Discovery Bench</span>
        </div>
      </NavLink>

      <nav className="site-nav" aria-label="Main Navigation">
        <NavLink to="/" end className={({ isActive }) => "site-nav-link" + (isActive ? " active" : "")}>
          Staging Bench
        </NavLink>
        <NavLink to="/target-discovery" className={({ isActive }) => "site-nav-link" + (isActive ? " active" : "")}>
          Target Discovery
        </NavLink>
        <NavLink to="/repurposing" className={({ isActive }) => "site-nav-link" + (isActive ? " active" : "")}>
          Repurposing
        </NavLink>
        <NavLink to="/history" className={({ isActive }) => "site-nav-link" + (isActive ? " active" : "")}>
          History
          {historyCount > 0 && <span className="nav-history-badge">{historyCount}</span>}
        </NavLink>
        <NavLink to="/methodology" className={({ isActive }) => "site-nav-link" + (isActive ? " active" : "")}>
          Methodology
        </NavLink>
        <NavLink to="/contact" className={({ isActive }) => "site-nav-link" + (isActive ? " active" : "")}>
          Contact
        </NavLink>
      </nav>

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
    </header>
  );
}

