/*
 * 意图：管理黑白棋 AI 的 Web Worker 池。
 *
 * 主线程不能直接执行 4 秒搜索，否则浏览器界面会卡死。
 * 这个管理器固定创建约 90% CPU 数量的 Worker，把根节点合法步拆分给它们并行搜索，
 * 最后从所有 Worker 返回结果中选最高分。
 *
 * 注意：真正的搜索在 Rust/Wasm 中，Worker 只是加载 Wasm 并执行分配到的根节点。
 */

class OthelloAIManager {
    constructor(options = {}) {
        this.workerUrl = options.workerUrl || "./assets/js/ai-worker.js";
        this.thinkTimeMs = options.thinkTimeMs || 4000;
        const cores = navigator.hardwareConcurrency || 4;
        this.workerCount = Math.max(1, Math.ceil(cores * 0.9));
        this.workers = [];
        this.jobs = new Map();
        this.nextJobId = 1;

        for (let i = 0; i < this.workerCount; i++) {
            const worker = new Worker(this.workerUrl, { type: "module" });
            worker.onmessage = (event) => this.handleMessage(event);
            worker.onerror = (event) => this.handleError(event);
            this.workers.push(worker);
        }
    }

    ready() {
        /*
         * 初始化所有 Worker 的 Wasm 模块。
         *
         * 只有全部 Worker 都加载成功后，人机和机机模式才开始。
         * 这样可以避免第一步搜索时某个 Worker 尚未准备好导致结果缺失。
         */
        return Promise.all(this.workers.map((_, index) => this.call(index, {
            type: "init",
            wasmUrl: new URL("../wasm/othello_ai.js", import.meta.url).href
        })));
    }

    handleMessage(event) {
        /*
         * Worker 用 jobId 回传结果。
         *
         * 每个请求都对应一个 Promise，收到结果后立即从 jobs 中删除，
         * 避免长时间对局时累积无用引用。
         */
        const { jobId, ok, result, error } = event.data;
        const job = this.jobs.get(jobId);
        if (!job) return;
        this.jobs.delete(jobId);
        if (ok) {
            job.resolve(result);
        }
        else {
            job.reject(new Error(error || "AI worker failed"));
        }
    }

    handleError(event) {
        /*
         * 任一 Worker 出错时，当前等待中的搜索全部失败。
         *
         * 这是故意的：AI 搜索如果出现 Wasm 加载或执行错误，不应该静默降级为弱 AI，
         * 否则会让棋力问题很难排查。
         */
        for (const [, job] of this.jobs) {
            job.reject(new Error(event.message || "AI worker error"));
        }
        this.jobs.clear();
    }

    call(workerIndex, payload) {
        /*
         * 向指定 Worker 发送一次请求，并返回 Promise。
         *
         * workerIndex 会取模，调用方可以放心传入分片下标。
         */
        const jobId = this.nextJobId++;
        const worker = this.workers[workerIndex % this.workers.length];
        return new Promise((resolve, reject) => {
            this.jobs.set(jobId, { resolve, reject });
            worker.postMessage({ ...payload, jobId });
        });
    }

    findBestMove({ board, isBlackTurn, legalMoves }) {
        /*
         * 并行搜索入口。
         *
         * JS 先负责把二维棋盘压成 Int8Array，再把合法根节点按轮转方式分片。
         * Rust 侧会再次验证合法性，并在自己的分片中做 4 秒迭代加深。
         */
        if (!legalMoves.length) return Promise.resolve(null);

        const chunks = Array.from({ length: Math.min(this.workerCount, legalMoves.length) }, () => []);
        for (let i = 0; i < legalMoves.length; i++) {
            chunks[i % chunks.length].push(legalMoves[i]);
        }

        const cells = new Int8Array(64);
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                cells[r * 8 + c] = board[r][c];
            }
        }

        const startedAt = performance.now();
        const calls = chunks.map((moves, index) => {
            const encodedMoves = new Uint8Array(moves.length * 2);
            for (let i = 0; i < moves.length; i++) {
                encodedMoves[i * 2] = moves[i][0];
                encodedMoves[i * 2 + 1] = moves[i][1];
            }
            return this.call(index, {
                type: "search",
                cells,
                isBlackTurn,
                legalMoves: encodedMoves,
                thinkTimeMs: this.thinkTimeMs,
                startedAt
            });
        });

        return Promise.all(calls).then(results => {
            let best = null;
            let totalNodes = 0;
            let maxTimeMs = 0;
            let maxDepth = 0;
            for (const result of results) {
                if (result) {
                    totalNodes += result.nodes || 0;
                    maxTimeMs = Math.max(maxTimeMs, result.timeMs || 0);
                    maxDepth = Math.max(maxDepth, result.depth || 0);
                }
                if (!result || result.r < 0 || result.c < 0) continue;
                if (!best || result.score > best.score) best = result;
            }
            if (best) {
                best.nodes = totalNodes;
                best.timeMs = maxTimeMs;
                best.depth = Math.max(best.depth || 0, maxDepth);
                best.nps = maxTimeMs > 0 ? Math.round(totalNodes * 1000 / maxTimeMs) : totalNodes;
                best.workerCount = chunks.length;
            }
            return best;
        });
    }

    terminate() {
        /*
         * 释放 Worker。
         *
         * 当前页面没有显式重新开始按钮，但保留这个方法便于以后加新游戏/重启功能。
         */
        for (const worker of this.workers) worker.terminate();
        this.workers = [];
        this.jobs.clear();
    }
}

window.OthelloAIManager = OthelloAIManager;
