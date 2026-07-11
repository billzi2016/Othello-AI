/*
 * 意图：黑白棋页面主控制器。
 *
 * 这个文件负责 UI 初始化、菜单切换、棋盘状态、合法落子、翻子动画和游戏流程。
 * 真正耗时的 AI 搜索不在这里执行，而是通过 window.OthelloAIManager
 * 分发到 Web Worker 池，再由 Rust/Wasm 的 Bitboard 引擎完成。
 *
 * 维护边界：
 * - 规则相关的轻量逻辑保留在 JS，方便和 DOM 坐标一一对应。
 * - 搜索相关的重逻辑放在 Rust，避免旧版同步 minimax 卡住页面。
 * - 人机和机机模式都调用同一套 AI，确保棋力一致。
 */

function sgn(n){
    return n === 0 ? 0 : (n > 0 ? 1 : -1);
}

function sleep(d){
    return new Promise(r => setTimeout(r, d));
}

Object.defineProperty(Array.prototype, "copy", {
    value: function(){ return JSON.parse(JSON.stringify(this)); }
});

var G;

const ANIMATIONDURATION = 650;
const AI_THINK_TIME_MS = 4000;
const EMPTY = 0;
const WHITE = 1;
const BLACK = -1;
const BLACKFLIP = true;
const WHITEFLIP = false;
const SOURCE_HUMAN = "human";
const SOURCE_AI = "ai";
const defaultMAP = [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 1,-1, 0, 0, 0],
    [0, 0, 0,-1, 1, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0]
];

class Point{
    constructor(r, c){
        this.r = r;
        this.c = c;
    }
}

const Directions = [
    new Point(-1,-1),
    new Point(-1, 0),
    new Point(-1, 1),
    new Point( 0, 1),
    new Point( 1, 1),
    new Point( 1, 0),
    new Point( 1,-1),
    new Point( 0,-1)
];

function countTiles(state){
    let b = 0;
    let w = 0;
    for(let i = 0; i < 8; i++){
        for(let j = 0; j < 8; j++){
            if(state[i][j] === BLACK) b++;
            if(state[i][j] === WHITE) w++;
        }
    }
    return [b, w];
}

function inBoard(r, c){
    return 0 <= r && r < 8 && 0 <= c && c < 8;
}

function resetBoard(){
    for(let i = 0; i < 8; i++){
        for(let j = 0; j < 8; j++){
            $(`div#r${i}c${j}`).hide();
        }
    }

    const m = defaultMAP.copy();
    $(`div#r3c4`).flip(true).show();
    $(`div#r4c3`).flip(true).show();
    $(`div#r3c3`).flip(false).show();
    $(`div#r4c4`).flip(false).show();
    return m;
}

function getAvailable(m, bTurn){
    /*
     * 计算当前行动方所有合法落子。
     *
     * 旧版本会从多个方向重复 push 同一个格子，导致搜索重复扩展。
     * 这里使用 Set 去重，既修规则边界，也减少 Rust 根节点并行任务量。
     */
    const self = bTurn ? BLACK : WHITE;
    const opponent = bTurn ? WHITE : BLACK;
    const seen = new Set();
    const available = [];

    for(let i = 0; i < 8; i++){
        for(let j = 0; j < 8; j++){
            if(m[i][j] !== self) continue;

            for(let d = 0; d < Directions.length; d++){
                let step = 1;
                let foundOpponent = false;

                while(true){
                    const x = i + Directions[d].r * step;
                    const y = j + Directions[d].c * step;
                    if(!inBoard(x, y)) break;

                    if(m[x][y] === EMPTY){
                        if(foundOpponent){
                            const key = `${x},${y}`;
                            if(!seen.has(key)){
                                seen.add(key);
                                available.push([x, y]);
                            }
                        }
                        break;
                    }

                    if(m[x][y] === opponent){
                        foundOpponent = true;
                    }
                    else if(m[x][y] === self){
                        break;
                    }
                    step++;
                }
            }
        }
    }

    return available;
}

function collectFlips(current, p, bTurn){
    /*
     * 收集某一步会翻转的全部棋子。
     *
     * 注意：这个函数不修改棋盘，只返回坐标列表；真正更新棋盘和动画
     * 由 takeStep 统一完成，避免 UI 状态和逻辑状态分叉。
     */
    const self = bTurn ? BLACK : WHITE;
    const opponent = bTurn ? WHITE : BLACK;
    const flipping = [];

    for(let d = 0; d < Directions.length; d++){
        let steps = 1;
        let foundOpponent = false;

        while(true){
            const x = p.r + Directions[d].r * steps;
            const y = p.c + Directions[d].c * steps;
            if(!inBoard(x, y)) break;

            if(current[x][y] === self){
                if(foundOpponent){
                    for(let step = 1; step < steps; step++){
                        flipping.push([
                            p.r + Directions[d].r * step,
                            p.c + Directions[d].c * step
                        ]);
                    }
                }
                break;
            }

            if(current[x][y] === opponent){
                foundOpponent = true;
            }
            else if(current[x][y] === EMPTY){
                break;
            }
            steps++;
        }
    }

    return flipping;
}

