import { memo, useCallback, useEffect, useState } from 'react';
import { View, FlatList } from 'react-native';
import PageContent from '@/components/PageContent';
import Header from './Header';
import Tabs, { type TabType } from './Tabs';
import ListItem from './ListItem';
import MvListItem from './MvListItem';
import Text from '@/components/common/Text';
import { useTheme } from '@/store/theme/hook';
import { useDownloadTasks } from '@/store/download/hook';
import { useMvDownloadTasks } from '@/store/mvDownload/hook';
import { createStyle } from '@/utils/tools';
import { setComponentId } from '@/core/common';
import { COMPONENT_IDS } from '@/config/constant';

export default memo(({ componentId }: { componentId: string }) => {
  const tasks = useDownloadTasks();
  const mvTasks = useMvDownloadTasks();
  const [tab, setTab] = useState<TabType>('song');
  const theme = useTheme();

  useEffect(() => {
    setComponentId(COMPONENT_IDS.downloadManager, componentId)
  }, [componentId])

  const renderSongItem = useCallback(({ item }: { item: LX.Download.DownloadTask }) => (
    <ListItem task={item} />
  ), []);

  const renderMvItem = useCallback(({ item }: { item: LX.Download.MvDownloadTask }) => (
    <MvListItem task={item} />
  ), []);

  return (
    <PageContent>
      <View style={styles.container}>
        <Header componentId={componentId} />
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
    </PageContent>
  );
});

const styles = createStyle({
  container: {
    flex: 1,
  },
  empty: {
    textAlign: 'center',
    marginTop: 40,
  },
});
