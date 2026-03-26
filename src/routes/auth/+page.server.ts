import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Redirect /auth to /auth/sign-in
export const load: PageServerLoad = async () => {
  throw redirect(302, '/auth/sign-in');
};
