import { nodeRegistry } from '../../contract/node/index.js'
import { bashNode } from '../../../../dsh-workflow-node-bash/src/server.js'
import { sessionAgentNode } from '../../../../dsh-workflow-node-session-agent/src/server.js'
import { formNode } from '../../../../dsh-workflow-node-form/src/server.js'

export const serverNodes = nodeRegistry([sessionAgentNode, bashNode, formNode])
