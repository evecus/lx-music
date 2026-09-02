import { WIN_MAIN_RENDERER_EVENT_NAME } from '@common/ipcNames'
import { mainHandle } from '@common/mainIpc'
import { downloadMvFile, sendEvent, showSaveDialog } from '../main'
import path from 'node:path'

interface DownloadMvParams {
  id: string
  url: string
  savePath: string
  fileName: string
  headers?: Record<string, string>
}

export default () => {
  mainHandle<LX.Download.ListItem[]>(WIN_MAIN_RENDERER_EVENT_NAME.download_list_get, async() => {
    return global.lx.worker.dbService.getDownloadList()
  })
  mainHandle<LX.Download.saveDownloadMusicInfo>(WIN_MAIN_RENDERER_EVENT_NAME.download_list_add, async({ params: { list, addMusicLocationType } }) => {
    await global.lx.worker.dbService.downloadInfoSave(list, addMusicLocationType)
  })
  mainHandle<LX.Download.ListItem[]>(WIN_MAIN_RENDERER_EVENT_NAME.download_list_update, async({ params: list }) => {
    await global.lx.worker.dbService.downloadInfoUpdate(list)
  })
  mainHandle<string[]>(WIN_MAIN_RENDERER_EVENT_NAME.download_list_remove, async({ params: ids }) => {
    await global.lx.worker.dbService.downloadInfoRemove(ids)
  })
  mainHandle(WIN_MAIN_RENDERER_EVENT_NAME.download_list_clear, async() => {
    await global.lx.worker.dbService.downloadInfoClear()
  })

  /**
   * 下载 MV
   * 1. 弹出保存对话框，让用户确认/更改保存路径与文件名
   * 2. 若目标已存在同名文件，交由系统保存对话框自身的覆盖确认处理
   * 3. 使用 Electron 原生下载能力保存到磁盘，并通过 download_mv_progress 事件回报进度
   */
  mainHandle<DownloadMvParams, { canceled: boolean, savePath?: string }>(WIN_MAIN_RENDERER_EVENT_NAME.download_mv, async({ params: { id, url, savePath, fileName, headers } }) => {
    const result = await showSaveDialog({
      title: fileName,
      defaultPath: path.join(savePath, fileName),
      filters: [{ name: 'MP4', extensions: ['mp4'] }],
    })
    if (result.canceled || !result.filePath) return { canceled: true }

    const targetPath = result.filePath

    void downloadMvFile({ id, url, savePath: targetPath, headers }, (info) => {
      sendEvent(WIN_MAIN_RENDERER_EVENT_NAME.download_mv_progress, info)
    }).catch((err: any) => {
      if (err?.message === 'cancelled') return
      // 下载过程中出错时已通过 download_mv_progress 上报，这里仅做兜底日志
      console.log('downloadMvFile error', err)
    })

    return { canceled: false, savePath: targetPath }
  })
}
