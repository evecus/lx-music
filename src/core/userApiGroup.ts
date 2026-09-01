/**
 * 聚合源分组（自定义源的"聚合导入"支持导入一个 JSON 清单，一次导入多个子源）
 *
 * 清单 JSON 结构（远端 url 返回）：
 * {
 *   "version": "2026.08.24",   // 必填，仅做字符串相等比较，用于判断是否需要更新
 *   "name": "示例聚合源合集",    // 必填，分组展示名
 *   "sources": [                // 必填，且不能为空数组
 *     { "url": "https://.../a.js" },
 *     { "url": "https://.../b.js" }
 *   ]
 * }
 *
 * 行为约定：
 * - 首次导入：依次下载 sources 里的每个脚本并调用 importUserApi() 挂上 groupId，
 *   单个子源下载/解析失败会被跳过，不影响其余子源导入，最终 toast 汇总结果。
 * - 启动检查更新：每个分组按 lastCheckTime 做 24 小时节流；有更新时先下载新的一批、
 *   全部建好后再删除旧的一批，避免中途失败导致分组"空窗"；若当前正在使用的源恰好
 *   在被删除的旧分组里，则自动切换到新分组的第一个源。
 * - 检查/下载失败：静默跳过，不提示，不改动本地任何数据，下次启动再试。
 */
import { httpFetch } from '@/utils/request'
import { toast } from '@/utils/tools'
import { action } from '@/store/userApi'
import { importUserApi, removeUserApi } from '@/core/userApi'
import { setApiSource } from '@/core/apiSource'
import settingState from '@/store/setting/state'
import {
  getUserApiGroupList,
  addUserApiGroup,
  updateUserApiGroup,
  removeUserApiGroup,
} from '@/utils/data'

const GROUP_CHECK_INTERVAL = 24 * 60 * 60 * 1000 // 24 小时

const fetchManifest = async (url: string): Promise<LX.UserApi.UserApiGroupManifest> => {
  const body = await httpFetch(url).promise.then((resp: { body: unknown }) => resp.body)
  const manifest = (typeof body === 'string' ? JSON.parse(body) : body) as LX.UserApi.UserApiGroupManifest

  if (!manifest || typeof manifest.version !== 'string' || !manifest.version.length) {
    throw new Error('Invalid manifest: missing version')
  }
  if (typeof manifest.name !== 'string' || !manifest.name.trim().length) {
    throw new Error('Invalid manifest: missing name')
  }
  if (!Array.isArray(manifest.sources) || !manifest.sources.length) {
    throw new Error('Invalid manifest: missing sources')
  }
  for (const source of manifest.sources) {
    if (!source?.url || typeof source.url !== 'string') throw new Error('Invalid manifest: invalid source url')
  }
  return manifest
}

/**
 * 下载 manifest.sources 里的每个子源脚本并导入为 UserApiInfo。
 * 单个子源失败会被跳过，不抛出，最终返回成功导入的列表 + 失败信息列表。
 */
const importManifestSources = async (
  manifest: LX.UserApi.UserApiGroupManifest,
  groupId: string,
): Promise<{ succeeded: LX.UserApi.UserApiInfo[], failed: Array<{ url: string, message: string }> }> => {
  const succeeded: LX.UserApi.UserApiInfo[] = []
  const failed: Array<{ url: string, message: string }> = []

  const results = await Promise.allSettled(manifest.sources.map(async (source) => {
    const body = await httpFetch(source.url).promise.then((resp: { body: unknown }) => resp.body)
    const script = typeof body === 'string' ? body : JSON.stringify(body)
    if (!script.length) throw new Error('Empty script')
    return importUserApi(script, groupId)
  }))

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      succeeded.push(result.value)
    } else {
      failed.push({ url: manifest.sources[index].url, message: (result.reason as Error)?.message ?? String(result.reason) })
    }
  })

  return { succeeded, failed }
}

/**
 * 首次导入聚合源清单（由"聚合导入"入口调用）
 */
