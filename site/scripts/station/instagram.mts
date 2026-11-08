// The Instagram API with Instagram Login (graph.instagram.com), for your own professional account: read recent media and
// comments, send a private reply (one DM to a commenter, within 7 days of the comment), refresh the long-lived token.
// Needs IG_ACCESS_TOKEN in station.env (station-install.mts --ig-token). STATION_IG_API_VERSION pins a version
// (e.g. v23.0); without it, calls go to the unversioned host and use the app's default version.
// Errors carry Meta's message, never the token.
import type { Env } from "./client.mts";

export type IgMedia = { id: string; permalink?: string; timestamp?: string };
export type IgComment = { id: string; text?: string; username?: string; timestamp?: string; from?: { username?: string } };

const base = (env: Env) => `https://graph.instagram.com${env.STATION_IG_API_VERSION ? `/${env.STATION_IG_API_VERSION}` : ""}`;

async function graph<T>(env: Env, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${base(env)}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${env.IG_ACCESS_TOKEN}`, ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number } } & T;
  if (!res.ok || data.error) {
    const msg = (data.error?.message ?? `HTTP ${res.status}`).replaceAll(env.IG_ACCESS_TOKEN ?? "\0", "<token>").slice(0, 160);
    throw Object.assign(new Error(`Instagram API: ${msg}`), { code: data.error?.code });
  }
  return data;
}

export async function recentMedia(env: Env, limit = 10): Promise<IgMedia[]> {
  return (await graph<{ data?: IgMedia[] }>(env, `/me/media?fields=id,permalink,timestamp&limit=${limit}`)).data ?? [];
}

export async function mediaComments(env: Env, mediaId: string, limit = 50): Promise<IgComment[]> {
  return (await graph<{ data?: IgComment[] }>(env, `/${encodeURIComponent(mediaId)}/comments?fields=id,text,timestamp,username,from&limit=${limit}`)).data ?? [];
}

/** Your professional account's Instagram ID and handle, as the API sees them (IG_USER_ID overrides the lookup). */
export async function me(env: Env): Promise<{ id: string; username?: string }> {
  const r = await graph<{ user_id?: string; id?: string; username?: string }>(env, "/me?fields=user_id,username");
  const id = env.IG_USER_ID ?? r.user_id ?? r.id;
  if (!id) throw new Error("Instagram API: no account id for this token");
  return { id, username: r.username };
}

/** One private reply to a comment: lands in the commenter's inbox (or Requests if they don't follow you). */
export async function sendPrivateReply(env: Env, igId: string, commentId: string, text: string) {
  return graph<{ recipient_id?: string; message_id?: string }>(env, `/${encodeURIComponent(igId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text } }),
  });
}

/** Swaps a long-lived token for a fresh one (60 more days). The old token must still be valid and over a day old. */
export async function refreshToken(env: Env): Promise<string> {
  const res = await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(env.IG_ACCESS_TOKEN ?? "")}`, { signal: AbortSignal.timeout(20_000) });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; error?: { message?: string } };
  if (!res.ok || !data.access_token) throw new Error(`token refresh: ${(data.error?.message ?? `HTTP ${res.status}`).slice(0, 120)}`);
  return data.access_token;
}
