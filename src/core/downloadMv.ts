import RNFS from 'react-native-fs';
import { toast, requestStoragePermission } from '@/utils/tools';
import { unlink, mkdir, existsFile } from '@/utils/fs';
import { filterFileName, sizeFormate } from '@/utils';
import { getMvUrl as getWyMvUrl } from '@/utils/musicSdk/wy/mv.js';
import { getMvUrl as getKgMvUrl } from '@/utils/musicSdk/kg/mv.js';
import settingState from '@/store/setting/state';

// MV 默认下载到系统公共 Movies 目录下的 LX Music 子文件夹（/storage/emulated/0/Movies/LX Music），
// 可在 设置-下载设置-MV保存路径 中修改
export const getDefaultMvDownloadPath = () => `${RNFS.ExternalStorageDirectoryPath}/Movies/LX Music`;

const getMvDownloadDir = () => settingState.setting['download.mvPath'] || getDefaultMvDownloadPath();

const DOWNLOAD_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Mobile Safari/537.36',
};

// 简单的按 musicInfo.id 记录"正在下载中"，避免同一首MV被重复点击触发多次下载
const downloadingIds = new Set<string>();

const getMvUrlBySource = (musicInfo: LX.Music.MusicInfo): Promise<{ url: string }> => {
  const mvId = (musicInfo.meta as LX.Music.MusicInfoMeta_online).mv;
  if (!mvId) return Promise.reject(new Error('该歌曲没有MV'));
  return musicInfo.source === 'kg' ? getKgMvUrl(mvId) : getWyMvUrl(mvId);
};

const buildMvFileName = (musicInfo: LX.Music.MusicInfo): string => {
  const name = filterFileName(`${musicInfo.name} - ${musicInfo.singer}`);
  return `${name}.mp4`;
};

/**
 * 下载MV到本地（默认系统 Movies 目录下的 LX Music 子文件夹，可在设置中修改保存路径）。
 * 与音乐下载不同，MV下载没有音质选择、没有标签/封面/歌词元数据写入，
 * 触发后直接开始下载，通过 toast 提示进度关键节点（开始/完成/失败）。
 */
export const downloadMv = async (musicInfo: LX.Music.MusicInfo): Promise<void> => {
  if (musicInfo.source !== 'wy' && musicInfo.source !== 'kg') {
    toast('该来源暂不支持下载MV');
    return;
  }
  if (!musicInfo.meta.mv) {
    toast('该歌曲没有MV');
    return;
  }
  if (downloadingIds.has(musicInfo.id)) {
    toast('该MV正在下载中，请稍候');
    return;
  }

  downloadingIds.add(musicInfo.id);
  try {
    const granted = await requestStoragePermission();
    if (!granted) {
      toast('未获得存储权限，无法下载MV');
      return;
    }

    let mvUrl: string;
    try {
      const result = await getMvUrlBySource(musicInfo);
      mvUrl = result.url;
    } catch (error: any) {
      toast(`获取MV下载地址失败：${error.message}`, 'long');
      return;
    }

    const fileName = buildMvFileName(musicInfo);
    const MV_DOWNLOAD_DIR = getMvDownloadDir();
    const filePath = `${MV_DOWNLOAD_DIR}/${fileName}`;

    if (!(await existsFile(MV_DOWNLOAD_DIR))) {
      try {
        await mkdir(MV_DOWNLOAD_DIR);
      } catch (error: any) {
        // mkdir 失败时不阻断后续下载流程，交由下载请求本身的写文件结果兜底
        console.warn('[MV Download] mkdir failed:', error?.message);
      }
    }

    toast(`${fileName} 正在下载MV...`, 'short');

    let lastWritten = 0;
    let lastTime = Date.now();
    const { promise } = RNFS.downloadFile({
      fromUrl: mvUrl,
      toFile: filePath,
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
        const percent = res.contentLength > 0 ? Math.floor((res.bytesWritten / res.contentLength) * 100) : 0;
        console.log(`[MV Download] ${fileName} ${percent}% ${sizeFormate(speed)}/s`);
      },
    });

    try {
      await promise;
    } catch (error: any) {
      await unlink(filePath).catch(() => {});
      toast(`${fileName} MV下载失败：${error.message}`, 'long');
      return;
    }

    try {
      await RNFS.scanFile(filePath);
    } catch (scanError) {
      console.error('[MV Download] Failed to request media scan:', scanError);
    }

    toast(`${fileName} MV下载完成!`, 'short');
  } finally {
    downloadingIds.delete(musicInfo.id);
  }
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
