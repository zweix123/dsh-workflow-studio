import { nodeRegistry } from '../contract/node/index.js'
import { chatClient } from '../../../dsh-workflow-node-chat/src/client.js'
import { bashClient } from '../../../dsh-workflow-node-bash/src/client.js'
import { formClient } from '../../../dsh-workflow-node-form/src/client.js'

export const clientNodes = nodeRegistry([chatClient, bashClient, formClient])
