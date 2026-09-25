import { memo, useCallback, useState } from 'react'
import { View, FlatList } from 'react-native'
import Tabs from '@/screens/DownloadManager/Tabs'
import ListItem from '@/screens/DownloadManager/ListItem'
import MvListItem from '@/screens/DownloadManager/MvListItem'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { useDownloadTasks } from '@/store/download/hook'
import { useMvDownloadTasks } from '@/store/mvDownload/hook'
import { createStyle } from '@/utils/tools'

// 下载管理：与歌单/我的列表/设置同级的主视图
// （左侧栏汉堡按钮保持可见；横屏平板下侧边栏常驻，与其他页面一致）
export default memo(() => {
  const tasks = useDownloadTasks()
  const mvTasks = useMvDownloadTasks()
  const [tab, setTab] = useState('song')
  const theme = useTheme()

  const renderSongItem = useCallback(({ item }) => <ListItem task={item} />, [])
  const renderMvItem = useCallback(({ item }) => <MvListItem task={item} />, [])

  return (
    <View style={styles.container}>
      <Tabs tab={tab} onChange={setTab} />
      {tab == 'song' ? (
        <FlatList
          data={tasks}
          renderItem={renderSongItem}
          keyExtractor={item => item.id}
          ListEmptyComponent={<Text style={styles.empty} color={theme['c-font-label']}>暂无歌曲下载任务</Text>}
        />
      ) : (
        <FlatList
          data={mvTasks}
          renderItem={renderMvItem}
          keyExtractor={item => item.id}
          ListEmptyComponent={<Text style={styles.empty} color={theme['c-font-label']}>暂无 MV 下载任务</Text>}
        />
      )}
    </View>
  )
})

const styles = createStyle({
  container: {
    flex: 1,
  },
  empty: {
    textAlign: 'center',
    marginTop: 40,
  },
})
