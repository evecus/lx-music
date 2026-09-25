declare namespace LX {
  namespace Download {
    interface DownloadTask {
      id: string;
      musicInfo: LX.Music.MusicInfo;
      quality: LX.Quality;
      status: 'waiting' | 'downloading' | 'paused' | 'completed' | 'error';
      progress: {
        percent: number;
        speed: string;
        downloaded: number;
        total: number;
      };
      metadataStatus: {
        cover: 'pending' | 'success' | 'fail';
        lyric: 'pending' | 'success' | 'fail';
        tags: 'pending' | 'success' | 'fail';
      };
      errorMsg?: string;
      createdAt: number;
      filePath: string;
      fileName: string;
    }

    // MV 下载任务：比音乐下载任务精简，没有音质/元数据标签这些概念
    interface MvDownloadTask {
      id: string;
      musicInfo: LX.Music.MusicInfo;
      status: 'waiting' | 'downloading' | 'paused' | 'completed' | 'error';
      progress: {
        percent: number;
        speed: string;
        downloaded: number;
        total: number;
      };
      errorMsg?: string;
      createdAt: number;
      filePath: string;
      fileName: string;
    }
  }
}
