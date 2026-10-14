/** Browser-only scoring worker factory (keeps import.meta out of Jest bundle). */

export function createScoringWorker() {
  if (typeof Worker === "undefined") return null;
  return new Worker(new URL("./evolutionScoring.worker.js", import.meta.url));
}
