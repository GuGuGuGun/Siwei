import { expect, test } from '@playwright/test'

test('renders the main workspace and switches views', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByText('Siwei Workspace')).toBeVisible()
  await expect(page.getByRole('button', { name: '大纲' })).toBeVisible()

  await page.getByRole('button', { name: '思维导图' }).click()
  await expect(page.getByRole('button', { name: '思维导图' })).toBeVisible()

  await page.getByTitle('搜索 (Ctrl+F)').click()
  await expect(page.getByPlaceholder('输入关键词进行搜索...')).toBeVisible()
})
