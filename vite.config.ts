import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { execSync } from 'child_process';

const buildId = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();

export default defineConfig({
  plugins: [sveltekit()],
  define: {
    __BUILD_ID__: JSON.stringify(buildId)
  }
});
