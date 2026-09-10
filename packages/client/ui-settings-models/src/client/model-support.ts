/**
 * Whether a model id can serve ordinary text conversation requests.
 * @param model - Provider-specific model id.
 * @returns False for explicit `gpt-image-*` image-only routes; otherwise true.
 */
export function supportsTextConversation(model: string): boolean {
  return !/(?:^|[\]/])gpt-image(?:-|$)/iu.test(model)
}
