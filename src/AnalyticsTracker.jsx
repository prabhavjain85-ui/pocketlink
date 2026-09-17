import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export const GA_MEASUREMENT_ID = "G-43LPE4331X";

/**
 * Tracks client-side page views in Google Analytics 4 across route transitions.
 * With `send_page_view: false` set in the global gtag config, this component
 * dispatches a clean `page_view` event on initial load and subsequent client-side
 * navigations with the updated page title and path.
 */
export default function AnalyticsTracker() {
  const location = useLocation();

  useEffect(() => {
    const timer = setTimeout(() => {
      if (typeof window !== "undefined" && typeof window.gtag === "function") {
        const fullLocation = window.location.origin
          ? `${window.location.origin}${location.pathname}${location.search}`
          : window.location.href;

        window.gtag("event", "page_view", {
          page_title: document.title,
          page_location: fullLocation,
          page_path: location.pathname + location.search,
        });
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [location.pathname, location.search]);

  return null;
}
