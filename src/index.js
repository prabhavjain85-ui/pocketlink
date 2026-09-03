import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import ContactPage from "./ContactPage";
import Layout from "./Layout";
import RepurposingPage from "./RepurposingPage";
import TargetDiscoveryPage from "./TargetDiscoveryPage";
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
          <Route path="/contact" element={<ContactPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);

