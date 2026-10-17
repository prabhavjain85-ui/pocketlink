import React, { Suspense } from "react";
import InlineErrorBoundary from "./InlineErrorBoundary";

const CocrystalStructureSearch = React.lazy(() => import("./CocrystalStructureSearch"));

export default function CocrystalSearchSection() {
  return (
    <InlineErrorBoundary
      fallbackMessage="Co-crystal structure search encountered an error. The rest of the docking page is still available."
      showDetail
      marginTop={24}
    >
      <Suspense
        fallback={
          <p style={{ fontSize: "13px", color: "var(--text-dim)", marginTop: 24 }}>
            Loading co-crystal search…
          </p>
        }
      >
        <CocrystalStructureSearch />
      </Suspense>
    </InlineErrorBoundary>
  );
}
