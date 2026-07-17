function sgn(n){
    return n==0? 0 : ( n>0? 1 : -1 );
}

function sleep(d){
    return new Promise(r=>setTimeout(r, d));
}

Object.defineProperty(Array.prototype, 'copy', {
    value: function(){return JSON.parse(JSON.stringify(this))}
});

var G;





// -----------------------------------------------------
// Constants.js
// -----------------------------------------------------
const ANIMATIONDURATION = 2000;
const INF = 10000000;
const DEPTH = 4;
const EMPTY =  0;
const WHITE =  1;
const BLACK = -1;
const BLACKFLIP = true;
const WHITEFLIP = false;
const defaultMAP = [
    [ 0, 0, 0, 0, 0, 0, 0, 0],
    [ 0, 0, 0, 0, 0, 0, 0, 0],
    [ 0, 0, 0, 0, 0, 0, 0, 0],
    [ 0, 0, 0, 1,-1, 0, 0, 0],
    [ 0, 0, 0,-1, 1, 0, 0, 0],
    [ 0, 0, 0, 0, 0, 0, 0, 0],
    [ 0, 0, 0, 0, 0, 0, 0, 0],
    [ 0, 0, 0, 0, 0, 0, 0, 0]
];

const BoardWeightMultiplier = 4;
const BoardWeight = [
    [ 64, -32, 16,  8,  8, 16, -32, 64],
    [-32, -16, -8,  1,  1, -8, -16,-32],
    [ 16,  -8,  4,  2,  2,  4,  -8, 16],
    [  8,   1,  2,  1,  1,  2,   1,  8],
    [  8,   1,  2,  1,  1,  2,   1,  8],
    [ 16,  -8,  4,  2,  2,  4,  -8, 16],
    [-32, -16, -8,  1,  1, -8, -16,-32],
    [ 64, -32, 16,  8,  8, 16, -32, 64]
];

class Point{
    constructor(r, c){
        this.r = r;
        this.c = c;
    }
};
const Corners = [
    [
        new Point( 0, 0),
        new Point( 0, 1),
        new Point( 1, 0),
        new Point( 1, 1),
        new Point( 0, 1),
        new Point( 1, 0)
    ],[
        new Point( 0, 7),
        new Point( 0, 6),
        new Point( 1, 7),
        new Point( 1, 6),
        new Point( 0,-1),
        new Point( 1, 0)
    ],[
        new Point( 7, 0),
        new Point( 7, 1),
        new Point( 6, 0),
        new Point( 6, 1),
        new Point( 0, 1),
        new Point(-1, 0)
    ],[
        new Point( 7, 7),
        new Point( 7, 6),
        new Point( 6, 7),
        new Point( 6, 6),
        new Point( 0,-1),
        new Point(-1, 0)
    ]
];
const Directions = [
    new Point(-1,-1),
    new Point(-1, 0),
    new Point(-1, 1),
    new Point( 0, 1),
    new Point( 1, 1),
    new Point( 1, 0),
    new Point( 1,-1),
    new Point( 0,-1),
];

const Weight = [ 10, 401, 382, 74, 78, 802, 100 ];





// -----------------------------------------------------
// Board.js
// -----------------------------------------------------
function countTiles(state){
    let b=0, w=0;
    for(let i=0; i<8; i++){
        for(let j=0; j<8; j++){
            switch( state[i][j] ){
                case BLACK:
                    b++;
                    break;
                case WHITE:
                    w++;
                    break;
            }
        }
    }
    return [b, w];
}

function inBoard(r, c){
    return 0<=r && r<8 && 0<=c && c<8;
}

function resetBoard(){
    for(let i=0; i<8; i++){
        for(let j=0; j<8; j++){
            $(`div#r${i}c${j}`).hide();
        }
    }
    let m = defaultMAP.copy();
    $(`div#r3c4`).flip(true).show();
    $(`div#r4c3`).flip(true).show();
    $(`div#r3c3`).flip(false).show();
    $(`div#r4c4`).flip(false).show();
    return m;
}

