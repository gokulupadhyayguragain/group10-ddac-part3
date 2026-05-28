import { expect, test } from '@playwright/test';

test('SafeTrace Alzheimer response workflow works in Docker', async ({ page }) => {
  const unique = Date.now();
  const email = `caregiver-${unique}@example.com`;

  await page.goto('/admin');
  await page.getByRole('button', { name: 'Seed demo data' }).click();
  await expect(page.getByText(/Seed data is ready|Login as admin/)).toBeVisible();

  await page.goto('/register');
  await page.getByLabel('Name').fill('Playwright Caregiver');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('password');
  await page.getByLabel('Phone').fill('+9779800011111');
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(page.getByText(/Verification code sent to/)).toBeVisible();

  await page.goto('/login');
  await page.getByLabel('Email').fill('caregiver@example.com');
  await page.getByLabel('Password').fill('password');
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page).toHaveURL(/\/profile/);
  await expect(page.getByText('caregiver@example.com')).toBeVisible();

  await page.goto('/report');
  await page.getByRole('button', { name: 'New report' }).click();
  await page.getByLabel('Full name').fill('UI Flow Elder');
  await page.getByLabel('Age').fill('78');
  await page.getByLabel('Last seen location').fill('Boudha Stupa Gate');
  await page.getByLabel('Caregiver name').fill('Playwright Caregiver');
  await page.getByLabel('Caregiver phone').fill('+9779800011111');
  await page.getByLabel('Description').fill('Alzheimer patient, wearing a grey sweater.');
  await page.getByLabel('Medical notes').fill('Needs calm approach.');
  await page.getByRole('button', { name: 'Save report' }).click();
  await expect(page.getByText(/Report #\d+ created/)).toBeVisible();
  await expect(page.getByRole('cell', { name: 'UI Flow Elder' }).first()).toBeVisible();

  await page.goto('/search');
  await page.getByPlaceholder('Name, area, caregiver').fill('UI Flow');
  await page.getByRole('button', { name: 'Sighting' }).first().click();
  await page.getByLabel('Location').fill('Boudha main road');
  await page.getByLabel('Reporter name').fill('Community Helper');
  await page.getByLabel('Notes').fill('Seen walking slowly near the road.');
  await page.getByRole('button', { name: 'Submit sighting' }).click();
  await expect(page.getByText(/Sighting #\d+ submitted/)).toBeVisible();

  await page.goto('/alerts');
  await expect(page.getByText(/New sighting|Community sighting|Boudha/).first()).toBeVisible();

  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@example.com');
  await page.getByLabel('Password').fill('password');
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page).toHaveURL(/\/profile/);

  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Admin', exact: true })).toBeVisible();
  await expect(page.getByText('System users')).toBeVisible();

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
});
