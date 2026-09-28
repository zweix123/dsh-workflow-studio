import { nodeRegistry } from '../../contract/node/index.js'
import { bashNode } from '../../../../dsh-workflow-node-bash/src/server.js'
import { chatNode } from '../../../../dsh-workflow-node-chat/src/server.js'
import { formNode } from '../../../../dsh-workflow-node-form/src/server.js'

export const serverNodes = nodeRegistry([chatNode, bashNode, formNode])
