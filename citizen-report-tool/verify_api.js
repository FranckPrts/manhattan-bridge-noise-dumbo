#!/usr/bin/env node

/**
 * Smoke test for the API endpoints.
 *
 * Requires:
 * - .env.local with Supabase credentials
 * - vercel dev running (plain `vite`/`npm run dev` won't serve /api/*)
 * - For the authenticated tests: open the app in a browser once (it signs in
 *   anonymously automatically), then copy the access token from devtools
 *   (Application > Local Storage > the sb-<project-ref>-auth-token entry's
 *   `access_token` field) into ACCESS_TOKEN below or as an env var. Without
 *   it, only the health check runs.
 */

import fetch from 'node-fetch';
import dotenv from 'dotenv';
import process from 'process';

dotenv.config({ path: '.env.local' });

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

async function testHealthEndpoint() {
  console.log('Testing GET /api/health...');
  try {
    const res = await fetch(`${BASE_URL}/api/health`);
    if (res.status !== 200) {
      throw new Error(`Expected 200, got ${res.status}`);
    }
    const data = await res.json();
    if (data.status !== 'ok') {
      throw new Error('Response missing status: ok');
    }
    console.log('  ✓ Health check passed');
    console.log(`    Backend: ${data.backend}`);
    return true;
  } catch (err) {
    console.error('  ✗ Health check failed:', err.message);
    return false;
  }
}

async function testReportEndpoint() {
  console.log('Testing POST /api/report...');
  const payload = {
    timestamp: new Date().toISOString(),
    location: { lat: 40.706, lon: -73.977 },
    report_data: {
      annoyance: 7,
      activity_interrupted: 'work',
      perceived_direction: 'north',
    },
    device: 'test-harness',
  };

  try {
    const res = await fetch(`${BASE_URL}/api/report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
      body: JSON.stringify(payload),
    });

    if (res.status !== 201) {
      const errText = await res.text();
      throw new Error(`Expected 201, got ${res.status}: ${errText}`);
    }

    const data = await res.json();
    if (!data.id) {
      throw new Error('Response missing id');
    }

    console.log('  ✓ Report submission passed');
    console.log(`    Report ID: ${data.id}`);
    return data.id;
  } catch (err) {
    console.error('  ✗ Report submission failed:', err.message);
    return null;
  }
}

async function testDeleteEndpoint(id) {
  console.log('Testing DELETE /api/report...');
  try {
    const res = await fetch(`${BASE_URL}/api/report?id=${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    });

    if (res.status !== 200) {
      const errText = await res.text();
      throw new Error(`Expected 200, got ${res.status}: ${errText}`);
    }

    console.log('  ✓ Report deletion passed');
    return true;
  } catch (err) {
    console.error('  ✗ Report deletion failed:', err.message);
    return false;
  }
}

async function testBadPayload() {
  console.log('Testing POST /api/report with invalid payload...');
  const badPayload = { invalid: true };

  try {
    const res = await fetch(`${BASE_URL}/api/report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
      body: JSON.stringify(badPayload),
    });

    if (res.status !== 400) {
      throw new Error(`Expected 400 for bad payload, got ${res.status}`);
    }

    const data = await res.json();
    if (!data.errors || data.errors.length === 0) {
      throw new Error('Response should include validation errors');
    }

    console.log('  ✓ Validation check passed');
    return true;
  } catch (err) {
    console.error('  ✗ Validation check failed:', err.message);
    return false;
  }
}

async function main() {
  console.log('========================================');
  console.log('Citizen Report Tool — API Tests');
  console.log('========================================\n');

  const results = [];
  results.push(await testHealthEndpoint());

  if (!ACCESS_TOKEN) {
    console.log('\nSkipping authenticated endpoints — set ACCESS_TOKEN to test /api/report and /api/upload-url.');
  } else {
    console.log();
    const reportId = await testReportEndpoint();
    results.push(!!reportId);

    console.log();
    results.push(await testBadPayload());

    if (reportId) {
      console.log();
      results.push(await testDeleteEndpoint(reportId));
    }
  }

  console.log('\n========================================');
  const passed = results.filter(Boolean).length;
  const total = results.length;
  console.log(`Results: ${passed}/${total} tests passed`);

  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
