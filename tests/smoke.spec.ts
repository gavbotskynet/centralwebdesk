import { test, expect } from '@playwright/test';

test.describe('Central Web Desk', () => {
  test('landing page loads without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/');
    await expect(page).toHaveTitle(/Central Web Desk/);
    await expect(page.locator('h1')).toContainText('Your Central Web Desk');

    expect(errors).toHaveLength(0);
  });

  test('sign in page loads', async ({ page }) => {
    await page.goto('/auth/sign-in');
    await expect(page).toHaveTitle(/Sign In/);
  });

  test('navigation links are present', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('nav')).toBeVisible();
  });

  test('dashboard redirects to sign in when not authenticated', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/auth\/sign-in/);
  });
});
