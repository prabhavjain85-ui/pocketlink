# API Rate Limits & Best Practices

This document outlines the rate limits and best practices for external APIs used by TargetForge.

## RCSB PDB APIs

### Endpoints

| Endpoint | Base URL | Rate Limit | Notes |
|---|---|---|---|
| **Search API** | `https://search.rcsb.org/rcsbsearch/v2/` | ~10 req/sec | Full-text search for PDB entries |
| **Data API** | `https://data.rcsb.org/rest/v1/` | ~10 req/sec | Fetch detailed entry metadata |

### Rate Limit Behavior

- **Soft limit:** ~10 requests per second per IP
- **Hard limit:** Not officially published, but consistent heavy usage (>100 req/sec) may trigger temporary blocks
- **Cooldown:** If throttled, wait 30–60 seconds before retrying

### Best Practices

✅ **Do:**
- Batch multiple entry lookups in one GraphQL request (`fetchAndScoreTargets`); REST entry + nonpolymer calls are the fallback
- Cache results locally (localStorage or IndexedDB)
- Use GZIP compression (include `Accept-Encoding: gzip`)
- Implement exponential backoff for retries

❌ **Don't:**
- Fire more than 1 request per 100ms per user
- Loop over large lists without delays
- Hammer the API during US Eastern business hours (peak load)

### Example: Safe Batch Lookup

```javascript
// ✅ Good: one GraphQL request for the whole ID batch
const { fetchAndScoreTargets } = require("./src/targetSelectionScore");
const ranked = await fetchAndScoreTargets(pdbIds);
```

## PubChem PUG-REST API

### Endpoint

| Service | Base URL | Rate Limit |
|---|---|---|
| **PUG-REST** | `https://pubchem.ncbi.nlm.nih.gov/rest/pug/` | **5 req/sec per IP** |

### Rate Limit Behavior

- **Limit:** Maximum **5 requests per second** per IP address
- **Enforcement:** Returns HTTP 429 (Too Many Requests) when exceeded
- **Backoff:** Recommended wait is 1–2 seconds after 429 error
- **Temporary block:** Repeated violations (429s within short time) may trigger IP block for 1–24 hours

### Best Practices

✅ **Do:**
- Implement **debouncing** on search inputs (300–500 ms minimum)
- Add **delays between requests** if making batch queries (e.g., 200 ms between requests)
- Cache successful responses aggressively
- Use local-first search (filter cached results before querying API)
- Respect NCBI quiet hours: avoid batch jobs during 9 am–5 pm US Eastern, Mon–Fri

❌ **Don't:**
- Fire multiple rapid searches without debouncing
- Retry immediately on 429; wait at least 1 second
- Bypass rate limits with multiple IPs or proxies (you'll be blocked)
- Make batch requests in tight loops without delays

### Example: Safe Search with Debounce & Backoff

```javascript
const [cQuery, setCQuery] = useState("");
const debounceTimerRef = useRef(null);

const searchCompound = useCallback(async () => {
  const q = cQuery.trim();
  if (!q) return;

  // Clear previous debounce timer
  if (debounceTimerRef.current) {
    clearTimeout(debounceTimerRef.current);
  }

  setCLoading(true);
  setCError("");
  setCResult(null);

  try {
    const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(q)}/property/...`;
    
    const res = await fetch(url);
    
    // Handle rate limiting
    if (res.status === 429) {
      // Backoff: wait 2 seconds, then retry
      debounceTimerRef.current = setTimeout(() => {
        searchCompound(); // Recursive retry
      }, 2000);
      setCError("Rate limited. Retrying in 2 seconds...");
      return;
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    const p = data.PropertyTable?.Properties?.[0];
    if (!p) throw new Error("No data returned");

    setCResult(p);
  } catch (e) {
    setCError(`Error: ${e.message}`);
  } finally {
    setCLoading(false);
  }
}, [cQuery]);

// Input handler with debounce
const handleCQueryChange = (e) => {
  setCQuery(e.target.value);

  // Debounce the search
  if (debounceTimerRef.current) {
    clearTimeout(debounceTimerRef.current);
  }

  debounceTimerRef.current = setTimeout(() => {
    searchCompound();
  }, 300); // Wait 300ms before searching
};
```

## Monitoring & Debugging

### Check API Status

- **RCSB PDB:** https://status.rcsb.org/
- **NCBI (PubChem):** https://status.ncbi.nlm.nih.gov/

### Browser DevTools

1. Open DevTools (F12)
2. Go to **Network** tab
3. Filter by domain:
   - `rcsb.org` — RCSB requests
   - `nlm.nih.gov` — PubChem requests
4. Check:
   - **Status code:** 429 = rate limited, 500+ = server error
   - **Response headers:** Look for rate limit info
   - **Request size:** Large requests take longer

### Common HTTP Status Codes

| Code | Meaning | Action |
|---|---|---|
| **200** | Success | Process response |
| **400** | Bad request | Check query syntax |
| **404** | Not found | No matching compound/protein |
| **429** | Too many requests | Wait 1–2 seconds, retry |
| **500+** | Server error | Retry after 30–60 seconds |

## Scaling Tips

### If You Deploy Publicly

1. **Add request queuing** — Use a library like `p-queue` to limit concurrent requests
2. **Implement caching** — Use React Query or SWR for automatic response caching
3. **Monitor usage** — Log API calls to detect unusual patterns
4. **Rotate user agents** — Helps avoid being flagged as automated (respect robots.txt)
5. **Add user rate limiting** — Limit searches per user to prevent abuse

### Example: Request Queue

```javascript
import PQueue from 'p-queue';

const queue = new PQueue({ 
  concurrency: 1,           // One request at a time
  interval: 1000,           // Per 1 second
  maxSize: 5                // Max 5 in queue
});

const searchWithQueue = async (query) => {
  return queue.add(() => searchCompound(query));
};
```

### Example: Response Caching with React Query

```javascript
import { useQuery } from 'react-query';

const useCompoundSearch = (compoundName) => {
  return useQuery(
    ['compound', compoundName],
    () => fetchCompound(compoundName),
    {
      staleTime: 1000 * 60 * 5,        // Cache for 5 minutes
      cacheTime: 1000 * 60 * 10,       // Keep in memory for 10 minutes
      retry: 3,                        // Retry failed requests 3 times
      retryDelay: attemptIndex => 
        Math.min(1000 * Math.pow(2, attemptIndex), 30000) // Exponential backoff
    }
  );
};
```

## Contact & Support

### RCSB PDB
- **Help:** https://www.rcsb.org/docs/programmatic-access/web-apis-overview
- **Email:** help@rcsb.org
- **Issue tracker:** https://github.com/rcsb/py-rcsbsearchapi/issues

### PubChem
- **Documentation:** https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest
- **Email:** pubchem-help@ncbi.nlm.nih.gov
- **Rate limit exceptions:** Contact NCBI if you need higher limits for research

---

**Last Updated:** August 2024  
**Status:** Current with API versions as of 2024
