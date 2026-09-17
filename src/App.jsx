import React from "react";
import { useStagingBench } from "./useStagingBench";
import StagingBenchView from "./StagingBenchView";
import "./homepageIntro.css";

export default function App() {
  const bench = useStagingBench();
  return <StagingBenchView {...bench} />;
}
