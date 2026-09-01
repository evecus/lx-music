import RNFS from 'react-native-fs';
import { toast, requestStoragePermission } from '@/utils/tools';
import { unlink, mkdir, existsFile } from '@/utils/fs';
import { filterFileName, sizeFormate } from '@/utils';
import { getMvUrl as getWyMvUrl } from '@/utils/musicSdk/wy/mv.js';
import { getMvUrl as getKgMvUrl } from '@/utils/musicSdk/kg/mv.js';
import settingState from '@/store/setting/state';
import mvState from '@/store/mvDownload/state';
import mvActions from '@/store/mvDownload/action';

// MV 默认下载到系统公共 Movies 目录下的 LX Music 子文件夹（/storage/emulated/0/Movies/LX Music），
// 可在 设置-下载设置-MV保存路径 中修改
export const getDefaultMvDownloadPath = () => `${RNFS.ExternalStorageDirectoryPath}/Movies/LX Music`;

const getMvDownloadDir = () => settingState.setting['download.mvPath'] || getDefaultMvDownloadPath();

const DOWNLOAD_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Mobile Safari/537.36',
};

// 正在进行的 MV 下载任务：task id -> RNFS jobId，用于暂停/取消下载
const activeJobs = new Map<string, number>();

const getErrorMessage = (error: unknown) => {
  return error instanceof Error ? error.message : String(error);
};

const getMvUrlBySource = (musicInfo: LX.Music.MusicInfo): Promise<{ url: string }> => {
  const mvId = (musicInfo.meta as LX.Music.MusicInfoMeta_online).mv;
  if (!mvId) return Promise.reject(new Error('该歌曲没有MV'));
  return musicInfo.source === 'kg' ? getKgMvUrl(mvId) : getWyMvUrl(mvId);
};

const buildMvFileName = (musicInfo: LX.Music.MusicInfo): string => {
  const name = filterFileName(`${musicInfo.name} - ${musicInfo.singer}`);
  return `${name}.mp4`;
};

const resetProgress = () => ({ percent: 0, speed: '', downloaded: 0, total: 0 });

// 真正执行 MV 下载（带进度/状态上报），供新增/继续/重试共用
const startMvDownload = async (task: LX.Download.MvDownloadTask) => {
  mvActions.updateTask(task.id, { status: 'downloading', errorMsg: '' });

  try {
    const granted = await requestStoragePermission();
    if (!granted) throw new Error('未获得存储权限');

    let mvUrl: string;
    try {
      const result = await getMvUrlBySource(task.musicInfo);
      mvUrl = result.url;
    } catch (error: unknown) {
      throw new Error(`获取MV下载地址失败：${getErrorMessage(error)}`);
    }

    const MV_DOWNLOAD_DIR = getMvDownloadDir();
    if (!(await existsFile(MV_DOWNLOAD_DIR))) {
      try {
        await mkdir(MV_DOWNLOAD_DIR);
      } catch (error: unknown) {
        // mkdir 失败时不阻断后续下载流程，交由下载请求本身的写文件结果兜底
        console.warn('[MV Download] mkdir failed:', getErrorMessage(error));
      }
    }

    toast(`${task.fileName} 正在下载MV...`, 'short');

    let lastWritten = 0;
    let lastTime = Date.now();
    const { jobId, promise } = RNFS.downloadFile({
      fromUrl: mvUrl,
      toFile: task.filePath,
      headers: DOWNLOAD_HEADERS,
      background: true,
      progressInterval: 1000,
      progress: (res: { bytesWritten: number, contentLength: number }) => {
        const now = Date.now();
        const deltaTime = now - lastTime;
        if (deltaTime === 0) return;
        const deltaBytes = res.bytesWritten - lastWritten;
        const speed = deltaBytes / (deltaTime / 1000);
        lastWritten = res.bytesWritten;
        lastTime = now;
        const percent = res.contentLength > 0 ? res.bytesWritten / res.contentLength : 0;
        mvActions.updateTask(task.id, {
          progress: {
            percent,
            downloaded: res.bytesWritten,
            total: res.contentLength,
            speed: `${sizeFormate(speed)}/s`,
          },
        });
      },
    });
    activeJobs.set(task.id, jobId);

    try {
      await promise;
    } catch (error: unknown) {
      // 用户主动暂停导致的取消，不再标记为失败
      const current = mvState.tasks.find(t => t.id === task.id);
      if (current?.status === 'paused') return;
      await unlink(task.filePath).catch(() => {});
      throw error;
    } finally {
      activeJobs.delete(task.id);
    }

    try {
      await RNFS.scanFile(task.filePath);
    } catch (scanError) {
      console.error('[MV Download] Failed to request media scan:', scanError);
    }

    mvActions.updateTask(task.id, { status: 'completed', progress: { ...task.progress, percent: 1 } });
    toast(`${task.fileName} MV下载完成!`, 'short');
  } catch (error: unknown) {
    // 暂停分支已在内部处理，这里只处理真正的失败
    const current = mvState.tasks.find(t => t.id === task.id);
    if (current?.status === 'paused') return;
    const message = getErrorMessage(error);
    mvActions.updateTask(task.id, { status: 'error', errorMsg: message });
    toast(`${task.fileName} MV下载失败：${message}`, 'long');
  }
};

