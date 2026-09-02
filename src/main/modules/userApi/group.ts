/**
 * 聚合源分组（自定义源的"在线导入"支持导入一个 JSON 清单，一次导入多个子源）
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
 * 行为约定（与移动端 TV 版保持一致）：
 * - 首次导入：依次下载 sources 里的每个脚本并调用 importApi() 挂上 groupId，
 *   单个子源下载/解析失败会被跳过，不影响其余子源导入，最终把成功/失败数汇总返回给渲染进程展示。
 * - 启动检查更新：每个分组按 lastCheckTime 做 24 小时节流；有更新时先下载新的一批、
 *   全部建好后再删除旧的一批，避免中途失败导致分组"空窗"；若当前正在使用的源恰好
 *   在被删除的旧分组里，则通过 global.lx.event_app.update_config 自动切换到新分组的第一个源
 *  （沿用现有"设置变更→renderer watcher 自动加载源"的机制，不在主进程里重复实现加载逻辑）；
 *   成功后给渲染进程发一条更新提示。
 * - 检查/下载失败：静默跳过，不提示，不改动本地任何数据，下次启动再试。
 */
import { httpFetch } from '@main/utils/request'
import { getUserApiGroups, addUserApiGroup, updateUserApiGroup, removeUserApiGroup, getUserApiIdsByGroup } from './utils'
import { importApi, removeApi, getApiList } from './index'
import { sendUserApiGroupUpdated } from '@main/modules/winMain'

const GROUP_CHECK_INTERVAL = 24 * 60 * 60 * 1000 // 24 小时

