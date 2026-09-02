import { getMvUrl } from '@renderer/core/music'
import { downloadMv, onDownloadMvProgress } from '@renderer/utils/ipc'
import { dialog } from '@renderer/plugins/Dialog'
import { useI18n } from '@renderer/plugins/i18n'
import { appSetting } from '@renderer/store/setting'
import { filterFileName } from '@common/utils/common'
import { clipFileNameLength } from '@common/utils/tools'
import { onBeforeUnmount } from '@common/utils/vueTools'

export default ({ list }) => {
  const t = useI18n()

  // 简单记录当前正在下载的 MV 任务，避免重复触发同一首歌的下载
  const runningTasks = new Set()

  const removeProgressListener = onDownloadMvProgress(({ id, status, errorMsg }) => {
    if (status == 'completed' || status == 'cancelled' || status == 'interrupted') {
      runningTasks.delete(id)
      if (status == 'interrupted') {
        void dialog(t('list__download_mv_failed', { message: errorMsg ?? 'download interrupted' }))
      }
    }
  })
  onBeforeUnmount(() => {
    removeProgressListener()
  })

  const handleDownloadMv = async(index) => {
    const musicInfo = list.value[index]
    if (!musicInfo) return

    const taskId = `${musicInfo.source}_${musicInfo.id}`
    if (runningTasks.has(taskId)) return

    let url
    try {
      url = await getMvUrl({ musicInfo })
    } catch (err) {
      void dialog(t('list__download_mv_failed', { message: err.message }))
      return
    }

    const fileName = clipFileNameLength(filterFileName(`${musicInfo.name} - ${musicInfo.singer}`)) + '.mp4'

    runningTasks.add(taskId)
    let result
    try {
      result = await downloadMv({
        id: taskId,
        url,
        savePath: appSetting['mv.savePath'],
        fileName,
      })
    } catch (err) {
      runningTasks.delete(taskId)
      void dialog(t('list__download_mv_failed', { message: err.message }))
      return
    }
    if (result.canceled) {
      runningTasks.delete(taskId)
      return
    }
    void dialog(t('list__download_mv_start', { name: musicInfo.name }))
  }

  return {
    handleDownloadMv,
  }
}
