export async function rankCandidates(candidates) {
  const response = await fetch("/api/rank-candidates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ candidates })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || "AI analysis failed.");
  return data;
}
