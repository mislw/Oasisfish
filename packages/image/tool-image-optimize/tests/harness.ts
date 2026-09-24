import type { Context } from '@deepseek-ai/cordis'
import { agentEvents, type Agent, type PreStepDecision } from '@deepseek-ai/dsh-agent'
import { AttachmentId, type ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ImageOptimizationRequest } from '@deepseek-ai/dsh-image-optimizer'
import { createUserMessage, ToolCallId, type MessageSource, type UserMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'

/** Return one durable image reference with stable fixture metadata. */
export function imageRef(id: string): ImageAttachmentRef {
  return { attachmentId: AttachmentId(id), mediaType: 'image/png', bytes: 4, width: 2, height: 2 }
}

/** Return one minimal Agent identity for event scoping and tool ownership. */
export function stubAgent(id: string, ctx: Context): Agent {
  const rejectInboxMutation = (): never => {
    throw new Error('image optimization test Agent does not support Inbox mutations')
  }
  const session = Session.create(SessionId(id))
  return {
    id: session.id,
    session,
    options: {},
    inbox: {
      nextTurn: [], nextStep: [], clear: rejectInboxMutation, append: rejectInboxMutation,
      prepend: rejectInboxMutation, replace: rejectInboxMutation, remove: rejectInboxMutation,
      splice: rejectInboxMutation,
    },
    status: 'idle',
    ctx,
    send() {}, followup() {}, steer() {},
    inject() {}, cancel() {}, runMaintenance: task => task(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
}

/** Return one user message carrying image attachments in the supplied order. */
export function imageMessage(refs: readonly ImageAttachmentRef[], source: MessageSource = { kind: 'user' }): UserMessage {
  return createUserMessage({ source, content: refs.map(attachment => ({ type: 'image' as const, attachment })) })
}

/** Run the scoped pre-step waterfall with an explicit downstream decision. */
export function emitPreStep(
  ctx: Context,
  agent: Agent,
  turn: number,
  step: number,
  messages: UserMessage[],
  next: () => Promise<PreStepDecision> = () => Promise.resolve({ kind: 'enter', messages }),
): Promise<PreStepDecision> {
  return agentEvents(ctx, agent).waterfall('agent/pre-step', {
    messages, turn, step, signal: new AbortController().signal,
  }, next)
}

/** Return a complete request with optional behavior-specific fields. */
export function request(overrides: Partial<ImageOptimizationRequest> = {}): ImageOptimizationRequest {
  return {
    operation: 'generate',
    intent: 'Create a launch graphic.',
    references: [],
    exactText: [],
    output: { transparentBackground: false, count: 1 },
    preserve: [],
    avoid: [],
    locale: 'en',
    styleHints: [],
    sceneHints: [],
    caseIds: [],
    ...overrides,
  }
}

/** Return the minimal direct execution context used by definition-level tests. */
export function execContext(agent: Agent | undefined, signal = new AbortController().signal): ToolRunContext {
  return {
    callId: ToolCallId('image-optimize-test'), rootCallId: ToolCallId('image-optimize-test'),
    name: 'image_optimize', arguments: {}, signal, token: Symbol('image-optimize-test') as never,
    ...agent === undefined ? {} : { agent },
    deferContext() {}, concludeTurn() {},
  }
}
