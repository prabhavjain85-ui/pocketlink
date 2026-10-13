/** NSGA-II selection (minimization objectives). */

function dominates(a, b) {
  let better = false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] > b[i]) return false;
    if (a[i] < b[i]) better = true;
  }
  return better;
}

export function fastNonDominatedSort(objectives) {
  const n = objectives.length;
  const S = Array.from({ length: n }, () => []);
  const nDom = new Array(n).fill(0);
  const fronts = [[]];

  for (let p = 0; p < n; p += 1) {
    for (let q = 0; q < n; q += 1) {
      if (p === q) continue;
      if (dominates(objectives[p], objectives[q])) S[p].push(q);
      else if (dominates(objectives[q], objectives[p])) nDom[p] += 1;
    }
    if (nDom[p] === 0) {
      fronts[0].push(p);
    }
  }

  let i = 0;
  while (fronts[i]?.length) {
    const next = [];
    for (const p of fronts[i]) {
      for (const q of S[p]) {
        nDom[q] -= 1;
        if (nDom[q] === 0) next.push(q);
      }
    }
    i += 1;
    if (next.length) fronts[i] = next;
  }
  return fronts.filter((f) => f.length);
}

export function crowdingDistance(front, objectives) {
  const m = objectives[0]?.length || 0;
  const dist = new Array(front.length).fill(0);
  if (front.length <= 2) return Object.fromEntries(front.map((idx, i) => [idx, Infinity]));

  for (let k = 0; k < m; k += 1) {
    const order = front.slice().sort((a, b) => objectives[a][k] - objectives[b][k]);
    dist[front.indexOf(order[0])] = Infinity;
    dist[front.indexOf(order[order.length - 1])] = Infinity;
    const min = objectives[order[0]][k];
    const max = objectives[order[order.length - 1]][k];
    const span = max - min || 1;
    for (let i = 1; i < order.length - 1; i += 1) {
      const prev = objectives[order[i - 1]][k];
      const next = objectives[order[i + 1]][k];
      const pos = front.indexOf(order[i]);
      dist[pos] += (next - prev) / span;
    }
  }
  const out = {};
  front.forEach((idx, i) => {
    out[idx] = dist[i];
  });
  return out;
}

export function assignRanks(items, objectiveVectors) {
  const fronts = fastNonDominatedSort(objectiveVectors);
  const rank = {};
  const crowding = {};
  fronts.forEach((front, r) => {
    const cd = crowdingDistance(front, objectiveVectors);
    for (const idx of front) {
      rank[idx] = r + 1;
      crowding[idx] = cd[idx] ?? 0;
    }
  });
  return items.map((item, i) => ({
    ...item,
    rank: rank[i] ?? fronts.length + 1,
    crowding: crowding[i] ?? 0,
  }));
}

export function tournamentSelect(population, k = 3) {
  const pick = () => population[Math.floor(Math.random() * population.length)];
  let best = pick();
  for (let i = 1; i < k; i += 1) {
    const cand = pick();
    if (cand.rank < best.rank) best = cand;
    else if (cand.rank === best.rank && cand.crowding > best.crowding) best = cand;
    else if (cand.rank === best.rank && cand.crowding === best.crowding && (cand.displayScore ?? 0) > (best.displayScore ?? 0)) {
      best = cand;
    }
  }
  return best;
}

export function selectSurvivorsMuPlusLambda(combined, objectiveVectors, survivors) {
  const ranked = assignRanks(combined, objectiveVectors);
  ranked.sort((a, b) => a.rank - b.rank || b.crowding - a.crowding || (b.displayScore ?? 0) - (a.displayScore ?? 0));
  return ranked.slice(0, survivors);
}
