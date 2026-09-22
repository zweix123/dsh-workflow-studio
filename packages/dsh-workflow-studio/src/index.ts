/** dsh host plugin root. Keep host assembly out of the browser entry. */
export { PLUGIN_NAME as name } from './shared/constants.js'
export { apply } from './host/apply.js'
export const inject = ['webServer']
// No user configuration is needed for the connection-check milestone.
export interface Config {}