function getAvailable(m, bTurn){
    a = bTurn?BLACK:WHITE;
    b = bTurn?WHITE:BLACK;
    ava = [];

    for(let i=0; i<8; i++){
        for(let j=0; j<8; j++){
            if( m[i][j] != a ) continue;

            for(let d=0; d<8; d++){
                step = 1;
                findOp = false;
                while(true){
                    x = i + Directions[d].r*step;
                    y = j + Directions[d].c*step;

                    if( !inBoard(x, y) ) break;

                    if( m[x][y] == EMPTY ){
                        if( findOp ){
                            ava.push([x, y]);
                        }
                        break;
                    }
                    else if( m[x][y] == b ){
                        findOp = true;
                    }
                    else if( m[x][y] == a ){
                        break;
                    }
                    step++;
                }
            }
        }
    }
    ava.sort((a, b)=>(Math.random()-0.5));
    return ava;
}

function takeStep(current, p, bTurn){
    a = bTurn?BLACK:WHITE;
    b = bTurn?WHITE:BLACK;
    f = bTurn?BLACKFLIP:WHITEFLIP;
    m = current.copy();
    flipping = [];
    for(let d=0; d<8; d++){
        steps = 1;
        flag = false;
        findOp = false;
        while(true){
            x = p.r + Directions[d].r*steps;
            y = p.c + Directions[d].c*steps;

            if( !inBoard(x, y) ) break;

            if( m[x][y] == a ){
                flag = findOp;
                break;
            }
            else if( m[x][y] == b ){
                findOp = true;
            }
            else if( m[x][y] == EMPTY ){
                flag = false;
                break;
            }
            steps++;
        }
        if( flag ){
            for(let step=1; step<steps; step++){
                flipping.push(
                    [
                        p.r + Directions[d].r*step, 
                        p.c + Directions[d].c*step
                    ]
                );
            }
        }
    }

    sd = ANIMATIONDURATION/(flipping.length+1);
    $(`#r${p.r}c${p.c}`).flip(f).show();
    console.log(`a: ${a}, b: ${b}`);
    m[p.r][p.c] = a;
    for(let i=0; i<flipping.length; i++){
        r = flipping[i][0];
        c = flipping[i][1];
        $(`#r${r}c${c}`).flip({speed:sd});
        $(`#r${r}c${c}`).flip(f);
        m[r][c] = a;
    }
    return m;
}

function simStep(current, p, bTurn){
    a = bTurn?BLACK:WHITE;
    b = bTurn?WHITE:BLACK;
    m = current.copy();
    flipping = [];
    for(let d=0; d<8; d++){
        steps = 1;
        flag = false;
        findOp = false;
        while(true){
            x = p.r + Directions[d].r*steps;
            y = p.c + Directions[d].c*steps;

            if( !inBoard(x, y) ) break;

            if( m[x][y] == a ){
                flag = findOp;
                break;
            }
            else if( m[x][y] == b ){
                findOp = true;
            }
            else if( m[x][y] == EMPTY ){
                flag = false;
                break;
            }
            steps++;
        }
        if( flag ){
            for(let step=1; step<steps; step++){
                flipping.push(
                    [
                        p.r + Directions[d].r*step, 
                        p.c + Directions[d].c*step
                    ]
                );
            }
        }
    }

    m[p.r][p.c] = a;
    for(let i=0; i<flipping.length; i++){
        m[ flipping[i][0] ][ flipping[i][1] ] = a;
    }
    return m;
}

function isGameOver(state){
    return (getAvailable(state, true) + getAvailable(state, false))==0;
}

