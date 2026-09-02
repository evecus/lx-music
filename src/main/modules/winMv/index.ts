import { WIN_MV_RENDERER_EVENT_NAME } from '@common/ipcNames'
import { mainOn } from '@common/mainIpc'
import { closeWindow, createWindow, type MvPlayInfo } from './main'

export default () => {
  mainOn<MvPlayInfo>(WIN_MV_RENDERER_EVENT_NAME.open, ({ params: info }) => {
    createWindow(info)
  })
  mainOn(WIN_MV_RENDERER_EVENT_NAME.close, () => {
    closeWindow()
  })
}

export * from './main'
