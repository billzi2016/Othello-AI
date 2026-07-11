/*
 * 意图：黑白棋页面主控制器。
 *
 * 这个文件负责 UI 初始化、菜单切换、棋盘状态、合法落子、翻子动画和游戏流程。
 * 真正耗时的 AI 搜索不在这里执行，而是通过 window.OthelloAIManager
 * 分发到 Web Worker 池，再由 Rust/Wasm 的 bitboard 引擎完成。
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
const AI_THINK_TIME_MS = 5000;
const EMPTY = 0;
const WHITE = 1;
const BLACK = -1;
const BLACKFLIP = true;
const WHITEFLIP = false;
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
        $(`.tile-highlight`).css("display", "none");
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
        alert(m);
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
            return new Point(available[0][0], available[0][1]);
        }
        return new Point(result.r, result.c);
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
                game.board.takeStep(new Point(am[i][0], am[i][1]));
                game.clearOnClick();
            });
            $(`#r${am[i][0]} > #c${am[i][1]} > .tile-highlight`).css("display", "unset");
        }
    }

    async PVPStart(){
        let tmpN = undefined;
        while(!isGameOver(this.board.m) && !this.stopped){
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
            const aiTurn = (this.isBlackAI && this.board.bTurn) ||
                (this.isWhiteAI && !this.board.bTurn);

            if(aiTurn){
                this.clearOnClick();
                await sleep(120);
                const move = await this.getAIMove();
                if(move) this.board.takeStep(move);
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
            this.clearOnClick();
            const move = await this.getAIMove();
            if(move) this.board.takeStep(move);
            await sleep(ANIMATIONDURATION);
        }
        this.GameOver(this.board.countResult());
    }
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

    $("#startbtn").on("click", function(){
        $(".board-option-type").hide();
        $("#board-options > #menu-mode").show();
    });

    $("#helpbtn").on("click", function(){
        alert("黑白棋游戏说明\n【简介】\n黑白棋又叫反棋（Reversi）、奥赛罗棋（Othello）。游戏通过相互翻转对方的棋子，最后以棋盘上谁的棋子多来判断胜负。\n【规则】\n1. 黑方先行，双方交替下棋。\n2. 新落下的棋子与棋盘上已有的同色棋子之间，对方被夹住的所有棋子都要翻转。\n3. 新落下的棋子必须翻转对手一个或多个棋子，否则不能落子。\n4. 如果一方没有合法棋步，则跳过该回合，由对手继续落子。\n5. 如果一方至少有一步合法棋步可下，就必须落子。\n6. 当棋盘填满或者双方都无合法棋步可下时，游戏结束，棋子更多的一方获胜。");
    });

    $("#pvpbtn").on("click", function(){
        $("#board-options").hide();
        $(".board-option-type").hide();
        G = new Game(false, false);
    });

    $("#pvebtn").on("click", function(){
        $(".board-option-type").hide();
        $("#board-options > #menu-mode-pve").show();
    });

    $("#evebtn").on("click", function(){
        $("#board-options").hide();
        $(".board-option-type").hide();
        G = new Game(true, true);
    });

    $("#pfbtn").on("click", function(){
        $("#board-options").hide();
        $(".board-option-type").hide();
        G = new Game(false, true);
    });

    $("#efbtn").on("click", function(){
        $("#board-options").hide();
        $(".board-option-type").hide();
        G = new Game(true, false);
    });

    $(".returnbtn").on("click", function(){
        $("#board-options").show();
        $(".board-option-type").hide();
        $("#board-options > #menu").show();
    });
};
