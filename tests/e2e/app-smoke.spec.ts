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

test('supports undo and redo from toolbar buttons and keyboard shortcuts', async ({ page }) => {
  await page.goto('/')

  const undoButton = page.getByTitle('撤销 (Ctrl+Z)')
  const redoButton = page.getByTitle('重做 (Ctrl+Shift+Z)')
  await expect(undoButton).toBeDisabled()
  await expect(redoButton).toBeDisabled()

  const firstNodeInput = page.getByPlaceholder('输入编织内容...')
  await expect(firstNodeInput).toHaveValue('开始记录你的想法')
  await firstNodeInput.click()
  await firstNodeInput.fill('第一条想法')

  await expect(undoButton).toBeEnabled()
  await expect(redoButton).toBeDisabled()

  await undoButton.click()
  await expect(firstNodeInput).toHaveValue('开始记录你的想法')
  await expect(redoButton).toBeEnabled()

  await redoButton.click()
  await expect(firstNodeInput).toHaveValue('第一条想法')

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Z' : 'Control+Z')
  await expect(firstNodeInput).toHaveValue('开始记录你的想法')

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+Z' : 'Control+Shift+Z')
  await expect(firstNodeInput).toHaveValue('第一条想法')
})
