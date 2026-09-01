import RNFS from 'react-native-fs';
import { toMD5, toast, requestStoragePermission } from '@/utils/tools';
import { getMusicUrl, getLyricInfo } from '@/core/music';
import { getFileExtension, getFileExtensionFromUrl } from '@/utils/download/utils';
import { mergeLyrics } from '@/utils/download/lrcTool';
import { writeFile, unlink, mkdir, existsFile } from '@/utils/fs';
import { writeMetadata, writePic, writeLyric } from '@/utils/localMediaMetadata';
import settingState from '@/store/setting/state';
import downloadState from '@/store/download/state';
import downloadActions from '@/store/download/action';
import { filterFileName, sizeFormate } from '@/utils';
import { getPicUrl } from '@/core/music/online';

const taskQueue: LX.Download.DownloadTask[] = [];
let isProcessing = false;
const DOWNLOAD_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Mobile Safari/537.36',
};
const WY_MEDIA_HEADERS = {
  'User-Agent': '',
}
const DOWNLOAD_OPTION_MAX_ATTEMPTS = 3;
const DOWNLOAD_OPTION_RETRY_DELAY = 800;

type MetadataStatusKey = keyof LX.Download.DownloadTask['metadataStatus'];

// 默认下载到系统公共 Music 目录下的 LX Music 子文件夹（/storage/emulated/0/Music/LX Music），
// 可在 设置-下载设置-下载路径 中修改
export const getDefaultDownloadPath = () => `${RNFS.ExternalStorageDirectoryPath}/Music/LX Music`;

const getErrorMessage = (error: unknown) => {
  return error instanceof Error ? error.message : String(error);
};

const retryDownloadOption = async (label: string, handler: () => Promise<void>) => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= DOWNLOAD_OPTION_MAX_ATTEMPTS; attempt++) {
    try {
      await handler();
      return;
    } catch (error) {
      lastError = error;
      console.warn(
        `[Download Manager] ${label} failed (${attempt}/${DOWNLOAD_OPTION_MAX_ATTEMPTS}):`,
        getErrorMessage(error)
      );
      if (attempt < DOWNLOAD_OPTION_MAX_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, DOWNLOAD_OPTION_RETRY_DELAY * attempt));
      }
    }
  }
  throw new Error(
    `${label}失败（已尝试 ${DOWNLOAD_OPTION_MAX_ATTEMPTS} 次）：${getErrorMessage(lastError)}`
  );
};

const updateMetadataStatus = (
  task: LX.Download.DownloadTask,
  key: MetadataStatusKey,
  status: LX.Download.DownloadTask['metadataStatus'][MetadataStatusKey]
) => {
  downloadActions.updateTask(task.id, {
    metadataStatus: { ...task.metadataStatus, [key]: status },
  });
};

const getDownloadHeaders = (task: LX.Download.DownloadTask) => {
  return task.musicInfo.source === 'wy' ? WY_MEDIA_HEADERS : DOWNLOAD_HEADERS
}

// 正在进行的下载任务：task id -> RNFS jobId，用于取消下载
const activeJobs = new Map<string, number>();

let lastWritten = 0;
let lastTime = Date.now();

const processQueue = async () => {
  if (isProcessing || taskQueue.length === 0) return;
  isProcessing = true;

  const task = taskQueue.shift();
  if (!task) {
    isProcessing = false;
    return;
  }

  lastWritten = 0;
  lastTime = Date.now();

  try {
    await startDownload(task);
  } catch (error: any) {
    downloadActions.updateTask(task.id, { status: 'error', errorMsg: error.message });
    toast(`${task.fileName} 下载失败：${error.message}`, 'long');
  } finally {
    isProcessing = false;
    processQueue();
  }
};

