import registerUserApi from './userApi'
import registerWinMain from './winMain'
import registerHotKey from './hotKey'
import registerTray from './tray'
import registerAppMenu from './appMenu'
import registerWinLyric from './winLyric'
import registerWinMv from './winMv'
import registerCommonRenderers from './commonRenderers'
import { checkUserApiGroupUpdateOnLaunch } from './userApi/group'

let isRegistered = false
export default () => {
  if (isRegistered) return
  registerUserApi()
  registerCommonRenderers()
  registerWinMain()
  registerHotKey()
  registerTray()
  registerAppMenu()
  registerWinLyric()
  registerWinMv()
  isRegistered = true

  // 后台静默检查聚合源分组是否有更新，不阻塞启动流程，各分组内部按 24h 节流
  checkUserApiGroupUpdateOnLaunch()
}
