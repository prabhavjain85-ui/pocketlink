import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import ContactPage from "./ContactPage";
import HistoryPage from "./HistoryPage";
import Layout from "./Layout";
import MethodologyPage from "./MethodologyPage";
import RepurposingPage from "./RepurposingPage";
import TargetDiscoveryPage from "./TargetDiscoveryPage";
import AgentPage from "./AgentPage";
import AdmePage from "./AdmePage";
import DockingPage from "./DockingPage";
import "./app.css";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<App />} />
          <Route path="/target-discovery" element={<TargetDiscoveryPage />} />
          <Route path="/repurposing" element={<RepurposingPage />} />
          <Route path="/adme" element={<AdmePage />} />
          <Route path="/docking" element={<DockingPage />} />
          <Route path="/agent" element={<AgentPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/methodology" element={<MethodologyPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);

