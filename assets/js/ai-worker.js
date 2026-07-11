/*
 * 意图：单个 AI Worker 的执行入口。
 *
 * Worker 不碰 DOM，只做两件事：
 * 1. 加载 wasm-pack 生成的 Rust/Wasm 模块。
 * 2. 接收主线程分配的根节点候选步，调用 Rust 搜索并返回最佳结果。
 *
 * 这种拆分能让 UI 线程保持流畅，也方便 ai-manager 用约 90% CPU 并行跑多个 Worker。
 */

let wasmReady = null;
let searchBestMove = null;

async function initWasm(wasmUrl) {
    /*
     * 懒加载 Wasm。
     *
     * 同一个 Worker 生命周期内只初始化一次，后续搜索复用 search_best_move 导出函数。
     */
    if (wasmReady) return wasmReady;
    wasmReady = import(wasmUrl).then(async (mod) => {
        await mod.default();
        searchBestMove = mod.search_best_move;
    });
    return wasmReady;
}

self.onmessage = async (event) => {
    /*
     * 消息协议：
     * - init：加载 Wasm 模块。
     * - search：执行一次分片根节点搜索。
     *
     * 返回值始终带 jobId，让 ai-manager 能把异步结果匹配回原 Promise。
     */
    const { jobId, type } = event.data;
    try {
        if (type === "init") {
            await initWasm(event.data.wasmUrl);
            self.postMessage({ jobId, ok: true, result: true });
            return;
        }

        if (type === "search") {
            if (!searchBestMove) {
                throw new Error("Wasm AI has not been initialized");
            }
            const result = searchBestMove(
                event.data.cells,
                event.data.isBlackTurn,
                event.data.thinkTimeMs,
                event.data.legalMoves
            );
            const parts = result.split(",").map(Number);
            self.postMessage({
                jobId,
                ok: true,
                result: {
                    r: parts[0],
                    c: parts[1],
                    score: parts[2],
                    depth: parts[3]
                }
            });
            return;
        }

        throw new Error(`Unknown worker message type: ${type}`);
    }
    catch (err) {
        self.postMessage({
            jobId,
            ok: false,
            error: err.message || String(err)
        });
    }
};
