# 浏览器运行环境

AI 搜索在浏览器本地执行，不需要后端接口。这个设计让 GitHub Pages 这种静态托管也能运行项目，但浏览器环境必须满足几个条件。

## HTTP 服务

Web Worker、ES module、Wasm 和 Service Worker 都要求稳定的资源来源。`file://` 不是正常站点来源，所以本地开发要使用 `server.py` 提供的 HTTP 地址。

输入是浏览器请求的静态文件。输出是页面、脚本、样式和 Wasm 模块。正常结果是浏览器控制台没有模块加载错误，AI 模式可以启动 Worker。

## Web Worker

主线程负责界面。如果直接在主线程搜索 4 秒，棋盘动画和点击响应会卡住。项目把搜索交给多个 Worker，每个 Worker 只处理自己分到的根节点候选步。

正常结果是 AI 思考时页面仍然能刷新状态，右侧说明会显示当前 AI 正在搜索。

## 跨源隔离

`coi-serviceworker.js` 会为同源资源补充 COOP 和 COEP 响应头。当前并行方式不依赖 Wasm pthread，但跨源隔离让静态托管环境更接近真实生产配置，也为以后使用 `SharedArrayBuffer` 留出空间。

如果 Service Worker 首次注册后刷新页面，这是正常现象。刷新后页面由 Service Worker 控制，资源响应头会带上跨源隔离相关字段。
