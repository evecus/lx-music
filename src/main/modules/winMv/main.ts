import path from 'node:path'
import { BrowserWindow } from 'electron'
import { mainSend } from '@common/mainIpc'
import { encodePath } from '@common/utils/electron'
import { WIN_MV_RENDERER_EVENT_NAME } from '@common/ipcNames'

let browserWindow: Electron.BrowserWindow | null = null

export const isExistWindow = (): boolean => !!browserWindow

export const closeWindow = () => {
  if (!browserWindow) return
  browserWindow.close()
}

export const showWindow = () => {
  if (!browserWindow) return
  if (browserWindow.isMinimized()) browserWindow.restore()
  browserWindow.show()
  browserWindow.focus()
}

export const sendEvent = <T = any>(name: string, params?: T) => {
  if (!browserWindow) return
  mainSend(browserWindow, name, params)
}

export interface MvPlayInfo {
  url: string
  name: string
  singer: string
}

/**
 * 打开 MV 播放窗口并播放指定地址。若窗口已存在，则复用窗口切换到新的播放内容，
 * 不重复创建窗口（例如用户在列表里连续点了两首不同歌曲的"播放MV"）。
 */
export const createWindow = (info: MvPlayInfo) => {
  if (browserWindow) {
    showWindow()
    sendEvent<MvPlayInfo>(WIN_MV_RENDERER_EVENT_NAME.play, info)
    return
  }

  browserWindow = new BrowserWindow({
    width: 960,
    height: 600,
    minWidth: 480,
    minHeight: 320,
    useContentSize: true,
    backgroundColor: '#000000',
    show: false,
    webPreferences: {
      contextIsolation: false,
      webSecurity: false,
      sandbox: false,
      nodeIntegration: true,
      enableWebSQL: false,
      spellcheck: false,
    },
  })

  browserWindow.setMenuBarVisibility(false)

  browserWindow.on('closed', () => {
    browserWindow = null
  })

  browserWindow.once('ready-to-show', () => {
    browserWindow!.show()
    sendEvent<MvPlayInfo>(WIN_MV_RENDERER_EVENT_NAME.play, info)
  })

  const winURL = process.env.NODE_ENV !== 'production' ? 'http://localhost:9082/mv.html' : `file://${path.join(encodePath(__dirname), 'mv.html')}`
  void browserWindow.loadURL(winURL)
  // browserWindow.webContents.openDevTools()
}
