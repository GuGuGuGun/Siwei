import { expect, test, type Page } from '@playwright/test'

async function outlineNodeTexts(page: Page) {
  return page.locator('.group').evaluateAll((rows) =>
    rows.map((row) => {
      const input = row.querySelector('input')
      return input instanceof HTMLInputElement ? input.value : row.textContent?.trim() ?? ''
    }),
  )
}

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

test('reorders outline nodes by dragging the knit grip handle', async ({ page }) => {
  await page.goto('/')

  const firstNodeInput = page.getByPlaceholder('输入编织内容...')
  await expect(firstNodeInput).toHaveValue('开始记录你的想法')
  await firstNodeInput.click()
  await firstNodeInput.press('End')
  await firstNodeInput.press('Enter')
  await page.getByPlaceholder('输入编织内容...').fill('第二条想法')

  const sourceHandle = page.getByTitle('拖动排序').nth(1)
  const targetHandle = page.getByTitle('拖动排序').first()
  await sourceHandle.dragTo(targetHandle)

  const nodeTexts = await outlineNodeTexts(page)
  expect(nodeTexts.slice(0, 2)).toEqual(['第二条想法', '开始记录你的想法'])

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Z' : 'Control+Z')
  const revertedNodeTexts = await outlineNodeTexts(page)
  expect(revertedNodeTexts.slice(0, 2)).toEqual(['开始记录你的想法', '第二条想法'])
})
