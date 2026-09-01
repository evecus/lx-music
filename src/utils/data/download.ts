import { getData, saveData } from '@/plugins/storage';
import { storageDataPrefix } from '@/config/constant';

const DOWNLOAD_TASKS_KEY = storageDataPrefix.downloadList;

export const normalizeDownloadTasks = (tasks: LX.Download.DownloadTask[]): LX.Download.DownloadTask[] =>
  tasks.map(task => {
    if (task.status === 'downloading' || task.status === 'waiting') {
      return { ...task, status: 'paused' };
    }
    return task;
  });

export const getDownloadTasks = async (): Promise<LX.Download.DownloadTask[]> => {
  const tasks = await getData<LX.Download.DownloadTask[]>(DOWNLOAD_TASKS_KEY);
  return normalizeDownloadTasks(tasks || []);
};

export const saveDownloadTasks = async (tasks: LX.Download.DownloadTask[]) => {
  await saveData(DOWNLOAD_TASKS_KEY, tasks);
};

const MV_DOWNLOAD_TASKS_KEY = storageDataPrefix.mvDownloadList;

export const normalizeMvDownloadTasks = (tasks: LX.Download.MvDownloadTask[]): LX.Download.MvDownloadTask[] =>
  tasks.map(task => {
    if (task.status === 'downloading' || task.status === 'waiting') {
      return { ...task, status: 'paused' };
    }
    return task;
  });

export const getMvDownloadTasks = async (): Promise<LX.Download.MvDownloadTask[]> => {
  const tasks = await getData<LX.Download.MvDownloadTask[]>(MV_DOWNLOAD_TASKS_KEY);
  return normalizeMvDownloadTasks(tasks || []);
};

export const saveMvDownloadTasks = async (tasks: LX.Download.MvDownloadTask[]) => {
  await saveData(MV_DOWNLOAD_TASKS_KEY, tasks);
};
