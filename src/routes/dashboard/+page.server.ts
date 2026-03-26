import type { PageServerLoad } from './$types';

// Auth is handled client-side in +page.svelte
// This load function just returns empty data
export const load: PageServerLoad = async () => {
  return {};
};
