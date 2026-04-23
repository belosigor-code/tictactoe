import { test, expect, type Page } from '@playwright/test';

const EMAIL = 'test@zerostrong.test';
const PASSWORD = 'testpass123';

async function logIn(page: Page) {
  await page.goto('/');
  // Wait for login screen
  await expect(page.getByPlaceholder('you@example.com')).toBeVisible({ timeout: 8000 });
  await page.getByPlaceholder('you@example.com').fill(EMAIL);
  await page.getByPlaceholder('••••••').fill(PASSWORD);
  await page.getByRole('button', { name: 'LOG IN' }).last().click();
  // Wait until the header username appears (any text in header area)
  await expect(page.locator('header')).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: 'LOGOUT' })).toBeVisible({ timeout: 10000 });
}

// Unique workout name per test run to avoid cross-test pollution
function uid() {
  return Date.now().toString().slice(-6);
}

test.describe('Zero to Strong — end to end', () => {

  test('1. log in and land on workouts tab', async ({ page }) => {
    await logIn(page);
    await expect(page.getByText('MY WORKOUTS')).toBeVisible();
  });

  test('2. create a workout template', async ({ page }) => {
    await logIn(page);
    await page.getByRole('button', { name: 'NEW' }).click();
    await page.getByPlaceholder('Workout name...').fill(`Push Day ${uid()}`);
    await page.getByRole('button', { name: 'CREATE' }).click();
    await expect(page.getByRole('button', { name: 'ADD EXERCISE' })).toBeVisible();
  });

  test('3. add exercises to a template', async ({ page }) => {
    await logIn(page);
    const name = `Chest ${uid()}`;

    await page.getByRole('button', { name: 'NEW' }).click();
    await page.getByPlaceholder('Workout name...').fill(name);
    await page.getByRole('button', { name: 'CREATE' }).click();

    // Add Reps+Weight exercise
    await page.getByRole('button', { name: 'ADD EXERCISE' }).click();
    await page.getByPlaceholder('e.g. Bench Press').fill('Bench Press');
    await page.getByRole('button', { name: 'Reps + Weight' }).click();
    await page.getByRole('button', { name: 'ADD' }).click();
    await expect(page.getByText('Bench Press')).toBeVisible();

    // Add Duration exercise
    await page.getByRole('button', { name: 'ADD EXERCISE' }).click();
    await page.getByPlaceholder('e.g. Bench Press').fill('Plank');
    await page.getByRole('button', { name: 'Duration' }).click();
    await page.getByRole('button', { name: 'ADD' }).click();
    await expect(page.getByText('Plank')).toBeVisible();

    await expect(page.getByRole('button', { name: 'START WORKOUT' })).toBeVisible();
  });

  test('4. run an active workout and finish it', async ({ page }) => {
    await logIn(page);
    const name = `Legs ${uid()}`;

    // Create template with 1 reps+weight set
    await page.getByRole('button', { name: 'NEW' }).click();
    await page.getByPlaceholder('Workout name...').fill(name);
    await page.getByRole('button', { name: 'CREATE' }).click();
    await page.getByRole('button', { name: 'ADD EXERCISE' }).click();
    await page.getByPlaceholder('e.g. Bench Press').fill('Squat');
    await page.getByRole('button', { name: 'Reps + Weight' }).click();
    // Reduce to 1 set
    await page.getByRole('button', { name: 'Decrease sets' }).click();
    await page.getByRole('button', { name: 'Decrease sets' }).click();
    await page.getByRole('button', { name: 'ADD' }).click();

    // Start workout
    await page.getByRole('button', { name: 'START WORKOUT' }).click();

    // Timer control bar should appear
    await expect(page.locator('.font-mono-timer').first()).toBeVisible();

    // Log set 1
    await page.locator('input[placeholder="0"]').first().fill('8');
    await page.locator('input[placeholder="0"]').last().fill('100');
    await page.getByRole('button', { name: /SAVE Set 1/ }).click();

    // Finish
    await page.getByRole('button', { name: 'FINISH WORKOUT' }).click();
    await expect(page.getByText('FINISH WORKOUT?')).toBeVisible();
    await page.getByRole('button', { name: 'FINISH' }).last().click();

    // Redirects to History
    await expect(page.getByText('HISTORY')).toBeVisible({ timeout: 10000 });
  });

  test('5. history shows the completed session', async ({ page }) => {
    await logIn(page);
    const name = `Back ${uid()}`;

    // Create + run workout
    await page.getByRole('button', { name: 'NEW' }).click();
    await page.getByPlaceholder('Workout name...').fill(name);
    await page.getByRole('button', { name: 'CREATE' }).click();
    await page.getByRole('button', { name: 'ADD EXERCISE' }).click();
    await page.getByPlaceholder('e.g. Bench Press').fill('Pull Up');
    await page.getByRole('button', { name: 'Reps + Weight' }).click();
    await page.getByRole('button', { name: 'Decrease sets' }).click();
    await page.getByRole('button', { name: 'Decrease sets' }).click();
    await page.getByRole('button', { name: 'ADD' }).click();
    await page.getByRole('button', { name: 'START WORKOUT' }).click();
    await page.locator('input[placeholder="0"]').first().fill('10');
    await page.locator('input[placeholder="0"]').last().fill('70');
    await page.getByRole('button', { name: /SAVE Set 1/ }).click();
    await page.getByRole('button', { name: 'FINISH WORKOUT' }).click();
    await page.getByRole('button', { name: 'FINISH' }).last().click();
    await expect(page.getByText('HISTORY')).toBeVisible({ timeout: 10000 });

    // Session listed
    await expect(page.getByText(name)).toBeVisible();

    // Expand and verify set log
    await page.getByText(name).click();
    await expect(page.getByText('Pull Up')).toBeVisible();
    await expect(page.getByText(/10×70/)).toBeVisible();
  });

  test('6. logout clears session', async ({ page }) => {
    await logIn(page);
    await page.getByRole('button', { name: 'LOGOUT' }).click();
    await expect(page.getByText('ZERO TO STRONG')).toBeVisible();
    await expect(page.getByRole('button', { name: 'LOG IN' }).first()).toBeVisible();
  });

  test('7. page refresh restores tab without login flash', async ({ page }) => {
    await logIn(page);
    await page.getByRole('button', { name: 'HISTORY' }).click();
    await expect(page.getByRole('heading', { name: 'HISTORY' })).toBeVisible();
    await page.reload();
    // After reload should still be logged in on history tab
    await expect(page.getByRole('button', { name: 'LOGOUT' })).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole('heading', { name: 'HISTORY' })).toBeVisible();
  });

});
