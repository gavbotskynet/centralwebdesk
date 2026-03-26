#!/usr/bin/env node
/**
 * Cloudflare Setup Script for Central Web Desk
 * 
 * This script automates the creation of:
 * 1. D1 Database
 * 2. R2 Storage Bucket
 * 3. Returns the necessary IDs/keys for .env
 * 
 * Usage: node scripts/cloudflare-setup.js
 * 
 * Prerequisites:
 * - wrangler CLI installed (npm install -g wrangler)
 * - Cloudflare account with API token
 * - Cloudflare API token with permissions for D1, R2, and Workers
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

const run = (cmd, options = {}) => {
  console.log(`\n$ ${cmd}`);
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: 'pipe', ...options });
  } catch (error) {
    console.error(`Command failed: ${error.message}`);
    if (error.stderr) console.error(error.stderr);
    process.exit(1);
  }
};

async function main() {
  console.log('===========================================');
  console.log('  Central Web Desk - Cloudflare Setup');
  console.log('===========================================\n');

  // Check for Cloudflare credentials
  const cloudflareToken = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

  if (!cloudflareToken) {
    console.error('Error: CLOUDFLARE_API_TOKEN environment variable not set.');
    console.error('\nGet your API token at: https://dash.cloudflare.com/profile/api-tokens');
    console.error('Required permissions: Account:D1:Edit, Account:Workers KV Storage:Edit, Account:R2:Bucket:Edit');
    console.error('\nThen run: export CLOUDFLARE_API_TOKEN=your_token');
    process.exit(1);
  }

  if (!accountId) {
    console.error('Error: CLOUDFLARE_ACCOUNT_ID environment variable not set.');
    console.error('Find your Account ID at: https://dash.cloudflare.com/_aj-accounts?zone=centralwebdesk.com');
    console.error('\nThen run: export CLOUDFLARE_ACCOUNT_ID=your_account_id');
    process.exit(1);
  }

  console.log(`Using Cloudflare Account ID: ${accountId}`);

  // Create D1 Database
  console.log('\n--- Creating D1 Database ---');
  let d1Result;
  try {
    d1Result = run(`wrangler d1 create centralwebdesk --account-id ${accountId}`);
    const d1Match = d1Result.match(/"uuid":\s*"([^"]+)"/);
    if (d1Match) {
      console.log(`\n✅ D1 Database created with ID: ${d1Match[1]}`);
    }
  } catch {
    console.log('D1 database might already exist, checking...');
  }

  // Create R2 Bucket
  console.log('\n--- Creating R2 Bucket ---');
  try {
    run(`wrangler r2 bucket create centralwebdesk-files --account-id ${accountId}`);
    console.log('✅ R2 Bucket "centralwebdesk-files" created');
  } catch {
    console.log('R2 bucket might already exist, continuing...');
  }

  // Generate R2 API token
  console.log('\n--- Creating R2 API Token ---');
  console.log('⚠️  Manual step: Go to https://dash.cloudflare.com/#/account/tokens');
  console.log('   Create a Custom Token with "Edit" permission for R2 bucket "centralwebdesk-files"');
  const r2AccessKey = await question('\nPaste your R2 Access Key ID: ');
  const r2SecretKey = await question('Paste your R2 Secret Access Key: ');

  // Create .env file
  console.log('\n--- Creating .env file ---');
  const envContent = `# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=${process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || 'pk_test_your_clerk_publishable_key'}
CLERK_SECRET_KEY=${process.env.CLERK_SECRET_KEY || 'sk_test_your_clerk_secret_key'}

# Cloudflare
CLOUDFLARE_ACCOUNT_ID=${accountId}
CLOUDFLARE_API_TOKEN=${cloudflareToken}

# D1 Database (update UUID after running this script)
D1_DATABASE_ID=${d1Match ? d1Match[1] : 'your_d1_database_id'}

# R2 Storage
R2_ACCESS_KEY_ID=${r2AccessKey}
R2_SECRET_ACCESS_KEY=${r2SecretKey}
R2_BUCKET_NAME=centralwebdesk-files
`;

  writeFileSync('.env', envContent);
  console.log('✅ Created .env file with your credentials');

  console.log('\n===========================================');
  console.log('  Setup Complete!');
  console.log('===========================================');
  console.log('\nNext steps:');
  console.log('1. Run `npm install` to install dependencies');
  console.log('2. Update Clerk keys in .env if not set');
  console.log('3. Run `npm run cf:d1:migrate` to create database tables');
  console.log('4. Run `npm run dev` to start development server');
  console.log('\nFor Cloudflare Pages deployment:');
  console.log('1. Push to GitHub');
  console.log('2. Connect repo to Cloudflare Pages');
  console.log('3. Set environment variables in Pages settings');
  console.log('4. Deploy!');

  rl.close();
}

main().catch(console.error);
