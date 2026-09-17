import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { rankCandidates, tryCachedRanking } from "./aiCandidateRanking";
import {
  ACTIVE_STATE_KEYS,
  getActiveState,
  saveHistoryEntry,
  setActiveState,
} from "./historyService";
import {
  CopyField,
  Panel,
  PainsBadge,
  PainsInfoTip,
  PubChemStructureImage,
  getCompoundSmiles,
  prettyName,
} from "./benchUi";
import PdbTargetSearch from "./PdbTargetSearch";
import { checkPainsBatch } from "./painsCheck";
import { MAX_CANDIDATES, drugLikenessChecks } from "./scoreCandidates";
import { targetDisplayName } from "./targetContext";
import AdversarialCritique from "./AdversarialCritique";
import QuantumInsight from "./QuantumInsight";
import SeoIntroLinks from "./SeoIntroLinks";
import HomepageIntro from "./HomepageIntro";
import "./homepageIntro.css";

function compareCandidateField(a, b, key) {
  if (key === "compound") {
    return String(a.name || a.cid).localeCompare(String(b.name || b.cid));
  }
  return (a.score ?? 0) - (b.score ?? 0);
}