function takeStep(current, p, bTurn){
    /*
     * 执行一步真实落子，并同步播放翻子动画。
     *
     * Rust AI 只负责选择坐标；最终仍由这里执行落子，这样人人、人机、
     * 机机模式共享同一套规则和动画路径。
     */
    const self = bTurn ? BLACK : WHITE;
    const f = bTurn ? BLACKFLIP : WHITEFLIP;
    const m = current.copy();
    const flipping = collectFlips(current, p, bTurn);
    const speed = ANIMATIONDURATION / Math.max(1, flipping.length + 1);

    $(`#r${p.r}c${p.c}`).flip(f).show();
    m[p.r][p.c] = self;

    for(let i = 0; i < flipping.length; i++){
        const r = flipping[i][0];
        const c = flipping[i][1];
        $(`#r${r}c${c}`).flip({ speed });
        $(`#r${r}c${c}`).flip(f);
        m[r][c] = self;
    }
    return m;
}

function isGameOver(state){
    /*
     * 黑白棋终局条件：双方都没有合法步。
     *
     * 原代码使用数组相加再和 0 弱比较，空数组时只是碰巧成立。
     * 这里改成明确比较 length，避免隐式类型转换造成维护风险。
     */
    return getAvailable(state, true).length === 0 &&
        getAvailable(state, false).length === 0;
}

class Board{
    constructor(){
        this.n = 0;
        this.m = resetBoard();
        this.bTurn = true;
    }

    updateDisplay(){
        this.countResult();
        $("#black-counter > span").text(`${this.blackTiles}`.padStart(2, "0"));
        $("#white-counter > span").text(`${this.whiteTiles}`.padStart(2, "0"));
    }

    takeStep(p){
        /*
         * Board 层会再次验证合法性。
         *
         * 这可以防止 UI 误点、Worker 返回过期结果或调试时手动调用非法落子
         * 破坏棋盘状态。
         */
        if(!p || this.m[p.r][p.c] !== EMPTY) return false;
        const legal = getAvailable(this.m, this.bTurn)
            .some(move => move[0] === p.r && move[1] === p.c);
        if(!legal) return false;

        this.m = takeStep(this.m, p, this.bTurn);
        if(getAvailable(this.m, !this.bTurn).length !== 0){
            this.bTurn = !this.bTurn;
        }
        this.n++;
        this.updateDisplay();
        return true;
    }

    drawAvailable(){
        const am = this.getAvailable();
        for(let i = 0; i < am.length; i++){
            $(`#r${am[i][0]} > #c${am[i][1]} > .tile-highlight`).css("display", "unset");
        }
    }

    getAvailable(){
        return getAvailable(this.m, this.bTurn);
    }

    passIfNeeded(){
        /*
         * 标准黑白棋 pass 规则。
         *
         * 如果当前行动方没有合法步，但对手有合法步，本回合必须跳过。
         * 原流程只在落子后切换回合；进入一个“当前方无棋可下”的回合时，
         * 会出现无人可点、AI 返回 null、最后阶段看起来没下完的问题。
         */
        if(this.getAvailable().length !== 0 || isGameOver(this.m)){
            return false;
        }
        this.bTurn = !this.bTurn;
        this.n++;
        return true;
    }

    countResult(){
        const r = countTiles(this.m);
        this.blackTiles = r[0];
        this.whiteTiles = r[1];
        return (this.whiteTiles * WHITE) + (this.blackTiles * BLACK);
    }
}

class Game{
    constructor(isBlackAI, isWhiteAI){
        this.ai = null;
        this.stopped = false;
        this.reset(isBlackAI, isWhiteAI);
    }

    reset(isBlackAI, isWhiteAI){
        this.isBlackAI = isBlackAI;
        this.isWhiteAI = isWhiteAI;
        this.board = new Board();
        this.board.updateDisplay();
        this.clearOnClick();

        sleep(ANIMATIONDURATION / 2).then(async () => {
            try{
                await this.ensureAI();
                if(this.isBlackAI && this.isWhiteAI){
                    await this.EVEStart();
                }
                else if(!this.isBlackAI && !this.isWhiteAI){
                    await this.PVPStart();
                }
                else{
                    await this.PVEStart();
                }
            }
            catch(err){
                console.error(err);
                alert(`AI 初始化失败：${err.message || err}`);
            }
        });
    }

