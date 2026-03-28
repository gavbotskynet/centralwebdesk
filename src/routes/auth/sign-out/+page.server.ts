import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions: Actions = {
  default: async ({ cookies }) => {
    cookies.delete('__session', { path: '/' });
    cookies.delete('__clerk_session', { path: '/' });
    throw redirect(302, '/');
  }
};