const startDownload = async (task: LX.Download.DownloadTask) => {
  downloadActions.updateTask(task.id, { status: 'downloading' });

  const url = await getMusicUrl({ musicInfo: task.musicInfo, quality: task.quality, isRefresh: true });

  await requestStoragePermission()

  // 确保下载目录存在
  const downloadDir = task.filePath.substring(0, task.filePath.lastIndexOf('/'));
  if (!(await existsFile(downloadDir))) {
    await mkdir(downloadDir).catch(() => {});
  }

  toast(`${task.fileName} 正在下载...`, 'short');
  try {
    const { jobId, promise } = RNFS.downloadFile({
      fromUrl: url,
      toFile: task.filePath,
      headers: getDownloadHeaders(task),
      background: true,
      progressInterval: 500,
      progress: (res: { bytesWritten: number, contentLength: number }) => {
        const now = Date.now();
        const deltaTime = now - lastTime;
        if (deltaTime === 0) return;

        const deltaBytes = res.bytesWritten - lastWritten;
        const speed = deltaBytes / (deltaTime / 1000);

        lastWritten = res.bytesWritten;
        lastTime = now;
        const percent = res.contentLength > 0 ? res.bytesWritten / res.contentLength : 0;
        downloadActions.updateTask(task.id, {
          progress: {
            ...task.progress,
            percent,
            downloaded: res.bytesWritten,
            total: res.contentLength,
            speed: `${sizeFormate(speed)}/s`,
          },
        });
      },
    });
    activeJobs.set(task.id, jobId);

    await promise;
    console.log('下载完成:', task.fileName);
    await handleMetadata(task, task.filePath);

    try {
      await RNFS.scanFile(task.filePath);
      console.log(`[Download Manager] Media scan requested for: ${task.filePath}`);
    } catch (scanError) {
      console.error(`[Download Manager] Failed to request media scan for ${task.filePath}:`, scanError);
    }
    downloadActions.updateTask(task.id, { status: 'completed', progress: { ...task.progress, percent: 1 } });

    toast(`${task.fileName} 下载完成!`, 'short');
  } finally {
    activeJobs.delete(task.id);
  }
};

const handleMetadata = async (task: LX.Download.DownloadTask, filePath: string) => {
  console.log('开始处理元数据:', filePath);
  // 写入标签
  if (settingState.setting['download.writeMetadata']) {
    try {
      await retryDownloadOption('标签写入', async () => {
        await writeMetadata(filePath, {
          name: task.musicInfo.name,
          singer: task.musicInfo.singer,
          albumName: task.musicInfo.meta.albumName,
        }, true);
      });
      updateMetadataStatus(task, 'tags', 'success');
    } catch (error) {
      updateMetadataStatus(task, 'tags', 'fail');
      throw error;
    }
  }

  // 写入封面
  if (settingState.setting['download.writePicture']) {
    try {
      await retryDownloadOption('封面写入', async () => {
        let picPath = '';
        try {
          const picUrl = await getPicUrl({ musicInfo: task.musicInfo as LX.Music.MusicInfoOnline, isRefresh: false });
          if (!picUrl) throw new Error('未获取到封面地址');
          const extension = getFileExtensionFromUrl(picUrl);
          picPath = `${RNFS.CachesDirectoryPath}/lx_download_cover_${task.id}.${extension}`;
          await RNFS.downloadFile({ fromUrl: picUrl, toFile: picPath }).promise;
          await writePic(filePath, picPath);
        } finally {
          if (picPath) await unlink(picPath).catch(() => {});
        }
      });
      updateMetadataStatus(task, 'cover', 'success');
    } catch (error) {
      updateMetadataStatus(task, 'cover', 'fail');
      throw error;
    }
  }

  // 写入歌词
  if (settingState.setting['download.writeLyric'] || settingState.setting['download.writeEmbedLyric']) {
    try {
      await retryDownloadOption('歌词写入', async () => {
        const lyrics = await getLyricInfo({
          musicInfo: task.musicInfo as LX.Music.MusicInfoOnline,
        });
        const baseFilePath = filePath.substring(0, filePath.lastIndexOf('.'));
        const romaLyric = settingState.setting['download.writeRomaLyric'] ? lyrics.rlyric : null;
        const lyricContent = mergeLyrics(lyrics.lyric, lyrics.tlyric, romaLyric);
        if (!lyricContent) throw new Error('未获取到可写入的歌词');

        if (settingState.setting['download.writeEmbedLyric']) {
          await writeLyric(filePath, lyricContent);
        }
        if (settingState.setting['download.writeLyric']) {
          await writeFile(`${baseFilePath}.lrc`, lyricContent);
        }
      });
      updateMetadataStatus(task, 'lyric', 'success');
    } catch (error) {
      updateMetadataStatus(task, 'lyric', 'fail');
      throw error;
    }
  }
};

