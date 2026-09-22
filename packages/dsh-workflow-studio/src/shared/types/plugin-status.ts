/** The initial host/client protocol. DAG contracts will be added with the engine. */
export interface PluginStatus {
  plugin: string
  version: string
  status: 'ready'
  serverTime: string
}
