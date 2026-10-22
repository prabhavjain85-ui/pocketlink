const express = require('express');
const path = require('path');

const app = express();
const PORT = 3460;

app.use(express.json());

// Health check endpoint
app.get('/api/docking/health', async (req, res) => {
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch('http://localhost:8080/health');
    const data = await response.json();
    const reachable = response.ok;
    
    res.json({
      prototype: true,
      validationStatus: "unvalidated",
      status: reachable ? "ok" : "unavailable",
      serviceConfigured: true,
      serviceReachable: reachable,
      serviceUnavailable: !reachable,
      message: reachable ? "Docking service is reachable." : "Docking service could not be reached.",
      upstream: data
    });
  } catch (error) {
    res.json({
      prototype: true,
      validationStatus: "unvalidated",
      status: "unavailable",
      serviceConfigured: true,
      serviceReachable: false,
      serviceUnavailable: true,
      message: "Docking service could not be reached."
    });
  }
});

// Proxy job submission
app.post('/api/docking/jobs', async (req, res) => {
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch('http://localhost:8080/v1/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(503).json({
      prototype: true,
      validationStatus: "unvalidated",
      error: "Docking service could not be reached."
    });
  }
});

// Proxy job status
app.get('/api/docking/jobs/:jobId', async (req, res) => {
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`http://localhost:8080/v1/jobs/${req.params.jobId}`);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(503).json({
      prototype: true,
      validationStatus: "unvalidated",
      error: "Docking service could not be reached."
    });
  }
});

// Proxy job results
app.get('/api/docking/jobs/:jobId/results', async (req, res) => {
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`http://localhost:8080/v1/jobs/${req.params.jobId}/results`);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(503).json({
      prototype: true,
      validationStatus: "unvalidated",
      error: "Docking service could not be reached."
    });
  }
});

// Serve static files from dist
app.use(express.static(path.join(__dirname, 'dist')));

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`Proxy server listening on http://localhost:${PORT}`);
  console.log(`Proxying /api/docking/* to http://localhost:8080`);
});