const fetchManifest = async(url: string): Promise<LX.UserApi.UserApiGroupManifest> => {
  const { body } = await httpFetch<LX.UserApi.UserApiGroupManifest | string>(url, { method: 'GET' })
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
const importManifestSources = async(
  manifest: LX.UserApi.UserApiGroupManifest,
  groupId: string,
): Promise<{ succeeded: LX.UserApi.UserApiInfo[], failed: Array<{ url: string, message: string }> }> => {
  const succeeded: LX.UserApi.UserApiInfo[] = []
  const failed: Array<{ url: string, message: string }> = []

  const results = await Promise.allSettled(manifest.sources.map(async source => {
    const { body } = await httpFetch<string>(source.url, { method: 'GET' })
    const script = typeof body === 'string' ? body : JSON.stringify(body)
    if (!script.length) throw new Error('Empty script')
    const { apiInfo } = await importApi(script, groupId)
    return apiInfo
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
export const importUserApiGroup = async(url: string): Promise<LX.UserApi.ImportUserApiGroup> => {
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
    apiIds: succeeded.map(api => api.id),
    lastCheckTime: Date.now(),
  }
  addUserApiGroup(groupInfo)

  return {
    groupInfo,
    apiList: getApiList(),
    succeededCount: succeeded.length,
    failedCount: failed.length,
  }
}

/**
 * 整体移除一个聚合分组：连同其名下所有子源一起删除（供设置界面"分组X按钮"调用）。
 * 若被移除的分组里含有正在使用的源，切换到哪个源由调用方（渲染进程）处理，这里只做数据删除。
 */
export const removeUserApiGroupWithSources = async(groupId: string): Promise<LX.UserApi.UserApiInfo[]> => {
  const groups = getUserApiGroups()
  const group = groups.find(g => g.id === groupId)

  // 待删成员 = 分组记录里的 apiIds ∪ 实际挂着该 groupId 的所有子源。
  // 即使分组记录缺失或 apiIds 不全（历史版本 bug 遗留的孤儿数据），
  // 也能把这一批子源删干净，保证分组行的移除按钮始终有效
  const memberIds = new Set(group?.apiIds ?? [])
  for (const id of getUserApiIdsByGroup(groupId)) memberIds.add(id)

  await removeApi([...memberIds])
  if (group) removeUserApiGroup(group.id)
  return getApiList()
}

export const getGroupList = getUserApiGroups

/**
 * 对单个分组做一次"检查更新并在有更新时静默替换"，内部会做节流判断。
 * 任何失败都静默吞掉，不影响旧源的可用性。
 */
const checkAndUpdateGroup = async(group: LX.UserApi.UserApiGroupInfo): Promise<void> => {
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
    updateUserApiGroup(group.id, { lastCheckTime: Date.now() })
    return
  }

  // 有更新：先建新的，成功后再删旧的，避免中途失败导致分组内容丢失
  const newGroupId = `user_api_group_${Math.random().toString().substring(2, 5)}_${Date.now()}`
  const { succeeded } = await importManifestSources(manifest, newGroupId)
  if (!succeeded.length) {
    // 新版本一个都没导入成功，视为本次更新失败，保留旧源，仅刷新检查时间等待下次再试
    updateUserApiGroup(group.id, { lastCheckTime: Date.now() })
    return
  }

  // 用子源实际挂的 groupId 查出旧分组的全部成员，
  // 不依赖记录里可能过时/不全的 apiIds，避免旧子源漏删变成孤儿
  const oldMemberIds = getUserApiIdsByGroup(group.id)
  const wasActiveSourceInOldGroup = oldMemberIds.includes(global.lx.appSetting['common.apiSource'])

  // 新源建好后，删除旧的这批（其在 UserApiInfo 列表和分组记录里的引用一并清理）
  await removeApi(oldMemberIds)
  removeUserApiGroup(group.id)

  const newGroupInfo: LX.UserApi.UserApiGroupInfo = {
    id: newGroupId,
    name: manifest.name,
    url: group.url,
    version: manifest.version,
    apiIds: succeeded.map(api => api.id),
    lastCheckTime: Date.now(),
  }
  addUserApiGroup(newGroupInfo)

  // 如果之前正在使用的源恰好属于被替换掉的旧分组，通过更新设置自动切换到新分组的第一个源，
  // 渲染进程已有的 setting watcher（useSettingSync）会据此自动加载新源，主进程无需重复实现加载逻辑
  if (wasActiveSourceInOldGroup) {
    global.lx.event_app.update_config({ 'common.apiSource': newGroupInfo.apiIds[0] })
  }

  sendUserApiGroupUpdated({ name: newGroupInfo.name, version: newGroupInfo.version })
}

/**
 * 启动时数据自愈：清理“挂了 groupId 但分组记录已不存在”的孤儿子源。
 * 历史版本的 bug（删除分组时误删待删 id 列表）可能遗留这类子源，
 * 表现为列表里出现一个名为 user_api_group_xxx_yyy 的“幽灵分组”且无法移除。
 */
const reconcileOrphanGroupSources = async(): Promise<void> => {
  const groupIds = new Set(getUserApiGroups().map(g => g.id))
  const orphanIds = getApiList().filter(api => api.groupId && !groupIds.has(api.groupId)).map(api => api.id)
  if (!orphanIds.length) return
  // 若正在使用的源恰好是孤儿，先记住，删完后切换到剩余的第一个源
  const wasActiveOrphan = orphanIds.includes(global.lx.appSetting['common.apiSource'])
  await removeApi(orphanIds)
  if (wasActiveOrphan) {
    global.lx.event_app.update_config({ 'common.apiSource': getApiList()[0]?.id ?? '' })
  }
}

/**
 * App 启动时调用：先自愈一次脏数据，再后台静默检查所有聚合源分组是否有更新，不阻塞启动流程。
 * 各分组按各自 lastCheckTime 独立节流，互不影响；单个分组检查失败不影响其余分组。
 */
export const checkUserApiGroupUpdateOnLaunch = () => {
  void (async() => {
    await reconcileOrphanGroupSources()
    const groups = getUserApiGroups()
    for (const group of groups) {
      try {
        await checkAndUpdateGroup(group)
      } catch {
        // 单个分组检查过程中出现未预期的异常，静默跳过，不影响其余分组和已有源的正常使用
      }
    }
  })()
}
