/**
 * Preload — runs in an isolated context with access to a limited Node surface.
 * Kept minimal on purpose; expose only what the renderer genuinely needs.
 */
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('testpilotDesktop', {
  version: process.env.npm_package_version || '0.1.0',
  platform: process.platform,
  isDesktop: true,
});
