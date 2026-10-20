import { supabase } from "@/integrations/supabase/client";

export type RpcError = { message: string; code?: string; hint?: string; details?: string };
export type RpcResult<T> = { data: T | null; error: RpcError | null };

/** Calls a database function that isn't in the generated types yet. Never throws. */
export async function callRpc<T = unknown>(fn: string, args: object = {}): Promise<RpcResult<T>> {
  try {
    const rpc = (supabase as unknown as { rpc: (f: string, a: object) => PromiseLike<RpcResult<T>> }).rpc.bind(supabase);
    return await Promise.resolve(rpc(fn, args));
  } catch (e) {
    return { data: null, error: { message: String(e) } };
  }
}