export const retryMetadata = async (taskId: string) => {
  const task = downloadState.tasks.find(t => t.id === taskId);
  if (!task || !task.filePath) {
    toast('任务或文件不存在，无法重试');
    return;
  }

  toast('正在尝试重新获取元信息...');
  const filePath = task.filePath;
  const metadataStatus = { ...task.metadataStatus };

  // 重试写入标签
  if (metadataStatus.tags === 'fail' && settingState.setting['download.writeMetadata']) {
    try {
      await writeMetadata(filePath, {
        name: task.musicInfo.name,
        singer: task.musicInfo.singer,
        albumName: task.musicInfo.meta.albumName,
      }, true);
      metadataStatus.tags = 'success';
    } catch (e: any) {
      console.error(`[Retry Metadata] Write Tags Error for ${task.musicInfo.name}:`, e.message);
      metadataStatus.tags = 'fail';
    }
  }

  // 重试写入封面
  if (metadataStatus.cover === 'fail' && settingState.setting['download.writePicture']) {
    try {
      const picUrl = await getPicUrl({ musicInfo: task.musicInfo as LX.Music.MusicInfoOnline, isRefresh: false });
      const extension = getFileExtensionFromUrl(picUrl);
      const picPath = `${RNFS.CachesDirectoryPath}/lx_temp_pic_${task.id}.${extension}`;

      await RNFS.downloadFile({ fromUrl: picUrl, toFile: picPath }).promise;
      await writePic(filePath, picPath);
      await unlink(picPath);
      metadataStatus.cover = 'success';
    } catch (e: any) {
      console.error(`[Retry Metadata] Write Cover Error for ${task.musicInfo.name}:`, e.message);
      metadataStatus.cover = 'fail';
    }
  }

  // 重试写入歌词
  if (metadataStatus.lyric === 'fail' && (settingState.setting['download.writeLyric'] || settingState.setting['download.writeEmbedLyric'])) {
    try {
      const lyrics = await getLyricInfo({ musicInfo: task.musicInfo as LX.Music.MusicInfoOnline });
      const baseFilePath = filePath.substring(0, filePath.lastIndexOf('.'));
      const romaLyric = settingState.setting['download.writeRomaLyric'] ? lyrics.rlyric : null;

      if (settingState.setting['download.writeEmbedLyric']) {
        const embedLyricContent = mergeLyrics(lyrics.lyric, lyrics.tlyric, romaLyric);
        if (embedLyricContent) await writeLyric(filePath, embedLyricContent);
      }
      if (settingState.setting['download.writeLyric']) {
        const finalLyricContent = mergeLyrics(lyrics.lyric, lyrics.tlyric, romaLyric);
        if (finalLyricContent) await writeFile(`${baseFilePath}.lrc`, finalLyricContent);
      }
      metadataStatus.lyric = 'success';
    } catch (e: any) {
      console.error(`[Retry Metadata] Write Lyric Error for ${task.musicInfo.name}:`, e.message);
      metadataStatus.lyric = 'fail';
    }
  }

  downloadActions.updateTask(task.id, { metadataStatus });

  if (Object.values(metadataStatus).every(s => s !== 'fail')) {
    toast('元信息已全部修复成功！');
  } else {
    toast('部分元信息修复失败，请检查日志', 'long');
  }
};

export const retryTask = (taskId: string) => {
  const task = downloadState.tasks.find(t => t.id === taskId);
  if (!task) return;

  // 失败任务由用户手动触发后原地重新排队，避免删除任务造成状态和清理竞态。
  if (task.status === 'error' || !task.filePath) {
    toast('正在重新下载...');
    void unlink(task.filePath).catch(() => {}).finally(() => {
      downloadActions.updateTask(task.id, {
        status: 'waiting',
        errorMsg: '',
        progress: { percent: 0, speed: '', downloaded: 0, total: 0 },
        metadataStatus: { cover: 'pending', lyric: 'pending', tags: 'pending' },
      });
      if (!taskQueue.some(item => item.id === task.id)) taskQueue.push(task);
      processQueue();
    });
  }
  // 如果文件已存在，但元信息失败，则只重试元信息
  else if (Object.values(task.metadataStatus).includes('fail')) {
    void retryMetadata(task.id);
  }
};

