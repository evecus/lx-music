import state from './state';
import MvDownloadTask = LX.Download.MvDownloadTask;
import { saveMvDownloadTasks } from '@/utils/data/download';
import { throttle } from '@/utils';

const throttledSave = throttle(() => {
  void saveMvDownloadTasks(state.tasks);
}, 1000);

export default {
  setTasks(tasks: LX.Download.MvDownloadTask[]) {
    state.tasks = tasks;
    global.app_event.mv_download_list_changed();
    throttledSave();
  },
  addTask(task: MvDownloadTask) {
    state.tasks.unshift(task);
    global.app_event.mv_download_list_changed();
    global.app_event.mv_download_task_add(task);
    throttledSave();
  },
  updateTask(id: string, updatedFields: Partial<MvDownloadTask>) {
    const taskIndex = state.tasks.findIndex(t => t.id === id);
    if (taskIndex > -1) {
      Object.assign(state.tasks[taskIndex], updatedFields);
      global.app_event.mv_download_list_changed();
      if (updatedFields.progress) {
        global.app_event.mv_download_progress_update({ id, progress: updatedFields.progress });
      }
      if (updatedFields.status) {
        global.app_event.mv_download_status_update({ id, status: updatedFields.status, errorMsg: updatedFields.errorMsg });
      }
      throttledSave();
    }
  },
  removeTask(id: string) {
    const index = state.tasks.findIndex(t => t.id === id);
    if (index > -1) {
      state.tasks.splice(index, 1);
      global.app_event.mv_download_list_changed();
      throttledSave();
    }
  },
  clearTasks() {
    state.tasks = [];
    global.app_event.mv_download_list_changed();
    throttledSave();
  },
};