export const importUserApiGroup = async (url: string) => {
  const manifest = await fetchManifest(url)

  const groupId = `user_api_group_${Math.random().toString().substring(2, 5)}_${Date.now()}`
  const { succeeded, failed } = await importManifestSources(manifest, groupId)

  if (!succeeded.length) {
    throw new Error(failed[0]?.message || 'Import failed')
  }

  const groupInfo: LX.UserApi.UserApiGroupInfo = {
    id: groupId,
    name: manifest.name,
    url,
    version: manifest.version,
    apiIds: succeeded.map((api) => api.id),
    lastCheckTime: Date.now(),
  }
  await addUserApiGroup(groupInfo)
  action.setUserApiGroupList(await getUserApiGroupList())

  return { groupInfo, succeededCount: succeeded.length, failedCount: failed.length, failed }
}

/**
 * 整体移除一个聚合分组：连同其名下所有子源一起删除（供设置界面"分组X按钮"调用）。
 * 调用方需要自行处理"若被移除的分组里含有正在使用的源，切换到哪个源"的逻辑，
 * 这里只做纯粹的数据删除。
 */
export const removeUserApiGroupWithSources = async (groupId: string) => {
  const groups = await getUserApiGroupList()
  const group = groups.find((g) => g.id === groupId)
  if (!group) return
  await removeUserApi(group.apiIds)
  await removeUserApiGroup(group.id)
  action.setUserApiGroupList(await getUserApiGroupList())
}

/**
 * 对单个分组做一次"检查更新并在有更新时静默替换"，内部会做节流判断。
 * 任何失败都静默吞掉，不影响旧源的可用性。
 */
const checkAndUpdateGroup = async (group: LX.UserApi.UserApiGroupInfo): Promise<void> => {
  if (Date.now() - group.lastCheckTime < GROUP_CHECK_INTERVAL) return

  let manifest: LX.UserApi.UserApiGroupManifest
  try {
    manifest = await fetchManifest(group.url)
  } catch {
    // 清单拉取失败（无网络/链接失效等）：静默失败，不动旧数据，仅本次跳过
    return
  }

  if (manifest.version === group.version) {
    // 没有更新，仅刷新一下检查时间
    await updateUserApiGroup(group.id, { lastCheckTime: Date.now() })
    action.setUserApiGroupList(await getUserApiGroupList())
    return
  }

  // 有更新：先建新的，成功后再删旧的，避免中途失败导致分组内容丢失
  const newGroupId = `user_api_group_${Math.random().toString().substring(2, 5)}_${Date.now()}`
  const { succeeded } = await importManifestSources(manifest, newGroupId)
  if (!succeeded.length) {
    // 新版本一个都没导入成功，视为本次更新失败，保留旧源，仅刷新检查时间等待下次再试
    await updateUserApiGroup(group.id, { lastCheckTime: Date.now() })
    action.setUserApiGroupList(await getUserApiGroupList())
    return
  }

  const wasActiveSourceInOldGroup = group.apiIds.includes(settingState.setting['common.apiSource'])

  // 新源建好后，删除旧的这批（其在 UserApiInfo 列表和分组记录里的引用一并清理）
  await removeUserApi(group.apiIds)
  await removeUserApiGroup(group.id)

  const newGroupInfo: LX.UserApi.UserApiGroupInfo = {
    id: newGroupId,
    name: manifest.name,
    url: group.url,
    version: manifest.version,
    apiIds: succeeded.map((api) => api.id),
    lastCheckTime: Date.now(),
  }
  await addUserApiGroup(newGroupInfo)
  action.setUserApiGroupList(await getUserApiGroupList())

  // 如果之前正在使用的源恰好属于被替换掉的旧分组，自动切换到新分组的第一个源
  if (wasActiveSourceInOldGroup) {
    setApiSource(newGroupInfo.apiIds[0])
  }

  toast(global.i18n.t('user_api_group_updated_tip', { name: newGroupInfo.name, version: newGroupInfo.version }))
}

/**
 * App 启动时调用：后台静默检查所有聚合源分组是否有更新，不阻塞启动流程。
 * 各分组按各自 lastCheckTime 独立节流，互不影响；单个分组检查失败不影响其余分组。
 */
export const checkUserApiGroupUpdateOnLaunch = () => {
  void (async () => {
    const groups = await getUserApiGroupList()
    action.setUserApiGroupList(groups)
    for (const group of groups) {
      try {
        await checkAndUpdateGroup(group)
      } catch {
        // 单个分组检查过程中出现未预期的异常，静默跳过，不影响其余分组和已有源的正常使用
      }
    }
  })()
}
