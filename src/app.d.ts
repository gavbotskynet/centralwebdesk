/// <reference types="@sveltejs/kit" />
/// <reference types="vite/client" />

import type { User } from '@clerk/clerk-sdk-node';

declare global {
  namespace App {
    interface Locals {
      auth: {
        userId: string | null;
        user: User | null;
      };
    }
    interface PageData {
      user: User | null;
    }
  }
}

export {};
