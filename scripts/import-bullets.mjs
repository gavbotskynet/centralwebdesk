/**
 * Import bullets from BulletInfinity HTML page into our D1 database.
 * Usage: node scripts/import-bullets.mjs
 */

import { writeFileSync } from 'fs';

const SET_ID = '1c2dbc94-a99b-458e-9645-59fa48beacbf';
const USER_ID = 'user_3BV6mGSQsM5Wlf0vcFNDptSuUZy';
const BULLET_TREE_URL = 'https://bulletfinity.com/b/claude-code-course-6pr4d8p7o7';

async function fetchBulletTree() {
  const res = await fetch(BULLET_TREE_URL);
  const html = await res.text();

  // Extract the embedded JSON from the script tag
  const match = html.match(/data:\s*(\[[\s\S]*?\])\s*,\s*uses:/);
  if (!match) {
    throw new Error('Could not find bulletTree data in page');
  }

  return JSON.parse(match[1]);
}

function flattenBulletTree(nodes, indent = 0, results = [], sortOrders = {}) {
  if (!(indent in sortOrders)) sortOrders[indent] = 0;

  for (const node of nodes) {
    if (!node || (!node.content && node.type !== 'image')) continue;

    sortOrders[indent]++;

    const content = node.content || '';
    const bullet_type = node.type === 'image' ? 'note' : 'task';
    const collapsed = node.collapsed ? 1 : 0;
    const status = node.completed ? 'done' : 'open';

    results.push({
      id: node.id,
      user_id: USER_ID,
      content,
      bullet_type,
      status,
      indent,
      sort_order: sortOrders[indent],
      collapsed,
      set_id: SET_ID,
      created_at: node.createdAt ? Math.floor(node.createdAt / 1000) : Math.floor(Date.now() / 1000),
      updated_at: node.updatedAt ? Math.floor(node.updatedAt / 1000) : Math.floor(Date.now() / 1000),
    });

    if (node.children && node.children.length > 0) {
      flattenBulletTree(node.children, indent + 1, results, sortOrders);
    }
  }

  return results;
}

async function main() {
  console.log('Fetching bullet tree from BulletInfinity...');
  const data = await fetchBulletTree();

  const bulletTree = data[0]?.data?.bulletTree;
  if (!bulletTree) {
    console.error('Could not find bulletTree in data');
    console.log('Keys:', Object.keys(data[0]?.data || {}));
    process.exit(1);
  }

  const bullets = flattenBulletTree(bulletTree.children || []);
  console.log(`Parsed ${bullets.length} bullets\n`);

  // Print first few for verification
  bullets.slice(0, 5).forEach((b, i) => {
    console.log(`[${i}] indent=${b.indent} "${b.content.slice(0, 60)}..."`);
  });
  console.log('...\n');

  // Generate SQL
  const values = bullets.map(b => {
    const c = b.content.replace(/'/g, "''");
    return `('${b.id}', '${b.user_id}', '${c}', '${b.bullet_type}', '${b.status}', ${b.indent}, ${b.sort_order}, ${b.collapsed}, '${b.set_id}', ${b.created_at}, ${b.updated_at})`;
  }).join(',\n');

  const sql = `INSERT OR REPLACE INTO bullets (id, user_id, content, bullet_type, status, indent, sort_order, collapsed, set_id, created_at, updated_at) VALUES\n${values};`;

  writeFileSync('/tmp/import-bullets.sql', sql);
  console.log(`SQL written to /tmp/import-bullets.sql (${sql.length} chars)`);
  console.log('\nExecute with:');
  console.log('wrangler d1 execute centralwebdesk --file=/tmp/import-bullets.sql --remote');
}

main().catch(console.error);
