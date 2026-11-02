/**
 * Display-only constants and helpers for the browser.
 * The calculations that use these live in server/; this file holds no scoring logic.
 */

export const ORGAN_SYSTEMS = [
  {
    id: "liver",
    name: "Liver",
    subtitle: "Hepatotoxicity / DILI Risk",
    icon: "M4.5 12a7.5 7.5 0 0015 0m-15 0a7.5 7.5 0 1115 0m-15 0H3m16.5 0H21m-1.5 0H12m-8.485 3.515l1.06-1.06M6.343 6.343l1.06 1.06m8.486 8.486l1.06-1.06m-1.06-8.486l1.06 1.06",
    color: "#D97706", // Amber / Brown
  },
  {
    id: "heart",
    name: "Heart",
    subtitle: "Cardiotoxicity / hERG Blockade",
    icon: "M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z",
    color: "#DC2626", // Red
  },
  {
    id: "kidney",
    name: "Kidney",
    subtitle: "Nephrotoxicity / Renal Clearance",
    icon: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
    color: "#2563EB", // Blue
  },
  {
    id: "mutagenicity",
    name: "Genetic Material",
    subtitle: "Mutagenicity / Ames DNA Reactivity",
    icon: "M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z",
    color: "#7C3AED", // Purple
  },
  {
    id: "carcinogenicity",
    name: "Cellular Safety",
    subtitle: "Carcinogenicity / Oncogenic Alerts",
    icon: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z",
    color: "#EA580C", // Orange
  },
];
