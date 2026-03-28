import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
  // Bullets are loaded client-side via the API to handle auth naturally
  return {};
};
