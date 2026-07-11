/* tslint:disable */
/* eslint-disable */

/**
 * JS 调用入口。
 *
 * 参数说明：
 * - `cells`：长度 64 的棋盘数组，-1 黑棋、1 白棋、0 空格。
 * - `is_black_turn`：当前是否黑棋行动。
 * - `think_time_ms`：这一组根节点最多搜索多久。
 * - `allowed_moves`：JS 分配给当前 Worker 的根节点候选点，按 `[r,c,r,c,...]` 编码。
 *
 * 返回值用简单 CSV 字符串避免引入额外序列化依赖：`row,col,score,depth`。
 */
export function search_best_move(cells: Int8Array, is_black_turn: boolean, think_time_ms: number, allowed_moves: Uint8Array): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly search_best_move: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
