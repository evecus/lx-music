import { useEffect, useState } from 'react';
import state from './state';

export const useMvDownloadTasks = () => {
  const [tasks, setTasks] = useState([...state.tasks]);

  useEffect(() => {
    const handleUpdate = () => {
      setTasks([...state.tasks]);
    };
    global.app_event.on('mv_download_list_changed', handleUpdate);
    return () => {
      global.app_event.off('mv_download_list_changed', handleUpdate);
    };
  }, []);

  return tasks;
};
