import React from "react";
import { NavLink } from "react-router-dom";

export default function Header() {
  return (
    <header className="site-header">
      <NavLink to="/" className="site-brand" end>
        <span className="site-brand-name">PocketLink</span>
        <span className="site-brand-tag">staging bench</span>
      </NavLink>
      <nav className="site-nav" aria-label="Main">
        <NavLink to="/" end className={({ isActive }) => "site-nav-link" + (isActive ? " active" : "")}>
          Staging bench
        </NavLink>
        <NavLink to="/contact" className={({ isActive }) => "site-nav-link" + (isActive ? " active" : "")}>
          Contact Us
        </NavLink>
      </nav>
    </header>
  );
}