export const resumeTask = async (taskId: string) => {
  const task = downloadState.tasks.find(t => t.id === taskId);
  if (!task) return;
  if (task.status !== 'paused') return;

  if (taskQueue.some(t => t.id === task.id)) {
    return;
  }

  try {
    await unlink(task.filePath);
  } catch (error) {
    // Ignore cleanup failures so we can still restart the download.
  }

  downloadActions.updateTask(task.id, {
    status: 'waiting',
    errorMsg: '',
    progress: { percent: 0, speed: '', downloaded: 0, total: 0 },
    metadataStatus: { cover: 'pending', lyric: 'pending', tags: 'pending' },
  });
  taskQueue.push(task);
  processQueue();
};

export const addTask = (
  musicInfo: LX.Music.MusicInfo,
  quality: LX.Quality,
  silent: boolean = false
) => {
  const extension = getFileExtension(quality);

  // 兼容 singer 为字符串或 [{ name }] 数组两种数据结构
  const singerName: string = Array.isArray(musicInfo.singer)
    ? musicInfo.singer.map(s => s.name).join('、')
    : (musicInfo.singer as string);

  let fileName = settingState.setting['download.fileName']
    .replace('歌名', musicInfo.name)
    .replace('歌手', singerName);
  fileName = filterFileName(fileName);
  const id = toMD5(`${musicInfo.id}-${quality}`);
  const downloadDir = settingState.setting['download.path'] || getDefaultDownloadPath();
  const filePath = `${downloadDir}/${fileName}.${extension}`;

  const task: LX.Download.DownloadTask = {
    id,
    musicInfo,
    quality,
    status: 'waiting',
    filePath,
    fileName,
    progress: { percent: 0, speed: '', downloaded: 0, total: 0 },
    metadataStatus: { cover: 'pending', lyric: 'pending', tags: 'pending' },
    createdAt: Date.now(),
  };

  if (downloadState.tasks.some(t => t.id === task.id)) {
    toast('任务已存在');
    return;
  }

  downloadActions.addTask(task);
  taskQueue.push(task);
  processQueue();
  if (!silent) toast(`已加入下载队列：${fileName}`, 'short');
};

export const removeTask = (id: string) => {
  const taskToRemove = downloadState.tasks.find(t => t.id === id);
  const jobId = activeJobs.get(id);
  if (jobId != null && taskToRemove && taskToRemove.status === 'downloading') {
    RNFS.stopDownload(jobId);
    activeJobs.delete(id);
    void unlink(taskToRemove.filePath).catch(() => {}).finally(() => {
      console.log(`[Download Manager] Canceled and deleted partial file: ${taskToRemove.filePath}`);
    });
  } else if (taskToRemove && taskToRemove.status !== 'completed' && taskToRemove.filePath) {
    void unlink(taskToRemove.filePath).catch(() => {});
  }
  // 从队列中移除
  const taskIndex = taskQueue.findIndex(t => t.id === id);
  if (taskIndex > -1) taskQueue.splice(taskIndex, 1);
  // 从store中移除
  downloadActions.removeTask(id);
  isProcessing = false;
  processQueue();
};

/**
 * 批量下载任务 - 间隔添加，避免瞬间创建过多任务
 * @param musicInfos 选中的歌曲列表
 */
export const batchDownload = async (
  musicInfos: LX.Music.MusicInfo[],
  quality: LX.Quality
) => {
  if (!musicInfos.length) {
    toast('未选择任何歌曲');
    return;
  }

  toast(`准备添加 ${musicInfos.length} 首歌曲到下载队列...`);
  for (const musicInfo of musicInfos) {
    addTask(musicInfo, quality, true);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
};
