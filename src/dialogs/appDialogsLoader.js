let appDialogsModulePromise = null;

export const loadAppDialogsModule = () => {
  if (!appDialogsModulePromise) {
    appDialogsModulePromise = import('./AppDialogs.jsx').catch((error) => {
      appDialogsModulePromise = null;
      throw error;
    });
  }

  return appDialogsModulePromise;
};
