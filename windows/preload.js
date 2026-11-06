const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronDesktop', {
    toggleFullScreen: () => ipcRenderer.send('desktop-toggle-fullscreen'),
    setFullScreen: (flag) => ipcRenderer.send('desktop-set-fullscreen', flag),
    isFullScreen: () => ipcRenderer.invoke('desktop-is-fullscreen'),
    onFullScreenChange: (callback) => {
        ipcRenderer.on('desktop-fullscreen-changed', (_e, isFs) => {
            if (typeof callback === 'function') callback(isFs);
        });
    },
    // Downloads API for Windows Desktop
    downloads: {
        getAll: () => ipcRenderer.invoke('downloads-get-all'),
        getSettings: () => ipcRenderer.invoke('downloads-get-settings'),
        updateSettings: (s) => ipcRenderer.invoke('downloads-update-settings', s),
        selectDirectory: () => ipcRenderer.invoke('downloads-select-directory'),
        openFolder: (dir) => ipcRenderer.invoke('downloads-open-folder', dir),
        showInFolder: (file) => ipcRenderer.invoke('downloads-show-in-folder', file),
        openFile: (file) => ipcRenderer.invoke('downloads-open-file', file),
        start: (item, opts) => ipcRenderer.invoke('downloads-start', item, opts),
        pause: (id) => ipcRenderer.invoke('downloads-pause', id),
        resume: (id) => ipcRenderer.invoke('downloads-resume', id),
        cancel: (id) => ipcRenderer.invoke('downloads-cancel', id),
        deleteFile: (id) => ipcRenderer.invoke('downloads-delete', id),
        clearHistory: () => ipcRenderer.invoke('downloads-clear-history'),
        convertToMp4: (id) => ipcRenderer.invoke('downloads-convert-to-mp4', id),
        onStarted: (cb) => ipcRenderer.on('download-started', (_e, d) => cb && cb(d)),
        onProgress: (cb) => ipcRenderer.on('download-progress', (_e, d) => cb && cb(d)),
        onCompleted: (cb) => ipcRenderer.on('download-completed', (_e, d) => cb && cb(d)),
        onFailed: (cb) => ipcRenderer.on('download-failed', (_e, d) => cb && cb(d)),
        onPaused: (cb) => ipcRenderer.on('download-paused', (_e, d) => cb && cb(d)),
        onResumed: (cb) => ipcRenderer.on('download-resumed', (_e, d) => cb && cb(d)),
        onCancelled: (cb) => ipcRenderer.on('download-cancelled', (_e, d) => cb && cb(d)),
        onHistoryUpdated: (cb) => ipcRenderer.on('download-history-updated', (_e, d) => cb && cb(d))
    }
});
