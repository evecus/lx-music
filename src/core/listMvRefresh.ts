import { getMusicInfo as getKgMusicInfo } from '@/utils/musicSdk/kg/musicInfo'
import getWyMusicInfo from '@/utils/musicSdk/wy/musicInfo'
import listState from '@/store/list/state'
import { updateListMusics } from './list'
import { toast } from '@/utils/tools'

const REFRESH_DELAY = 300

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const getListMusics = (listId: string): LX.Music.MusicInfo[] => {
  return listState.allMusicList.get(listId) ?? []
}

// 只有网易(wy)/酷狗(kg)源的歌曲支持播放MV/下载MV，其他源重新拉取没有意义；
// 仅挑选 meta.mv 缺失的歌曲进行补全。
// 注意：酷狗无 MV 时存的是空字符串、网易是无 MV 时存的是 0，
// 这些值与 null/undefined 一样都视为“缺失”
const isMvMissing = (musicInfo: LX.Music.MusicInfo) => {
  if (musicInfo.source !== 'wy' && musicInfo.source !== 'kg') return false
  const mv = (musicInfo.meta as LX.Music.MusicInfoMeta_online).mv
  return mv == null || mv === '' || mv === 0
}

export const hasMvMissing = (listId: string) => getListMusics(listId).some(isMvMissing)

/**
 * “重新导入”：逐首从歌曲对应平台（仅网易/酷狗）拉取最新歌曲信息，
 * 补全列表内旧数据缺失的 meta.mv 字段，使播放MV/下载MV菜单可用。
 * 拉取成功但源本身没有 MV 的歌曲不会写入（保持无 MV 状态）。
 */
export const refreshListMvInfo = async (listId: string) => {
  const targets = getListMusics(listId).filter(isMvMissing)
  if (!targets.length) {
    toast('列表内没有需要重新导入的网易/酷狗歌曲', 'long')
    return
  }

  toast(`开始重新拉取 ${targets.length} 首歌曲的信息...`, 'long')
  const updated: Array<{ id: string, musicInfo: LX.Music.MusicInfo }> = []
  let failed = 0

  for (const musicInfo of targets) {
    try {
      const meta = musicInfo.meta as LX.Music.MusicInfoMeta_online
      if (musicInfo.source === 'wy') {
        if (!meta.songId) throw new Error('缺少歌曲ID')
        const song = await getWyMusicInfo(meta.songId).promise
        const mv: number = song?.mv ?? 0
        // 网易的 mv 字段为数值型 id，0 表示没有 MV
        if (mv > 0) {
          updated.push({ id: musicInfo.id, musicInfo: { ...musicInfo, meta: { ...musicInfo.meta, mv } } })
        }
      } else {
        const hash = (musicInfo.meta as LX.Music.MusicInfo_kg['meta']).hash
        if (!hash) throw new Error('缺少hash')
        const info = await getKgMusicInfo(hash)
        // 酷狗的 mv 为 mvhash 字符串，空表示没有 MV
        if (info?.mv) {
          updated.push({ id: musicInfo.id, musicInfo: { ...musicInfo, meta: { ...musicInfo.meta, mv: info.mv } } })
        }
      }
    } catch {
      failed++
    }
    await delay(REFRESH_DELAY)
  }

  if (updated.length) void updateListMusics(updated)
  toast(`重新导入完成：${updated.length} 首补全了MV信息${failed ? `，${failed} 首获取失败` : ''}`, 'long')
}
