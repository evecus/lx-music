import { rendererSend, rendererOn, rendererOff } from '@common/rendererIpc'
import { WIN_MV_RENDERER_EVENT_NAME } from '@common/ipcNames'

type RemoveListener = () => void

export interface MvPlayInfo {
  url: string
  name: string
  singer: string
}

export const onPlay = (listener: LX.IpcRendererEventListenerParams<MvPlayInfo>): RemoveListener => {
  rendererOn<MvPlayInfo>(WIN_MV_RENDERER_EVENT_NAME.play, listener)
  return () => {
    rendererOff(WIN_MV_RENDERER_EVENT_NAME.play, listener)
  }
}

export const closeWindow = () => {
  rendererSend(WIN_MV_RENDERER_EVENT_NAME.close)
}