function evaluation(m, bTurn){
    a = bTurn?BLACK:WHITE;
    b = bTurn?WHITE:BLACK;
    cornerScore = 0;
    stabilityScore = 0;
    innerScore = 0;
    mobilityScore = 0;
    countermobilityScore = 0;
    tileScore = 0;
    boardScore = 0;


    let aTiles = 0, bTiles = 0;
    for (let i=0; i<8; i++) {
        for (let j=0; j<8; j++) {
            boardScore += BoardWeight[i][j] * BoardWeightMultiplier * m[i][j] * a;
            aTiles += (m[i][j] == a);
            bTiles += (m[i][j] == b);
        }
    }
    if (aTiles > bTiles) {
        tileScore = (100 * aTiles) / (aTiles + bTiles);
    }
    else if (aTiles < bTiles) {
        tileScore = -(100 * bTiles) / (aTiles + bTiles);
    }
    else {
        tileScore = 0;
    }


    uk = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for(let i=0; i<4; i++){
        s  = Corners[i][0];
        s1 = Corners[i][1];
        s2 = Corners[i][2];
        s3 = Corners[i][3];

        if( m[s.r][s.c]==EMPTY ){
            cornerScore += m[s1.r][s1.c] * a * -3;
            cornerScore += m[s2.r][s2.c] * a * -3;
            cornerScore += m[s3.r][s3.c] * a * -6;
            continue;
        }
        cornerScore += m[s.r][s.c] * a * 15;

        stabilityScore += m[s.r][s.c] * a;
        for(let j=0; j<2; j++){
            v = Corners[i][j + 4];
            if(uk[((s.r + v.r) * 8 + (s.c + v.c)) % 12]) continue;
            let eb = 1, tmp = 0, k = 1;
            for(k=1; k<7; k++){
                let t = m[s.r + v.r*k][s.c + v.c*k];
                if( t==EMPTY ){
                    break;
                }
                else if( eb && t==m[s.r][s.c] ){
                    stabilityScore += t * a;
                }
                else{
                    eb = false;
                    tmp += t * a;
                }
            }
            if( k==7 && m[s.r + v.r*k][s.c + v.c*k]!=EMPTY ){
                stabilityScore += tmp;
                uk[((s.r + v.r*6) * 8 + (s.c + v.c*6)) % 12] = 1;
            }
        }
    }


    for(let i=1; i<7; i++){
        for(let j=1; j<8; j++){
            if( m[i][j]==EMPTY ) continue;
            for(let d=0; d<8; d++){
                if( m[i + Directions[d].r][j + Directions[d].c]==EMPTY ){
                    innerScore -= m[i][j];
                    break;
                }
            }
        }
    }


    mobilityScore = getAvailable(m, bTurn).length;
    countermobilityScore = -getAvailable(m, !bTurn).length;


    let score = (
        tileScore * Weight[0]
    ) + (
        cornerScore * Weight[1]
    ) + (
        stabilityScore * Weight[2]
    ) + (
        innerScore * Weight[3]
    ) + (
        mobilityScore * Weight[4]
    ) + (
        countermobilityScore * Weight[5]
    ) + (
        boardScore * Weight[6]
    );
    return Math.round(score*0.01);
}

function minimax(state, depth, alpha, beta, bTurn, mm){
    // Evaluate every leaf from the root player's perspective, not the side to move.
    const maximizingTurn = mm ? bTurn : !bTurn;
    if( isGameOver(state) || depth==0 ){
        return evaluation(state, maximizingTurn);
    }

    let availableMoves = getAvailable(state, bTurn);
    if( availableMoves.length==0 ){
        // A non-terminal position with no legal move is a forced pass.
        // Keep the board unchanged and continue with the opponent's turn.
        return minimax(state, depth-1, alpha, beta, !bTurn, !mm);
    }
    if( mm ){
        let best = -INF;
        for(let i=0; i<availableMoves.length; i++){
            let mp = new Point(availableMoves[i][0], availableMoves[i][1]);
            let ns = simStep(state, mp, bTurn);

            let value = minimax(ns, depth-1, alpha, beta, !bTurn, !mm);

            best = Math.max(best, value);
            alpha = Math.max(alpha, best);

            if( alpha >= beta ) break;
        }
        return best;
    }
    else{
        let best = INF;
        for(let i=0; i<availableMoves.length; i++){
            let mp = new Point(availableMoves[i][0], availableMoves[i][1]);
            let ns = simStep(state, mp, bTurn);

            let value = minimax(ns, depth-1, alpha, beta, !bTurn, !mm);

            best = Math.min(best, value);
            beta = Math.min(beta, best);

            if( alpha >= beta ) break;
        }
        return best;
    }
}

