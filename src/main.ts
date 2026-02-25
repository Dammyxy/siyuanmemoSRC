import {
  Plugin,
} from "siyuan";
import { createApp } from 'vue'
import App from './App.vue'
import { createLogger } from '@/utils/logger';

const logger = createLogger('main');

let plugin = null
export function usePlugin(pluginProps?: Plugin): Plugin {
  logger.debug('usePlugin', pluginProps, plugin)
  if (pluginProps) {
    plugin = pluginProps
  }
  if (!plugin && !pluginProps) {
    logger.error('need bind plugin')
  }
  return plugin;
}


let app = null
export function init(plugin: Plugin) {
  // bind plugin hook
  usePlugin(plugin);

  const div = document.createElement('div')
  div.classList.toggle('plugin-siyuanmemo-app')
  div.id = this.name
  app = createApp(App)
  app.mount(div)
  document.body.appendChild(div)
}

export function destroy() {
  app.unmount()
  const div = document.getElementById(this.name)
  document.body.removeChild(div)
}
