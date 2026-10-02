import { nodeRegistry } from '../contract/node/index.js'
import { sessionAgentClient } from '../../../dsh-workflow-node-session-agent/src/client.js'
import { bashClient } from '../../../dsh-workflow-node-bash/src/client.js'
import { formClient } from '../../../dsh-workflow-node-form/src/client.js'

export const clientNodes = nodeRegistry([sessionAgentClient, bashClient, formClient])