function findBestMove(state, bTurn){
    let bestValue = -INF;
    let alpha = -INF;
    let beta = INF;
    let bestMove = null;

    let availableMoves = getAvailable(state, bTurn);
    for(let i=0; i<availableMoves.length; i++){
        let mp = new Point(availableMoves[i][0], availableMoves[i][1]);
        let ns = simStep(state, mp, bTurn);

        if( !bestMove ) bestMove = mp;

        let value = minimax(ns, DEPTH-1, alpha, beta, !bTurn, false);

        if( value > bestValue ){
            bestValue = value;
            bestMove = mp;
        }

        alpha = Math.max(alpha, bestValue);
        if( alpha >= beta ) break;
    }

    console.log(`Move ${bestMove.r} ${bestMove.c} with heuristic of ${bestValue}`);
    return bestMove;
}

function sim(board){
    resetBoard();

    function ts(){
        setTimeout(
            function(){
                board.takeStep(board.getBestMove());
                if( !isGameOver(board.m) ) ts();
                else console.log("GameOver: ", board.countResult());
            }, 1000
        )
    }
    ts();
}

class Board{
    constructor(){
        // var
        this.n = 0;
        this.m = resetBoard();
        this.bTurn = true;
    };

    resetBoard(){
        this.m = resetBoard();
        this.n = 0;
    }

    getBestMove(){
        return findBestMove(this.m, this.bTurn);
    };

    updateDisplay(){
        this.countResult();
        $("#black-counter > span").text(
            `${this.blackTiles}`.padStart(2, "0")
        );
        $("#white-counter > span").text(
            `${this.whiteTiles}`.padStart(2, "0")
        );
    };

    takeStep(p){
        if( this.m[p.r][p.c]!=EMPTY ) return;
        this.m = takeStep(this.m, p, this.bTurn);
        if( getAvailable(this.m, !this.bTurn).length!=0 ) this.bTurn = !this.bTurn;
        this.getAvailable();
        this.n++;
        this.updateDisplay();
    };

    drawAvailable(){
        let am = this.getAvailable();
        for(let i=0; i<am.length; i++){
            $(`#r${am[i][0]} > #c${am[i][1]} > .tile-highlight`).css("display", "unset");
        }
    };

    getAvailable(){
        return getAvailable(this.m, this.bTurn);
    };

    countResult(){
        let r = countTiles(this.m);
        this.blackTiles = r[0];
        this.whiteTiles = r[1];
        return (this.whiteTiles*WHITE) + (this.blackTiles*BLACK);
    };
}





// -----------------------------------------------------
// Game.js
// -----------------------------------------------------
class Game{
    constructor(isBlackAI, isWhiteAI){
        this.reset(isBlackAI, isWhiteAI);
    };

    reset(isBlackAI, isWhiteAI){
        this.isBlackAI = isBlackAI;
        this.isWhiteAI = isWhiteAI;

        this.board = new Board();

        this.board.updateDisplay();
        this.clearOnClick();
        sleep(ANIMATIONDURATION/2).then(()=>{
            if( this.isBlackAI && this.isWhiteAI ){
                this.EVEStart();
            }
            else if( !this.isBlackAI && !this.isWhiteAI ){
                this.PVPStart();
            }
            else{
                this.PVEStart();
            }
        });
    }

    clearOnClick(){
        for(let i=0; i<8; i++){
            for(let j=0; j<8; j++){
                $(`#r${i} > #c${j}`).prop("onclick", null).off("click");
            }
        }
        $(`.tile-highlight`).css("display", "none");
    }

    GameOver(r){
        let s = sgn(r);
        let m = ``;
        switch(s){
            case 0:
                m = "Tie";
                break;
            case 1:
                m = `White Won ${r} tiles`;
                break;
            case -1:
                m = `Black Won ${-r} tiles`;
                break;
        }
        alert(m);
    }


