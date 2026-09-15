import dotenv from 'dotenv';

// `vercel dev` does not reliably inject .env.local into the serverless
// function runtime in this project's setup, so functions load it explicitly.
// No-op on actual Vercel deployments — .env.local doesn't exist there, and
// the platform injects real env vars into process.env natively.
dotenv.config({ path: '.env.local' });
