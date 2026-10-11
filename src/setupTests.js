import fs from "fs";
import path from "path";
import { seedApprovedDrugsForTests } from "./approvedDrugs";

beforeAll(() => {
  const file = path.join(__dirname, "../public/data/approvedDrugs.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  seedApprovedDrugsForTests(raw);
});