    async ensureAI(){
        /*
         * 懒加载 AI 管理器。
         *
         * 本机双人不需要 AI，所以不创建 Worker；人机/机机第一次启动时才创建。
         * 页面必须通过 HTTP 服务访问，Worker 和 Wasm 不能可靠地从 file:// 加载。
         */
        if(this.ai || (!this.isBlackAI && !this.isWhiteAI)) return;
        if(!window.OthelloAIManager){
            throw new Error("没有加载 AI 管理器，请通过本地 HTTP 服务打开页面。");
        }
        this.ai = new window.OthelloAIManager({
            workerUrl: "./assets/js/ai-worker.js",
            thinkTimeMs: AI_THINK_TIME_MS
        });
        await this.ai.ready();
    }

    clearOnClick(){
        for(let i = 0; i < 8; i++){
            for(let j = 0; j < 8; j++){
                $(`#r${i} > #c${j}`).prop("onclick", null).off("click");
            }
        }
        $(`.tile-highlight`).removeClass("ai-thinking").css("display", "none");
    }

    GameOver(r){
        const s = sgn(r);
        let m = "";
        switch(s){
            case 0:
                m = "平局";
                break;
            case 1:
                m = `白棋获胜，领先 ${r} 子`;
                break;
            case -1:
                m = `黑棋获胜，领先 ${-r} 子`;
                break;
        }
        this.clearOnClick();
        $("#game-summary-text").text(`${m}。你可以保留棋盘复盘，或再来一局。`);
        $("#game-summary").removeClass("hide");
    }

    async getAIMove(){
        /*
         * 从 Worker 池获取 AI 落子。
         *
         * think time 固定为 AI_THINK_TIME_MS，Worker 数量由 ai-manager 固定为
         * navigator.hardwareConcurrency 的约 90%。这里不做搜索，只处理返回值兜底。
         */
        await this.ensureAI();
        const available = this.board.getAvailable();
        if(available.length === 0) return null;
        const result = await this.ai.findBestMove({
            board: this.board.m,
            isBlackTurn: this.board.bTurn,
            legalMoves: available
        });
        if(!result || result.r < 0 || result.c < 0){
            return {
                point: new Point(available[0][0], available[0][1]),
                stats: null
            };
        }
        return {
            point: new Point(result.r, result.c),
            stats: result
        };
    }

    drawAvailableForAI(){
        /*
         * AI 思考时也显示它的合法点，使用黄色提示。
         *
         * 这只是观察辅助，不绑定点击事件；真正落子仍由 Rust/Wasm 搜索返回。
         */
        const am = this.board.getAvailable();
        for(let i = 0; i < am.length; i++){
            $(`#r${am[i][0]} > #c${am[i][1]} > .tile-highlight`)
                .addClass("ai-thinking")
                .css("display", "unset");
        }
    }

    bindHumanMoves(){
        /*
         * 绑定当前回合人类可点击的位置。
         *
         * 每次棋盘变化后都会清理旧 click handler，再绑定新合法点，
         * 避免旧回合的点击事件残留。
         */
        this.clearOnClick();
        const game = this;
        const am = this.board.getAvailable();
        for(let i = 0; i < am.length; i++){
            $(`#r${am[i][0]} > #c${am[i][1]}`).on("click", function(){
                const point = new Point(am[i][0], am[i][1]);
                const isBlackTurn = game.board.bTurn;
                game.board.takeStep(point);
                recordMoveStats({
                    isBlackTurn,
                    point,
                    source: SOURCE_HUMAN
                });
                game.clearOnClick();
            });
            $(`#r${am[i][0]} > #c${am[i][1]} > .tile-highlight`).css("display", "unset");
        }
    }

    async PVPStart(){
        let tmpN = undefined;
        while(!isGameOver(this.board.m) && !this.stopped){
            if(this.board.passIfNeeded()){
                recordPassStats(!this.board.bTurn);
                tmpN = undefined;
                continue;
            }
            if(tmpN !== this.board.n){
                tmpN = this.board.n;
                this.bindHumanMoves();
            }
            else{
                await sleep(120);
            }
        }
        this.GameOver(this.board.countResult());
    }