    async PVPStart(){
        let tmpN = undefined;
        while( !isGameOver(this.board.m) ){
            if( tmpN!=this.board.n ){
                this.clearOnClick();
                tmpN = this.board.n;
                let game = this;
                let am = this.board.getAvailable();
                for(let i=0; i<am.length; i++){
                    $(`#r${am[i][0]} > #c${am[i][1]}`).on("click", function(){
                        game.clearOnClick();
                        game.board.takeStep( new Point(am[i][0], am[i][1]) );
                    });
                    $(`#r${am[i][0]} > #c${am[i][1]} > .tile-highlight`).css("display", "unset");
                }
            }
            else{
                await sleep(1000);
            }
        }
        this.GameOver(this.board.countResult());
    }

    async PVEStart(){
        if( this.isBlackAI ){
            await sleep(ANIMATIONDURATION);
            this.board.takeStep(this.board.getBestMove());
        }
        let tmpN = undefined;
        while( !isGameOver(this.board.m) ){
            if( (this.isBlackAI && this.board.bTurn) || (this.isWhiteAI && !this.board.bTurn) ){
                await sleep(ANIMATIONDURATION);
                this.board.takeStep(this.board.getBestMove());
            }
            else{
                if( tmpN!=this.board.n ){
                    tmpN = this.board.n;
                    let game = this;
                    let am = this.board.getAvailable();
                    for(let i=0; i<am.length; i++){
                        $(`#r${am[i][0]} > #c${am[i][1]}`).on("click", function(){
                            game.board.takeStep( new Point(am[i][0], am[i][1]) );
                            game.clearOnClick();
                        });
                        $(`#r${am[i][0]} > #c${am[i][1]} > .tile-highlight`).css("display", "unset");
                    }
                }
                else{
                    await sleep(1000);
                    console.log("wait");
                }
            }
        }
        this.GameOver(this.board.countResult());
    }

    async EVEStart(){
        while( !isGameOver(this.board.m) ){
            while( (this.isBlackAI && this.board.bTurn) || (this.isWhiteAI && !this.board.bTurn) ){
                if( isGameOver(this.board.m) ) break;
                this.board.takeStep(this.board.getBestMove());
                await sleep(ANIMATIONDURATION);
            }
        }
        await sleep(ANIMATIONDURATION);
        this.GameOver(this.board.countResult());
    }
};





// -----------------------------------------------------
// main
// -----------------------------------------------------
window.onload = function(){
    for(let i=0; i<8; i++){
        for(let j=0; j<8; j++){
            $(`#r${i} > #c${j}`).append(
                `
                <div class="tile-highlight" style></div>
                <div id="r${i}c${j}" class="tile">
                    <div class="tile-front front"></div>
                    <div class="tile-back back"></div>
                </div>
                `
            );
            $(`div#r${i}c${j}`).flip({
                trigger:null
            }).hide();
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
        alert("黑白棋遊戲說明\n【簡介】\n黑白棋又叫反棋(Reversi)、奧賽羅棋(Othello)、蘋果棋或翻轉棋。遊戲通過相互翻轉對方的棋子，最後以棋盤上誰的棋子多來判斷勝負。\n【規則】\n1．黑方先行，雙方交替下棋。\n2．新落下的棋子與棋盤上已有的同色棋子間，對方被夾住的所有棋子都要翻轉過來。可以是橫著夾，豎著夾，或是斜著夾。夾住的位置上必須全部是對手的棋子，不能有空格。\n3．新落下的棋子必須翻轉對手一個或多個棋子，否則就不能落子。\n4．如果一方沒有合法棋步，也就是說不管他下到哪裡，都不能至少翻轉對手的一個棋子，那他這一輪只能棄權，而由他的對手繼續落子直到他有合法棋步可下。\n5．如果一方至少有一步合法棋步可下，他就必須落子，不得棄權。\n6．當棋盤填滿或者雙方都無合法棋步可下時，遊戲結束。結束時誰的棋子最多誰就是贏家。")
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
    $("#onlinebtn").on("click", function(){
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

