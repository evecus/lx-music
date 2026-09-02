import { getMvUrl } from '@renderer/core/music'
import { pause } from '@renderer/core/player'
import { openMvPlayer } from '@renderer/utils/ipc'
import { dialog } from '@renderer/plugins/Dialog'
import { useI18n } from '@renderer/plugins/i18n'

export default ({ list }) => {
  const t = useI18n()

  const handlePlayMv = async(index) => {
    const musicInfo = list.value[index]
    if (!musicInfo) return
    let url
    try {
      url = await getMvUrl({ musicInfo })
    } catch (err) {
      void dialog(t('list__play_mv_failed', { message: err.message }))
      return
    }
    pause()
    openMvPlayer({
      url,
      name: musicInfo.name,
      singer: musicInfo.singer,
    })
  }

  return {
    handlePlayMv,
  }
}