    async PVEStart(){
        /*
         * 人机流程：当前颜色是 AI 就等待 AI 返回，否则绑定人类点击。
         *
         * 这里是异步循环，AI 搜索发生在 Worker，不会阻塞棋盘动画和浏览器主线程。
         */
        let tmpN = undefined;
        while(!isGameOver(this.board.m) && !this.stopped){
            if(this.board.passIfNeeded()){
                recordPassStats(!this.board.bTurn);
                tmpN = undefined;
                continue;
            }
            const aiTurn = (this.isBlackAI && this.board.bTurn) ||
                (this.isWhiteAI && !this.board.bTurn);

            if(aiTurn){
                this.clearOnClick();
                this.drawAvailableForAI();
                await sleep(120);
                const result = await this.getAIMove();
                const move = result ? result.point : null;
                if(move){
                    const isBlackTurn = this.board.bTurn;
                    this.board.takeStep(move);
                    recordMoveStats({
                        isBlackTurn,
                        point: move,
                        source: SOURCE_AI,
                        stats: result.stats
                    });
                }
                await sleep(ANIMATIONDURATION);
            }
            else if(tmpN !== this.board.n){
                tmpN = this.board.n;
                this.bindHumanMoves();
            }
            else{
                await sleep(120);
            }
        }
        this.GameOver(this.board.countResult());
    }

    async EVEStart(){
        /*
         * 机机对战流程：黑白双方都调用同一套 Rust/Wasm AI。
         *
         * 这个模式替代原来未实现的“远端连线”，用于观察 AI 自博弈和调试棋力。
        */
        while(!isGameOver(this.board.m) && !this.stopped){
            if(this.board.passIfNeeded()){
                recordPassStats(!this.board.bTurn);
                await sleep(ANIMATIONDURATION);
                continue;
            }
            this.clearOnClick();
            this.drawAvailableForAI();
            const result = await this.getAIMove();
            const move = result ? result.point : null;
            if(move){
                const isBlackTurn = this.board.bTurn;
                this.board.takeStep(move);
                recordMoveStats({
                    isBlackTurn,
                    point: move,
                    source: SOURCE_AI,
                    stats: result.stats
                });
            }
            await sleep(ANIMATIONDURATION);
        }
        this.GameOver(this.board.countResult());
    }
}

let moveStatIndex = 0;

function resetMoveStats(){
    /*
     * 新对局开始时清空右侧统计表。
     *
     * 复盘阶段不会自动清空；只有用户真正选择新模式开始下一局时才重置。
     */
    moveStatIndex = 0;
    $("#ai-stats-body").html(`
        <tr id="ai-stats-empty">
            <td colspan="9">开始对局后显示搜索记录</td>
        </tr>
    `);
    $("#ai-current").text("等待对局开始。");
}

function recordMoveStats({ isBlackTurn, point, source, stats = null }){
    /*
     * 记录一步落子。
     *
     * human 行只展示落子；AI 行展示 Rust/Wasm 返回的搜索深度、节点数、
     * NPS、耗时和 Minimax 分数。这里显示的是搜索评分，不是棋子数量差。
     */
    moveStatIndex++;
    $("#ai-stats-empty").remove();

    const side = isBlackTurn ? "黑" : "白";
    const sourceText = source === SOURCE_AI ? "AI" : "人类";
    const sourceClass = source === SOURCE_AI ? "source-ai" : "source-human";
    const pos = `${point.r},${point.c}`;
    const depth = stats ? stats.depth : "-";
    const nodes = stats ? formatCount(stats.nodes) : "-";
    const nps = stats ? formatCount(stats.nps) : "-";
    const time = stats ? `${formatNumber(stats.timeMs)}ms` : "-";
    const score = stats ? formatScore(stats.score) : "-";
    const scoreClass = stats ? scoreClassName(stats.score) : "score-neutral";

    $("#ai-stats-body").append(`
        <tr>
            <td>#${moveStatIndex}</td>
            <td>${side}</td>
            <td class="${sourceClass}">${sourceText}</td>
            <td>${pos}</td>
            <td>${depth}</td>
            <td>${nodes}</td>
            <td>${nps}</td>
            <td>${time}</td>
            <td class="${scoreClass}">${score}</td>
        </tr>
    `);

    $("#ai-current").text(
        source === SOURCE_AI
            ? `#${moveStatIndex} ${side}棋 AI 落子 ${pos}，深度 ${depth}，评分 ${score}，耗时 ${time}。`
            : `#${moveStatIndex} ${side}棋 人类落子 ${pos}。`
    );

    const wrap = document.getElementById("ai-table-wrap");
    if(wrap){
        wrap.scrollTop = wrap.scrollHeight;
    }
}

