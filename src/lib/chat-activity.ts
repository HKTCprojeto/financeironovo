/**
 * Tracks whether the chat has an active SSE stream in progress.
 * Used by the auth guard to avoid auto-logout while a long stream
 * is in flight (token refresh races with stream completion).
 */
let activeStreams = 0;

export function beginChatStream() {
  activeStreams += 1;
}

export function endChatStream() {
  activeStreams = Math.max(0, activeStreams - 1);
}

export function hasActiveChatStream(): boolean {
  return activeStreams > 0;
}
