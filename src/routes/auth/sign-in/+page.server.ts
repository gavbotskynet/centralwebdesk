import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env?.DB;
  let allowSignups = true;

  if (db) {
    try {
      const result = await db
        .prepare('SELECT value FROM global_settings WHERE key = ?')
        .bind('allow_signups')
        .first<{ value: string }>();
      allowSignups = result?.value === 'true';
    } catch {
      allowSignups = true;
    }
  }

  return { allowSignups };
};
