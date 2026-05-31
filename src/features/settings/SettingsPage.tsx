import React from 'react'
import {
  Bot,
  Database,
  FlaskConical,
  KeyRound,
  List,
  Maximize,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Save,
  Sun,
  Trash2,
  X,
} from 'lucide-react'

import { toast } from '../../components/common/Toast'
import { useWorkspaceStore } from '../../app/workspaceStore'
import { useRecentStore } from '../document/recentStore'
import { useLibraryStore } from '../library/libraryStore'
import { useSettingsStore } from './settingsStore'
import type { DefaultViewMode, ThemeMode } from '../../types/settings'
import { agentDeleteApiKey, agentSaveApiKey } from '../../services/siweiApi'

export const SettingsPage: React.FC = () => {
  const settings = useSettingsStore((s) => s.settings)
  const isSaving = useSettingsStore((s) => s.isSaving)
  const updateSettings = useSettingsStore((s) => s.updateSettings)
  const recentDocs = useRecentStore((s) => s.recentDocs)
  const loadRecents = useRecentStore((s) => s.loadRecents)
  const removeRecent = useRecentStore((s) => s.removeRecent)
  const startRefreshJob = useLibraryStore((s) => s.startRefreshJob)
  const removeMissingDocs = useLibraryStore((s) => s.removeMissingDocs)
  const rebuildIndex = useLibraryStore((s) => s.rebuildIndex)
  const setActiveView = useWorkspaceStore((s) => s.setActiveView)
  const [apiKey, setApiKey] = React.useState('')

  const saveSetting = async (patch: Parameters<typeof updateSettings>[0]) => {
    try {
      await updateSettings(patch)
      toast.success('设置已保存')
    } catch (error) {
      toast.error(`设置保存失败: ${String(error)}`)
    }
  }

  const handleClearRecents = async () => {
    try {
      for (const item of recentDocs) {
        await removeRecent(item.path)
      }
      await loadRecents()
      toast.info('最近记录已清空')
    } catch (error) {
      toast.error(`清理失败: ${String(error)}`)
    }
  }

  const runDataAction = async (action: () => Promise<void>, successMessage: string) => {
    try {
      await action()
      toast.success(successMessage)
    } catch (error) {
      toast.error(`操作失败: ${String(error)}`)
    }
  }

  const saveApiKey = async () => {
    try {
      await agentSaveApiKey(settings.agent.provider, apiKey)
      setApiKey('')
      toast.success('API key 已保存到系统钥匙串')
    } catch (error) {
      toast.error(`API key 保存失败: ${String(error)}`)
    }
  }

  const deleteApiKey = async () => {
    try {
      await agentDeleteApiKey(settings.agent.provider)
      toast.info('API key 已从系统钥匙串删除')
    } catch (error) {
      toast.error(`API key 删除失败: ${String(error)}`)
    }
  }

  return (
    <section className="flex h-full flex-col bg-[#FCFCFB] text-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-200/70 bg-white/70 px-5 dark:border-zinc-800/70 dark:bg-zinc-900/70">
        <div className="flex items-center gap-2">
          <Save size={16} className="text-zinc-700 dark:text-zinc-200" />
          <h1 className="text-sm font-semibold">设置</h1>
          {isSaving && <RefreshCw size={13} className="animate-spin text-zinc-400" />}
        </div>
        <button
          type="button"
          onClick={() => setActiveView('editor')}
          aria-label="关闭设置"
          title="关闭面板"
          className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 dark:focus:ring-zinc-700"
        >
          <X size={16} />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto flex max-w-3xl flex-col gap-5">
          <SettingsSection title="编辑">
            <SettingRow title="自动保存" description="关闭后只保留手动保存。">
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-zinc-600">
                <input
                  type="checkbox"
                  checked={settings.autoSaveEnabled}
                  onChange={(event) => void saveSetting({ autoSaveEnabled: event.target.checked })}
                  className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
                />
                {settings.autoSaveEnabled ? '已开启' : '已关闭'}
              </label>
            </SettingRow>

            <SettingRow title="自动保存延迟" description="编辑停止后等待多久写入当前文件。">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={500}
                  max={10000}
                  step={100}
                  value={settings.autoSaveIntervalMs}
                  disabled={!settings.autoSaveEnabled}
                  onChange={(event) => void saveSetting({ autoSaveIntervalMs: Number(event.target.value) })}
                  className="w-44 accent-zinc-900 disabled:opacity-40"
                />
                <input
                  type="number"
                  min={500}
                  max={10000}
                  step={100}
                  value={settings.autoSaveIntervalMs}
                  disabled={!settings.autoSaveEnabled}
                  onChange={(event) => void saveSetting({ autoSaveIntervalMs: Number(event.target.value) })}
                  className="h-8 w-24 rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-700 outline-none focus:border-zinc-400 disabled:opacity-40"
                />
                <span className="text-xs text-zinc-400">毫秒</span>
              </div>
            </SettingRow>

            <SettingRow title="默认打开视图" description="新建文档和应用初始加载时使用。">
              <div className="grid w-72 grid-cols-3 gap-1 rounded-md border border-zinc-200 bg-white p-0.5">
                {[
                  { key: 'outline', label: '大纲', icon: List },
                  { key: 'mindmap', label: '导图', icon: Database },
                  { key: 'split', label: '分屏', icon: PanelLeftOpen },
                ].map((item) => {
                  const Icon = item.icon
                  const isActive = settings.defaultViewMode === item.key
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => void saveSetting({ defaultViewMode: item.key as DefaultViewMode })}
                      className={`flex h-8 items-center justify-center gap-1 rounded-[4px] text-xs font-medium ${
                        isActive ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-100'
                      }`}
                    >
                      <Icon size={13} />
                      {item.label}
                    </button>
                  )
                })}
              </div>
            </SettingRow>
          </SettingsSection>

          <SettingsSection title="实验">
            <SettingRow title="启用实验性导图布局引擎" description="开启后可在导图工具栏切换新的布局策略。">
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-zinc-600">
                <input
                  aria-label="启用实验性导图布局引擎"
                  type="checkbox"
                  checked={settings.experimentalMindMapLayoutEngine}
                  onChange={(event) => void saveSetting({ experimentalMindMapLayoutEngine: event.target.checked })}
                  className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
                />
                <FlaskConical size={13} />
                {settings.experimentalMindMapLayoutEngine ? '已开启' : '已关闭'}
              </label>
            </SettingRow>
          </SettingsSection>

          <SettingsSection title="界面">
            <SettingRow title="主题" description="控制应用外观，可跟随系统或手动固定。">
              <div className="grid w-72 grid-cols-3 gap-1 rounded-md border border-zinc-200 bg-white p-0.5 dark:border-zinc-800 dark:bg-zinc-900">
                {[
                  { key: 'system', label: '系统', icon: Monitor },
                  { key: 'light', label: '浅色', icon: Sun },
                  { key: 'dark', label: '深色', icon: Moon },
                ].map((item) => {
                  const Icon = item.icon
                  const isActive = settings.theme === item.key
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => void saveSetting({ theme: item.key as ThemeMode })}
                      className={`flex h-8 items-center justify-center gap-1 rounded-[4px] text-xs font-medium ${
                        isActive
                          ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                          : 'text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <Icon size={13} />
                      {item.label}
                    </button>
                  )
                })}
              </div>
            </SettingRow>

            <SettingRow title="专注模式" description="隐藏侧栏、顶部工具栏和状态栏，只保留编辑画布。">
              <div className="grid w-44 grid-cols-2 gap-1 rounded-md border border-zinc-200 bg-white p-0.5 dark:border-zinc-800 dark:bg-zinc-900">
                <button
                  type="button"
                  onClick={() => void saveSetting({ focusMode: true })}
                  className={`flex h-8 items-center justify-center gap-1 rounded-[4px] text-xs font-medium ${
                    settings.focusMode
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                      : 'text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
                  }`}
                >
                  <Maximize size={13} />
                  开启
                </button>
                <button
                  type="button"
                  onClick={() => void saveSetting({ focusMode: false })}
                  className={`flex h-8 items-center justify-center gap-1 rounded-[4px] text-xs font-medium ${
                    !settings.focusMode
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                      : 'text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
                  }`}
                >
                  关闭
                </button>
              </div>
            </SettingRow>

            <SettingRow title="侧栏默认状态" description="下次启动后继续使用同样的展开状态。">
              <div className="grid w-44 grid-cols-2 gap-1 rounded-md border border-zinc-200 bg-white p-0.5 dark:border-zinc-800 dark:bg-zinc-900">
                <button
                  type="button"
                  onClick={() => void saveSetting({ sidebarCollapsed: false })}
                  className={`flex h-8 items-center justify-center gap-1 rounded-[4px] text-xs font-medium ${
                    !settings.sidebarCollapsed
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                      : 'text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
                  }`}
                >
                  <PanelLeftOpen size={13} />
                  展开
                </button>
                <button
                  type="button"
                  onClick={() => void saveSetting({ sidebarCollapsed: true })}
                  className={`flex h-8 items-center justify-center gap-1 rounded-[4px] text-xs font-medium ${
                    settings.sidebarCollapsed
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                      : 'text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
                  }`}
                >
                  <PanelLeftClose size={13} />
                  收起
                </button>
              </div>
            </SettingRow>
          </SettingsSection>

          <SettingsSection title="文档助理">
            <SettingRow title="启用助理" description="开启后可在编辑器右侧使用第三方模型处理当前文档。">
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-zinc-600">
                <input
                  type="checkbox"
                  checked={settings.agent.enabled}
                  onChange={(event) => void saveSetting({
                    agent: { ...settings.agent, enabled: event.target.checked },
                  })}
                  className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
                />
                {settings.agent.enabled ? '已开启' : '已关闭'}
              </label>
            </SettingRow>
            <SettingRow title="第三方模型" description="兼容 OpenAI 风格接口，密钥单独保存到系统钥匙串。">
              <div className="flex items-center gap-2">
                <input
                  value={settings.agent.provider}
                  onChange={(event) => void saveSetting({
                    agent: { ...settings.agent, provider: event.target.value },
                  })}
                  className="h-8 w-28 rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-700 outline-none focus:border-zinc-400"
                />
                <input
                  value={settings.agent.model}
                  onChange={(event) => void saveSetting({
                    agent: { ...settings.agent, model: event.target.value },
                  })}
                  className="h-8 w-56 rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-700 outline-none focus:border-zinc-400"
                />
              </div>
            </SettingRow>
            <SettingRow title="接口地址" description="填写第三方模型的 OpenAI-compatible base URL。">
              <input
                value={settings.agent.baseUrl}
                onChange={(event) => void saveSetting({
                  agent: { ...settings.agent, baseUrl: event.target.value },
                })}
                className="h-8 w-96 rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-700 outline-none focus:border-zinc-400"
              />
            </SettingRow>
            <SettingRow title="思考等级" description="用于支持 reasoning 的模型。">
              <select
                value={settings.agent.thinkingLevel}
                onChange={(event) => void saveSetting({
                  agent: {
                    ...settings.agent,
                    thinkingLevel: event.target.value as typeof settings.agent.thinkingLevel,
                  },
                })}
                className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-700 outline-none focus:border-zinc-400"
              >
                {['off', 'minimal', 'low', 'medium', 'high', 'xhigh'].map((level) => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
            </SettingRow>
            <SettingRow title="API key" description="密钥保存到系统钥匙串，不写入 settings.json。">
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder="输入 API key"
                  className="h-8 w-56 rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-700 outline-none focus:border-zinc-400"
                />
                <button
                  type="button"
                  onClick={() => void saveApiKey()}
                  disabled={!apiKey.trim()}
                  className="flex h-8 items-center gap-1.5 rounded-md bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
                >
                  <KeyRound size={13} />
                  保存
                </button>
                <button
                  type="button"
                  onClick={() => void deleteApiKey()}
                  className="flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 px-3 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                >
                  <Bot size={13} />
                  删除
                </button>
              </div>
            </SettingRow>
          </SettingsSection>

          <SettingsSection title="数据">
            <DataAction
              icon={<Trash2 size={15} />}
              title="清空最近记录"
              description={`${recentDocs.length} 条最近打开记录`}
              onClick={() => void handleClearRecents()}
            />
            <DataAction
              icon={<RefreshCw size={15} />}
              title="批量刷新文档库"
              description="启动后台刷新任务，重新读取已加入的文档。"
              onClick={() => void runDataAction(startRefreshJob, '刷新任务已启动')}
            />
            <DataAction
              icon={<Trash2 size={15} />}
              title="清理失效文档"
              description="移除文档库中已不存在的文件记录。"
              onClick={() => void runDataAction(removeMissingDocs, '失效文档已清理')}
            />
            <DataAction
              icon={<Database size={15} />}
              title="重建索引"
              description="删除旧索引并按当前文档库记录重建。"
              onClick={() => void runDataAction(rebuildIndex, '索引已重建')}
            />
          </SettingsSection>
        </div>
      </main>
    </section>
  )
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
      <div className="border-b border-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-800 dark:border-zinc-800 dark:text-zinc-100">
        {title}
      </div>
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">{children}</div>
    </section>
  )
}

function SettingRow({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-4 px-4 py-4 md:grid-cols-[1fr_auto] md:items-center">
      <div>
        <div className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{title}</div>
        <div className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{description}</div>
      </div>
      <div className="md:justify-self-end">{children}</div>
    </div>
  )
}

function DataAction({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid w-full gap-3 px-4 py-4 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60 md:grid-cols-[auto_1fr_auto] md:items-center"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
        {icon}
      </span>
      <span>
        <span className="block text-sm font-medium text-zinc-800 dark:text-zinc-100">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-zinc-500 dark:text-zinc-400">{description}</span>
      </span>
      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">执行</span>
    </button>
  )
}
