#!/usr/bin/env node
/**
 * CentralWebDesk Playwright Debug Tool
 * Usage:
 *   node playwright-debug.js                    # screenshot + page info
 *   node playwright-debug.js --url /lists       # navigate to path first
 *   node playwright-debug.js --console          # capture console errors
 *   node playwright-debug.js --auth             # bypass auth (check signed-in state)
 */

const { chromium } = require('playwright');

const BASE = 'https://centralwebdesk.gavbotskynet.workers.dev';
const OUTPUT_DIR = '/home/digi/.openclaw/workspace/centralwebdesk/debug';

const fs = require('fs');
const path = require('path');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

(async () => {
  const args = process.argv.slice(2);
  const url = args.includes('--url') ? BASE + args[args.indexOf('--url') + 1] : BASE;
  const captureConsole = args.includes('--console');
  const checkAuth = args.includes('--auth');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  const consoleLogs = [];
  if (captureConsole) {
    page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', err => consoleLogs.push(`[error] ${err.message}`));
  }

  await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });

  const title = await page.title();
  const finalUrl = page.url();
  const bodyText = await page.textContent('body');

  console.log('=== PAGE INFO ===');
  console.log('URL:', finalUrl);
  console.log('Title:', title);
  console.log('Body preview:', bodyText.replace(/\s+/g, ' ').trim().slice(0, 400));

  // Screenshot
  const screenshotPath = path.join(OUTPUT_DIR, `screenshot-${Date.now()}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log('\nScreenshot:', screenshotPath);

  // Console logs
  if (captureConsole && consoleLogs.length > 0) {
    console.log('\n=== CONSOLE LOGS ===');
    consoleLogs.forEach(l => console.log(l));
  } else if (captureConsole) {
    console.log('\n(no console logs)');
  }

  // Auth state check
  if (checkAuth) {
    console.log('\n=== AUTH STATE ===');
    const cookies = await context.cookies();
    const clerkCookies = cookies.filter(c => c.name.includes('__session') || c.name.includes('clerk'));
    console.log('Clerk cookies:', clerkCookies.map(c => c.name));
    console.log('Authenticated:', clerkCookies.length > 0);
  }

  // Links
  const links = await page.$$eval('a', as => as.map(a => ({ href: a.href, text: a.textContent.trim().slice(0, 50) })));
  console.log('\n=== LINKS ===');
  links.slice(0, 10).forEach(l => console.log(`  ${l.text} -> ${l.href}`));

  await browser.close();
  console.log('\nDone.');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
