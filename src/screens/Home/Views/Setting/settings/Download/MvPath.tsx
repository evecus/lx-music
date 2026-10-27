import { memo, useRef } from 'react'
import { View } from 'react-native'
import SubTitle from '../../components/SubTitle'
import Button from '../../components/Button'
import { useI18n } from '@/lang'
import { useSettingValue } from '@/store/setting/hook'
import { updateSetting } from '@/core/common'
import FileSelect, { type FileSelectType } from '@/components/common/FileSelect'
import { createStyle, toast } from '@/utils/tools'
import Text from '@/components/common/Text'
import { getDefaultMvDownloadPath } from '@/core/downloadMv'

// MV 保存路径设置：与音乐下载路径一样，提供一个默认保存路径，用户可以自行修改
export default memo(() => {
  const t = useI18n()
  const mvPath = useSettingValue('download.mvPath')
  const fileSelectRef = useRef<FileSelectType>(null)

  const handleSelectPath = () => {
    fileSelectRef.current?.show(
      {
        title: t('setting_download_mv_path_select'),
        dirOnly: true,
      },
      (path) => {
        if (!path) return
        updateSetting({ 'download.mvPath': path })
        toast(t('setting_download_path_set_success'))
      },
    )
  }

  const handleResetPath = () => {
    updateSetting({ 'download.mvPath': '' })
    toast(t('setting_download_mv_path_reset_success'))
  }

  return (
    <>
      <SubTitle title={t('setting_download_mv_path')}>
        <Text style={styles.path} numberOfLines={2}>
          {t('setting_download_path_label', { path: mvPath || getDefaultMvDownloadPath() })}
        </Text>
        <View style={styles.btns}>
          <Button onPress={handleSelectPath}>{t('setting_download_path_select')}</Button>
          <Button onPress={handleResetPath}>{t('setting_download_path_default')}</Button>
        </View>
      </SubTitle>
      <FileSelect ref={fileSelectRef} />
    </>
  )
})

const styles = createStyle({
  path: {
    marginBottom: 10,
  },
  btns: {
    flexDirection: 'row',
  },
})
