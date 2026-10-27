import { memo, useCallback, useState, useEffect, useRef } from 'react';
import { View, TouchableOpacity } from 'react-native';
import Text from '@/components/common/Text';
import Image from '@/components/common/Image';
import { Icon } from '@/components/common/Icon';
import Menu, { type MenuType } from '@/components/common/Menu';
import { useTheme } from '@/store/theme/hook';
import { createStyle } from '@/utils/tools';
import { dateFormat, sizeFormate } from '@/utils/common';
import { pauseMvTask, resumeMvTask, retryMvTask, removeMvTask } from '@/core/downloadMv';

const ProgressBar = ({ progress, theme }: { progress: number, theme: ReturnType<typeof useTheme> }) => (
  <View style={styles.progressTrack}>
    <View style={{ ...styles.progressFill, width: `${Math.min(progress * 100, 100)}%`, backgroundColor: theme['c-primary'] }} />
  </View>
)

export default memo(({ task: initialTask }: { task: LX.Download.MvDownloadTask }) => {
  const theme = useTheme();
  const [task, setTask] = useState(initialTask);
  const errorColor = theme['c-600'];

  const [menus, setMenus] = useState<{ action: string, label: string, disabled?: boolean }[]>([]);
  const [menuVisible, setMenuVisible] = useState(false);
  const menuRef = useRef<MenuType>(null);
  const moreButtonRef = useRef<TouchableOpacity>(null);

  useEffect(() => {
    const handleProgressUpdate = ({ id, progress }: { id: string, progress: LX.Download.MvDownloadTask['progress'] }) => {
      if (id === task.id) setTask(prevTask => ({ ...prevTask, progress }));
    };
    const handleStatusUpdate = ({ id, status, errorMsg }: { id: string, status: LX.Download.MvDownloadTask['status'], errorMsg?: string }) => {
      if (id === task.id) setTask(prevTask => ({ ...prevTask, status, errorMsg }));
    };
    global.app_event.on('mv_download_progress_update', handleProgressUpdate);
    global.app_event.on('mv_download_status_update', handleStatusUpdate);

    setTask(initialTask);

    return () => {
      global.app_event.off('mv_download_progress_update', handleProgressUpdate);
      global.app_event.off('mv_download_status_update', handleStatusUpdate);
    };
  }, [task.id, initialTask]);

  const handleMenuPress = useCallback(({ action }: { action: string }) => {
    switch (action) {
      case 'pause':
        pauseMvTask(task.id);
        break;
      case 'resume':
        resumeMvTask(task.id);
        break;
      case 'retry':
        retryMvTask(task.id);
        break;
      case 'remove':
        removeMvTask(task.id);
        break;
      default:
        break;
    }
  }, [task.id]);

  const handleShowMenu = useCallback(() => {
    // 与歌曲菜单样式一致的三点菜单，按任务状态显示不同操作
    const list: { action: string, label: string, disabled?: boolean }[] = [];
    if (task.status === 'downloading') list.push({ action: 'pause', label: '暂停' });
    if (task.status === 'paused') list.push({ action: 'resume', label: '开始' });
    if (task.status === 'error') list.push({ action: 'retry', label: '重试' });
    list.push({ action: 'remove', label: '删除' });
    setMenus(list);

    if (moreButtonRef.current?.measure) {
      moreButtonRef.current.measure((fx, fy, width, height, px, py) => {
        const position = { x: Math.ceil(px), y: Math.ceil(py), w: Math.ceil(width), h: Math.ceil(height) };
        if (menuVisible) menuRef.current?.show(position);
        else {
          setMenuVisible(true);
          requestAnimationFrame(() => {
            menuRef.current?.show(position);
          });
        }
      });
    }
  }, [task.status, menuVisible]);

  const renderStatus = () => {
    switch (task.status) {
      case 'downloading':
        return (
          <View>
            <ProgressBar progress={task.progress.percent} theme={theme} />
            <View style={styles.progressDetails}>
              <Text size={10} color={theme['c-font-label']}>
                {sizeFormate(task.progress.downloaded)} / {sizeFormate(task.progress.total)}
              </Text>
              <Text size={10} color={theme['c-font-label']}>
                {task.progress.speed}
              </Text>
            </View>
          </View>
        );
      case 'completed':
        return (
          <Text size={12} color={theme['c-primary']} numberOfLines={1}>已完成</Text>
        );
      case 'error':
        return <Text size={12} color={errorColor} numberOfLines={1}>{task.errorMsg || '下载失败'}</Text>;
      case 'paused':
        return <Text size={12} color={theme['c-font-label']}>已暂停</Text>;
      case 'waiting':
        return <Text size={12} color={theme['c-font-label']}>等待中...</Text>;
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <Image url={task.musicInfo.meta.picUrl} style={styles.artwork} />
      <View style={styles.info}>
        <Text numberOfLines={1}>
          {task.musicInfo.name}
          <Text size={12} color={theme['c-font-label']}>  {task.musicInfo.singer}</Text>
        </Text>
        <Text size={11} color={theme['c-font-label']} style={styles.detailsRow}>MV • {dateFormat(task.createdAt, 'Y-M-D h:m')}</Text>
        {renderStatus()}
      </View>
      <TouchableOpacity onPress={handleShowMenu} ref={moreButtonRef} style={styles.moreButton}>
        <Icon name="dots-vertical" size={16} color={theme['c-350']} />
      </TouchableOpacity>
      {menuVisible && <Menu ref={menuRef} menus={menus} onPress={handleMenuPress} />}
    </View>
  );
});

const styles = createStyle({
  container: {
    flexDirection: 'row',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
  },
  artwork: {
    width: 60,
    height: 60,
    borderRadius: 6,
  },
  info: {
    flex: 1,
    marginLeft: 15,
    justifyContent: 'center',
    gap: 4,
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(128,128,128,0.25)',
    marginTop: 6,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  detailsRow: {
    marginTop: 4,
    marginBottom: 4,
  },
  moreButton: {
    padding: 10,
  },
});
