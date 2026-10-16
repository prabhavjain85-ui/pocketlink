import React, { Suspense } from "react";

const CocrystalStructureSearch = React.lazy(() => import("./CocrystalStructureSearch"));

export default function CocrystalSearchSection() {
  return (
    <Suspense
      fallback={
        <p style={{ fontSize: "13px", color: "var(--text-dim)", marginTop: 24 }}>
          Loading co-crystal search…
        </p>
      }
    >
      <CocrystalStructureSearch />
    </Suspense>
  );
}
