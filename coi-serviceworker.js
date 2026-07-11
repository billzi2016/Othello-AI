/*
 * 意图：在 GitHub Pages 这类静态托管环境中启用 crossOriginIsolated。
 *
 * 浏览器里的 SharedArrayBuffer / Wasm 多线程需要页面具备 COOP/COEP 响应头。
 * GitHub Pages 不能直接配置服务端响应头，所以这里用 Service Worker 拦截同源资源，
 * 在响应上补充 Cross-Origin-Opener-Policy 和 Cross-Origin-Embedder-Policy。
 *
 * 这个文件必须尽早在 index.html 中加载；首次访问时 Service Worker 注册完成后，
 * 页面会自动刷新一次，让后续资源从 Service Worker 控制下重新加载。
 */

const COOP = "same-origin";
const COEP = "require-corp";

if (typeof window === "undefined") {
    /*
     * Service Worker 运行时分支。
     *
     * install/activate 立即接管页面，fetch 阶段复制原响应并附加隔离响应头。
     * 对跨域 no-cors 响应不强行改写，避免破坏浏览器安全模型。
     */
    self.addEventListener("install", () => self.skipWaiting());

    self.addEventListener("activate", (event) => {
        event.waitUntil(self.clients.claim());
    });

    self.addEventListener("fetch", (event) => {
        if (event.request.cache === "only-if-cached" && event.request.mode !== "same-origin") {
            return;
        }

        event.respondWith((async () => {
            const response = await fetch(event.request);
            const headers = new Headers(response.headers);
            headers.set("Cross-Origin-Opener-Policy", COOP);
            headers.set("Cross-Origin-Embedder-Policy", COEP);

            return new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers
            });
        })());
    });
} else {
    /*
     * 页面运行时分支。
     *
     * 如果当前页面还没被 Service Worker 控制，注册后刷新一次。
     * 如果已经处于 crossOriginIsolated，则不做额外动作。
     */
    (async () => {
        if (!("serviceWorker" in navigator)) return;
        if (window.crossOriginIsolated) return;

        const registration = await navigator.serviceWorker.register("./coi-serviceworker.js");
        if (!navigator.serviceWorker.controller) {
            await navigator.serviceWorker.ready;
            window.location.reload();
            return;
        }

        registration.update();
    })().catch((error) => {
        console.warn("COI Service Worker 注册失败：", error);
    });
}
