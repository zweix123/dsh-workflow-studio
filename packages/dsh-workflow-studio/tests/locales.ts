import { zh as studioZh, en as studioEn } from '../src/client/locales/index.js'
import { zh as bashZh, en as bashEn } from '../../dsh-workflow-node-bash/src/locales.js'
import { zh as sessionagentZh, en as sessionagentEn } from '../../dsh-workflow-node-session-agent/src/locales.js'
import { zh as formZh, en as formEn } from '../../dsh-workflow-node-form/src/locales.js'
export const zh = { ...studioZh, ...bashZh, ...sessionagentZh, ...formZh }
export const en = { ...studioEn, ...bashEn, ...sessionagentEn, ...formEn }
