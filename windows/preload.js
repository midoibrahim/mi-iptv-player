const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronDesktop', {
    toggleFullScreen: () => ipcRenderer.send('desktop-toggle-fullscreen'),
    setFullScreen: (flag) => ipcRenderer.send('desktop-set-fullscreen', flag),
    isFullScreen: () => ipcRenderer.invoke('desktop-is-fullscreen'),
    onFullScreenChange: (callback) => {
        ipcRenderer.on('desktop-fullscreen-changed', (_e, isFs) => {
            if (typeof callback === 'function') callback(isFs);
        });
    }
});