/**
 * 添加 MV 下载任务并立即开始下载（支持多任务并行）。
 * 若任务已存在则提示，不会重复添加。
 */
export const addMvTask = async (musicInfo: LX.Music.MusicInfo): Promise<void> => {
  if (musicInfo.source !== 'wy' && musicInfo.source !== 'kg') {
    toast('该来源暂不支持下载MV');
    return;
  }
  if (!musicInfo.meta.mv) {
    toast('该歌曲没有MV');
    return;
  }
  if (mvState.tasks.some(t => t.id === musicInfo.id)) {
    toast('任务已存在');
    return;
  }

  const fileName = buildMvFileName(musicInfo);
  const MV_DOWNLOAD_DIR = getMvDownloadDir();

  const task: LX.Download.MvDownloadTask = {
    id: musicInfo.id,
    musicInfo,
    status: 'waiting',
    filePath: `${MV_DOWNLOAD_DIR}/${fileName}`,
    fileName,
    progress: resetProgress(),
    createdAt: Date.now(),
  };

  mvActions.addTask(task);
  void startMvDownload(task);
};

/**
 * 兼容旧接口：以前是“触发后直接下载”，现在等价于添加一个 MV 下载任务。
 */
export const downloadMv = (musicInfo: LX.Music.MusicInfo): Promise<void> => addMvTask(musicInfo);

export const pauseMvTask = (taskId: string) => {
  const task = mvState.tasks.find(t => t.id === taskId);
  if (!task || task.status !== 'downloading') return;
  // 先更新状态再取消任务，startMvDownload 的失败分支会根据 paused 状态忽略本次取消
  mvActions.updateTask(taskId, { status: 'paused' });
  const jobId = activeJobs.get(taskId);
  if (jobId != null) {
    RNFS.stopDownload(jobId);
    activeJobs.delete(taskId);
  }
  void unlink(task.filePath).catch(() => {});
  toast(`${task.fileName} 已暂停`, 'short');
};

export const resumeMvTask = (taskId: string) => {
  const task = mvState.tasks.find(t => t.id === taskId);
  if (!task || task.status !== 'paused') return;
  mvActions.updateTask(taskId, {
    status: 'waiting',
    errorMsg: '',
    progress: resetProgress(),
  });
  void startMvDownload(task);
};

export const retryMvTask = (taskId: string) => {
  const task = mvState.tasks.find(t => t.id === taskId);
  if (!task || task.status !== 'error') return;
  void unlink(task.filePath).catch(() => {});
  mvActions.updateTask(taskId, {
    status: 'waiting',
    errorMsg: '',
    progress: resetProgress(),
  });
  void startMvDownload(task);
};

export const removeMvTask = (taskId: string) => {
  const task = mvState.tasks.find(t => t.id === taskId);
  if (task) {
    const jobId = activeJobs.get(taskId);
    if (jobId != null && task.status === 'downloading') {
      // 先标记暂停避免取消被记为失败，稍后直接移除任务
      mvActions.updateTask(taskId, { status: 'paused' });
      RNFS.stopDownload(jobId);
      activeJobs.delete(taskId);
    }
    if (task.status !== 'completed') {
      void unlink(task.filePath).catch(() => {});
    }
  }
  mvActions.removeTask(taskId);
};

/**
 * 获取 MV 播放地址（供"播放MV"使用）
 */
export const getMvPlayUrl = (musicInfo: LX.Music.MusicInfo): Promise<string> => {
  const mvId = (musicInfo.meta as LX.Music.MusicInfoMeta_online).mv;
  if (!mvId) return Promise.reject(new Error('该歌曲没有MV'));
  const request = musicInfo.source === 'kg' ? getKgMvUrl(mvId) : getWyMvUrl(mvId);
  return request.then((result: { url: string }) => result.url);
};