function recordPassStats(isBlackTurn){
    /*
     * 记录标准 pass。
     *
     * pass 不是落子，但它是黑白棋规则的一部分；写进评分表可以解释
     * 为什么最后阶段棋盘还有空格却进入了另一方回合或直接结束。
     */
    moveStatIndex++;
    $("#ai-stats-empty").remove();

    const side = isBlackTurn ? "黑" : "白";
    $("#ai-stats-body").append(`
        <tr>
            <td>#${moveStatIndex}</td>
            <td>${side}</td>
            <td class="score-neutral">Pass</td>
            <td>-</td>
            <td>-</td>
            <td>-</td>
            <td>-</td>
            <td>-</td>
            <td class="score-neutral">无合法步</td>
        </tr>
    `);
    $("#ai-current").text(`#${moveStatIndex} ${side}棋无合法落子，按规则跳过回合。`);

    const wrap = document.getElementById("ai-table-wrap");
    if(wrap){
        wrap.scrollTop = wrap.scrollHeight;
    }
}

function formatCount(value){
    if(value === undefined || value === null || Number.isNaN(value)) return "-";
    if(value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if(value >= 1000) return `${(value / 1000).toFixed(1)}k`;
    return `${value}`;
}

function formatNumber(value){
    if(value === undefined || value === null || Number.isNaN(value)) return "-";
    return `${Math.round(value)}`;
}

function formatScore(value){
    if(value === undefined || value === null || Number.isNaN(value)) return "-";
    return value > 0 ? `+${value}` : `${value}`;
}

function scoreClassName(value){
    if(value > 0) return "score-positive";
    if(value < 0) return "score-negative";
    return "score-neutral";
}

window.onload = function(){
    for(let i = 0; i < 8; i++){
        for(let j = 0; j < 8; j++){
            $(`#r${i} > #c${j}`).append(`
                <div class="tile-highlight" style></div>
                <div id="r${i}c${j}" class="tile">
                    <div class="tile-front front"></div>
                    <div class="tile-back back"></div>
                </div>
            `);
            $(`div#r${i}c${j}`).flip({ trigger: null }).hide();
        }
    }

    $("#board-options").show();
    $(".board-option-type").hide();
    $("#board-options > #menu").show();

    function hideGameSummary(){
        $("#game-summary").addClass("hide");
        $("#game-summary-text").text("");
    }

    function startGame(isBlackAI, isWhiteAI){
        hideGameSummary();
        resetMoveStats();
        $("#board-options").hide();
        $(".board-option-type").hide();
        if(G && G.ai){
            G.ai.terminate();
        }
        if(G){
            G.stopped = true;
        }
        G = new Game(isBlackAI, isWhiteAI);
    }

    $("#startbtn").on("click", function(){
        $(".board-option-type").hide();
        $("#board-options > #menu-mode").show();
    });

    $("#helpbtn").on("click", function(){
        alert("黑白棋游戏说明\n【简介】\n黑白棋又叫反棋（Reversi）、奥赛罗棋（Othello）。游戏通过相互翻转对方的棋子，最后以棋盘上谁的棋子多来判断胜负。\n【规则】\n1. 黑方先行，双方交替下棋。\n2. 新落下的棋子与棋盘上已有的同色棋子之间，对方被夹住的所有棋子都要翻转。\n3. 新落下的棋子必须翻转对手一个或多个棋子，否则不能落子。\n4. 如果一方没有合法棋步，则跳过该回合，由对手继续落子。\n5. 如果一方至少有一步合法棋步可下，就必须落子。\n6. 当棋盘填满或者双方都无合法棋步可下时，游戏结束，棋子更多的一方获胜。");
    });

    $("#pvpbtn").on("click", function(){
        startGame(false, false);
    });

    $("#pvebtn").on("click", function(){
        $(".board-option-type").hide();
        $("#board-options > #menu-mode-pve").show();
    });

    $("#evebtn").on("click", function(){
        startGame(true, true);
    });

    $("#pfbtn").on("click", function(){
        startGame(false, true);
    });

    $("#efbtn").on("click", function(){
        startGame(true, false);
    });

    $(".returnbtn").on("click", function(){
        $("#board-options").show();
        $(".board-option-type").hide();
        $("#board-options > #menu").show();
    });

    $("#restartbtn").on("click", function(){
        hideGameSummary();
        if(G && G.ai){
            G.ai.terminate();
        }
        if(G){
            G.stopped = true;
        }
        $("#board-options").show();
        $(".board-option-type").hide();
        $("#board-options > #menu-mode").show();
    });
};
