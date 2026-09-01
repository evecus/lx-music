import { useMemo, useRef, useImperativeHandle, forwardRef, useState } from 'react'
import { useI18n } from '@/lang'
import Menu, { type MenuType, type Position } from '@/components/common/Menu'
import { hasDislike } from '@/core/dislikeList'
import { useSettingValue } from '@/store/setting/hook'

export interface SelectInfo {
  musicInfo: LX.Music.MusicInfoOnline
  selectedList: LX.Music.MusicInfoOnline[]
  index: number
  single: boolean
}
const initSelectInfo = {}

export interface ListMenuProps {
  onPlay: (selectInfo: SelectInfo) => void
  onPlayLater: (selectInfo: SelectInfo) => void
  onAdd: (selectInfo: SelectInfo) => void
  onDownload: (selectInfo: SelectInfo) => void
  onCopyName: (selectInfo: SelectInfo) => void
  onMusicSourceDetail: (selectInfo: SelectInfo) => void
  onDislikeMusic: (selectInfo: SelectInfo) => void
  onPlayMv: (selectInfo: SelectInfo) => void
  onDownloadMv: (selectInfo: SelectInfo) => void
}
export interface ListMenuType {
  show: (selectInfo: SelectInfo, position: Position) => void
}

export type {
  Position,
}

// 仅网易(wy)/酷狗(kg)源且歌曲带 mv 字段时，才显示播放MV/下载MV菜单
const getMvId = (musicInfo: LX.Music.MusicInfoOnline) => {
  if (musicInfo.source !== 'wy' && musicInfo.source !== 'kg') return null
  return (musicInfo.meta as LX.Music.MusicInfoMeta_online).mv ?? null
}

export default forwardRef<ListMenuType, ListMenuProps>((props: ListMenuProps, ref) => {
  const t = useI18n()
  const [visible, setVisible] = useState(false)
  const menuRef = useRef<MenuType>(null)
  const [selectInfo, setSelectInfo] = useState<SelectInfo>(initSelectInfo as SelectInfo)
  const [isDislikeMusic, setDislikeMusic] = useState(false)
  const playMV = useSettingValue('menu.playMV')

  useImperativeHandle(ref, () => ({
    show(newSelectInfo, position) {
      setSelectInfo(newSelectInfo)
      setDislikeMusic(hasDislike(newSelectInfo.musicInfo))
      if (visible) menuRef.current?.show(position)
      else {
        setVisible(true)
        requestAnimationFrame(() => {
          menuRef.current?.show(position)
        })
      }
    },
  }))

  const menus = useMemo(() => {
    const menus = [
      { action: 'play', label: t('play') },
      { action: 'playLater', label: t('play_later') },
      { action: 'download', label: t('download') },
      { action: 'add', label: t('add_to') },
      { action: 'copyName', label: t('copy_name') },
      { action: 'musicSourceDetail', label: t('music_source_detail') },
      { action: 'dislike', label: t('dislike'), disabled: isDislikeMusic },
    ]
    // 播放MV：网易(wy)、酷狗(kg) 源歌曲带 mv 字段时显示
    if (playMV && selectInfo.musicInfo && getMvId(selectInfo.musicInfo)) {
      menus.splice(3, 0, { action: 'playMv', label: t('play_MV') })
      menus.splice(4, 0, { action: 'downloadMv', label: t('download_MV') })
    }
    return menus
  }, [t, isDislikeMusic, selectInfo, playMV])

  const handleMenuPress = ({ action }: (typeof menus)[number]) => {
    switch (action) {
      case 'play':
        props.onPlay(selectInfo)
        break
      case 'playLater':
        props.onPlayLater(selectInfo)
        break
      case 'download':
        props.onDownload(selectInfo)
        break
      case 'add':
        props.onAdd(selectInfo)
        break
      case 'copyName':
        props.onCopyName(selectInfo)
        break
      case 'musicSourceDetail':
        props.onMusicSourceDetail(selectInfo)
        break
      case 'dislike':
        props.onDislikeMusic(selectInfo)
        break
      case 'playMv':
        props.onPlayMv(selectInfo)
        break
      case 'downloadMv':
        props.onDownloadMv(selectInfo)
        break
      default:
        break
    }
  }

  return (
    visible
      ? <Menu ref={menuRef} menus={menus} onPress={handleMenuPress} />
      : null
  )
})
