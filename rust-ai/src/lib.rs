//! Rust/Wasm 黑白棋 AI 核心。
//!
//! 这个文件只负责“算棋”，不负责 DOM、动画或菜单。
//! 前端会把 8x8 棋盘压成 64 个 i8 传进来，本模块再转换成两个 u64 位棋盘：
//! 一个表示黑棋占位，一个表示白棋占位。搜索时用位运算维护局面，
//! 并通过 Alpha-Beta 剪枝、走法排序和迭代加深，在 5 秒预算内尽量搜索更深。

use std::collections::HashMap;
use wasm_bindgen::prelude::*;

const BLACK: i8 = -1;
const WHITE: i8 = 1;
const INF: i32 = 1_000_000_000;
const MAX_DEPTH: u8 = 64;
const MAX_PLY: usize = 64;
const TT_EXACT: u8 = 0;
const TT_LOWER: u8 = 1;
const TT_UPPER: u8 = 2;

const DIRECTIONS: [(i8, i8); 8] = [
    (-1, -1),
    (-1, 0),
    (-1, 1),
    (0, 1),
    (1, 1),
    (1, 0),
    (1, -1),
    (0, -1),
];

// 黑白棋里角极其重要，角旁边的 X/C 位在角未占时通常很危险。
// 这个静态权重不是唯一评估来源，但能让搜索在浅层时也有基本棋感。
const SQUARE_WEIGHTS: [i32; 64] = [
    120, -40, 20, 5, 5, 20, -40, 120,
    -40, -80, -5, -5, -5, -5, -80, -40,
    20, -5, 15, 3, 3, 15, -5, 20,
    5, -5, 3, 3, 3, 3, -5, 5,
    5, -5, 3, 3, 3, 3, -5, 5,
    20, -5, 15, 3, 3, 15, -5, 20,
    -40, -80, -5, -5, -5, -5, -80, -40,
    120, -40, 20, 5, 5, 20, -40, 120,
];

/// 一个完整局面，使用两个 u64 保存黑棋和白棋。
///
/// bit 位置定义为 `row * 8 + col`。这样 JS、Rust 和 UI 坐标保持一致，
/// 排查问题时不用来回转换棋盘朝向。
#[derive(Clone, Copy)]
struct Board {
    black: u64,
    white: u64,
}

/// 单步搜索结果。`score` 永远站在根节点 AI 的视角：
/// 分数越大，表示这步对当前 AI 越好。
#[derive(Clone, Copy)]
struct MoveScore {
    index: u8,
    score: i32,
    depth: u8,
}

/// 置换表条目。
///
/// 同一个局面可能通过不同落子顺序到达。置换表记录已经搜索过的局面，
/// 后续遇到时可以直接复用分数或收紧 alpha/beta 窗口。
#[derive(Clone, Copy)]
struct TTEntry {
    depth: u8,
    score: i32,
    flag: u8,
    best_move: u8,
}

/// 搜索上下文，保存时间预算和根节点颜色。
///
/// `deadline_ms` 使用浏览器/JS 时间源。不要在 wasm32-unknown-unknown 中使用
/// `std::time::Instant`，它在浏览器 Wasm 环境中可能 panic。
struct SearchCtx {
    deadline_ms: f64,
    root_black: bool,
    timed_out: bool,
    tt: HashMap<u128, TTEntry>,
    killers: [[u8; 2]; MAX_PLY + 1],
    history: [i32; 64],
}

/// JS 调用入口。
///
/// 参数说明：
/// - `cells`：长度 64 的棋盘数组，-1 黑棋、1 白棋、0 空格。
/// - `is_black_turn`：当前是否黑棋行动。
/// - `think_time_ms`：这一组根节点最多搜索多久。
/// - `allowed_moves`：JS 分配给当前 Worker 的根节点候选点，按 `[r,c,r,c,...]` 编码。
///
/// 返回值用简单 CSV 字符串避免引入额外序列化依赖：`row,col,score,depth`。
#[wasm_bindgen]
pub fn search_best_move(
    cells: &[i8],
    is_black_turn: bool,
    think_time_ms: u32,
    allowed_moves: &[u8],
) -> String {
    let board = board_from_cells(cells);
    let root_moves = decode_allowed_moves(allowed_moves, board, is_black_turn);
    if root_moves.is_empty() {
        return "-1,-1,0,0".to_string();
    }

    // 给 JS 消息传递和动画留一点余量，避免刚好压线造成体感卡顿。
    let budget = think_time_ms.saturating_sub(30).max(50);
    let mut ctx = SearchCtx {
        deadline_ms: now_ms() + budget as f64,
        root_black: is_black_turn,
        timed_out: false,
        tt: HashMap::with_capacity(262_144),
        killers: [[u8::MAX; 2]; MAX_PLY + 1],
        history: [0; 64],
    };

    let mut best = MoveScore {
        index: root_moves[0],
        score: -INF,
        depth: 0,
    };

    // 迭代加深：浅层结果先可用，时间允许再继续加深。
    for depth in 1..=MAX_DEPTH {
        let mut depth_best = best;
        let mut alpha = -INF;
        let beta = INF;
        let ordered = order_moves(board, is_black_turn, &root_moves, is_black_turn, None, [u8::MAX; 2], &ctx.history);

        for mv in ordered {
            if ctx.expired() {
                break;
            }
            let next = apply_move(board, mv, is_black_turn);
            let score = -negamax(next, depth.saturating_sub(1), -beta, -alpha, !is_black_turn, 1, &mut ctx);

            if ctx.timed_out {
                break;
            }
            if score > depth_best.score || depth_best.depth < depth {
                depth_best = MoveScore { index: mv, score, depth };
            }
            alpha = alpha.max(score);
        }

        if ctx.timed_out {
            break;
        }
        best = depth_best;

        // 黑白棋最多 64 手，超过剩余空格没有意义。
        if depth >= empty_count(board) {
            break;
        }
    }

    format!("{},{},{},{}", best.index / 8, best.index % 8, best.score, best.depth)
}

impl SearchCtx {
    /// 高频超时检查。用独立方法是为了让递归主逻辑更容易读。
    fn expired(&mut self) -> bool {
        if now_ms() >= self.deadline_ms {
            self.timed_out = true;
            true
        } else {
            false
        }
    }
}

/// NegaMax 写法的 Alpha-Beta 搜索。
///
/// 相比传统 max/min 两套分支，NegaMax 用“换边取负”统一逻辑，
/// 代码更短，也更不容易出现原项目里最小化分支更新错变量的问题。
fn negamax(
    board: Board,
    depth: u8,
    mut alpha: i32,
    beta: i32,
    black_turn: bool,
    ply: usize,
    ctx: &mut SearchCtx,
) -> i32 {
    if ctx.expired() {
        return evaluate(board, ctx.root_black);
    }

    let alpha_original = alpha;
    let tt_key = tt_key(board, black_turn);
    let mut tt_best = None;
    if let Some(entry) = ctx.tt.get(&tt_key).copied() {
        tt_best = Some(entry.best_move);
        if entry.depth >= depth {
            match entry.flag {
                TT_EXACT => return entry.score,
                TT_LOWER => alpha = alpha.max(entry.score),
                TT_UPPER => {
                    if entry.score <= alpha {
                        return entry.score;
                    }
                }
                _ => {}
            }
            if alpha >= beta {
                return entry.score;
            }
        }
    }

    let moves = legal_moves(board, black_turn);
    let opponent_moves = legal_moves(board, !black_turn);

    // 双方都无棋可走才是真正终局；单方无棋可走必须 pass。
    if moves.is_empty() && opponent_moves.is_empty() {
        let score = terminal_score(board, ctx.root_black);
        return if black_turn == ctx.root_black { score } else { -score };
    }
    if depth == 0 {
        return relative_score(board, black_turn, ctx.root_black);
    }
    if moves.is_empty() {
        return -negamax(board, depth - 1, -beta, -alpha, !black_turn, ply + 1, ctx);
    }

    let mut best = -INF;
    let mut best_move = moves[0];
    let killer_pair = if ply <= MAX_PLY { ctx.killers[ply] } else { [u8::MAX; 2] };
    let ordered = order_moves(board, black_turn, &moves, ctx.root_black, tt_best, killer_pair, &ctx.history);
    for mv in ordered {
        let next = apply_move(board, mv, black_turn);
        let score = -negamax(next, depth - 1, -beta, -alpha, !black_turn, ply + 1, ctx);
        if ctx.timed_out {
            return best.max(evaluate(board, ctx.root_black));
        }
        if score > best {
            best = score;
            best_move = mv;
        }
        alpha = alpha.max(score);
        if alpha >= beta {
            remember_cutoff(ctx, ply, mv, depth);
            break;
        }
    }

    let flag = if best <= alpha_original {
        TT_UPPER
    } else if best >= beta {
        TT_LOWER
    } else {
        TT_EXACT
    };
    ctx.tt.insert(tt_key, TTEntry { depth, score: best, flag, best_move });
    best
}

/// 将 JS 的 64 格数组转换为两个位棋盘。
fn board_from_cells(cells: &[i8]) -> Board {
    let mut black = 0u64;
    let mut white = 0u64;
    for i in 0..cells.len().min(64) {
        let bit = 1u64 << i;
        if cells[i] == BLACK {
            black |= bit;
        } else if cells[i] == WHITE {
            white |= bit;
        }
    }
    Board { black, white }
}

/// 解码 JS 分配给当前 Worker 的根节点，并再次验证合法性。
///
/// 再验证一次是为了避免 UI 层状态异常时 Rust 搜索崩掉。
fn decode_allowed_moves(encoded: &[u8], board: Board, black_turn: bool) -> Vec<u8> {
    let legal = legal_moves(board, black_turn);
    let mut out = Vec::new();
    for pair in encoded.chunks_exact(2) {
        if pair[0] < 8 && pair[1] < 8 {
            let idx = pair[0] * 8 + pair[1];
            if legal.contains(&idx) && !out.contains(&idx) {
                out.push(idx);
            }
        }
    }
    out
}

/// 生成当前颜色的所有合法走法。
fn legal_moves(board: Board, black_turn: bool) -> Vec<u8> {
    let occupied = board.black | board.white;
    let mut moves = Vec::new();
    for idx in 0..64u8 {
        if occupied & bit(idx) != 0 {
            continue;
        }
        if flips_for_move(board, idx, black_turn) != 0 {
            moves.push(idx);
        }
    }
    moves
}

/// 执行一步棋，并返回新局面。
fn apply_move(board: Board, idx: u8, black_turn: bool) -> Board {
    let flips = flips_for_move(board, idx, black_turn);
    let move_bit = bit(idx);
    if black_turn {
        Board {
            black: board.black | flips | move_bit,
            white: board.white & !flips,
        }
    } else {
        Board {
            black: board.black & !flips,
            white: board.white | flips | move_bit,
        }
    }
}

/// 计算某一步会翻转哪些棋子，返回翻转棋子的 bit mask。
fn flips_for_move(board: Board, idx: u8, black_turn: bool) -> u64 {
    let own = if black_turn { board.black } else { board.white };
    let opp = if black_turn { board.white } else { board.black };
    let occupied = own | opp;
    if occupied & bit(idx) != 0 {
        return 0;
    }

    let row = (idx / 8) as i8;
    let col = (idx % 8) as i8;
    let mut flips = 0u64;

    for (dr, dc) in DIRECTIONS {
        let mut r = row + dr;
        let mut c = col + dc;
        let mut line = 0u64;
        let mut seen_opponent = false;

        while in_board(r, c) {
            let b = bit((r as u8) * 8 + c as u8);
            if opp & b != 0 {
                seen_opponent = true;
                line |= b;
            } else if own & b != 0 {
                if seen_opponent {
                    flips |= line;
                }
                break;
            } else {
                break;
            }
            r += dr;
            c += dc;
        }
    }

    flips
}

/// 走法排序是 Alpha-Beta 的关键优化点。
///
/// 好走法越早搜索，越容易触发剪枝；这里优先角、翻子收益、位置权重和后续机动性。
fn order_moves(
    board: Board,
    black_turn: bool,
    moves: &[u8],
    root_black: bool,
    tt_best: Option<u8>,
    killers: [u8; 2],
    history: &[i32; 64],
) -> Vec<u8> {
    let mut ordered = moves.to_vec();
    ordered.sort_by(|&a, &b| {
        let sa = move_order_score(board, black_turn, a, root_black, tt_best, killers, history);
        let sb = move_order_score(board, black_turn, b, root_black, tt_best, killers, history);
        sb.cmp(&sa)
    });
    ordered
}

/// 单步排序评分，只用于排列搜索顺序，不等同于完整局面评估。
fn move_order_score(
    board: Board,
    black_turn: bool,
    mv: u8,
    root_black: bool,
    tt_best: Option<u8>,
    killers: [u8; 2],
    history: &[i32; 64],
) -> i32 {
    let next = apply_move(board, mv, black_turn);
    let flips = flips_for_move(board, mv, black_turn).count_ones() as i32;
    let corner_bonus = if is_corner(mv) { 10_000 } else { 0 };
    let mobility = legal_moves(next, !black_turn).len() as i32;
    let perspective = if black_turn == root_black { 1 } else { -1 };
    let tt_bonus = if tt_best == Some(mv) { 200_000 } else { 0 };
    let killer_bonus = if killers[0] == mv { 80_000 } else if killers[1] == mv { 40_000 } else { 0 };
    tt_bonus
        + killer_bonus
        + history[mv as usize]
        + corner_bonus
        + SQUARE_WEIGHTS[mv as usize] * 20
        + flips * 35
        - perspective * mobility * 6
}

/// 当前局面的绝对评分，站在 `root_black` 视角。
fn evaluate(board: Board, root_black: bool) -> i32 {
    let my = if root_black { board.black } else { board.white };
    let opp = if root_black { board.white } else { board.black };

    let material = (my.count_ones() as i32 - opp.count_ones() as i32) * 12;
    let positional = positional_score(board, root_black);
    let mobility = (legal_moves(board, root_black).len() as i32
        - legal_moves(board, !root_black).len() as i32) * 90;
    let corners = corner_score(board, root_black) * 800;
    let frontier = frontier_score(board, root_black) * 18;
    let parity = parity_score(board, root_black) * 55;
    let danger = corner_danger_score(board, root_black) * 220;
    let stable_edges = stable_edge_score(board, root_black) * 140;

    positional + mobility + corners - frontier + material + parity - danger + stable_edges
}

/// 将绝对评分转换成“当前行动方”的相对评分，配合 NegaMax 使用。
fn relative_score(board: Board, black_turn: bool, root_black: bool) -> i32 {
    let score = evaluate(board, root_black);
    if black_turn == root_black { score } else { -score }
}

/// 终局评分必须强烈偏向真实胜负，避免 AI 为了位置分牺牲最终子数。
fn terminal_score(board: Board, root_black: bool) -> i32 {
    let my = if root_black { board.black } else { board.white };
    let opp = if root_black { board.white } else { board.black };
    let diff = my.count_ones() as i32 - opp.count_ones() as i32;
    diff.signum() * 10_000_000 + diff * 10_000
}

/// 位置权重评分。
fn positional_score(board: Board, root_black: bool) -> i32 {
    let mut score = 0;
    for idx in 0..64u8 {
        let b = bit(idx);
        if board.black & b != 0 {
            score += if root_black { SQUARE_WEIGHTS[idx as usize] } else { -SQUARE_WEIGHTS[idx as usize] };
        } else if board.white & b != 0 {
            score += if root_black { -SQUARE_WEIGHTS[idx as usize] } else { SQUARE_WEIGHTS[idx as usize] };
        }
    }
    score * 10
}

/// 角占有评分。角是稳定棋，权重单独拉高。
fn corner_score(board: Board, root_black: bool) -> i32 {
    let corners = [0u8, 7, 56, 63];
    let mut score = 0;
    for idx in corners {
        let b = bit(idx);
        if board.black & b != 0 {
            score += if root_black { 1 } else { -1 };
        } else if board.white & b != 0 {
            score += if root_black { -1 } else { 1 };
        }
    }
    score
}

/// 前沿子越多越容易被翻，通常是不稳定因素。
fn frontier_score(board: Board, root_black: bool) -> i32 {
    let occupied = board.black | board.white;
    let mut score = 0;
    for idx in 0..64u8 {
        let b = bit(idx);
        if occupied & b == 0 {
            continue;
        }
        if touches_empty(board, idx) {
            if board.black & b != 0 {
                score += if root_black { 1 } else { -1 };
            } else {
                score += if root_black { -1 } else { 1 };
            }
        }
    }
    score
}

/// 奇偶性评估。
///
/// 黑白棋后期经常由谁拿到最后一手决定区域收益。这里不是精确区域奇偶，
/// 但在空格较少时给“更可能拿到最后行动权”的一方加权，能减少终盘前的软手。
fn parity_score(board: Board, root_black: bool) -> i32 {
    let empty = empty_count(board) as i32;
    if empty > 18 {
        return 0;
    }
    let base: i32 = if empty % 2 == 1 {
        1
    } else {
        -1
    };
    base * if root_black { 1 } else { -1 }
}

/// 角旁危险位惩罚。
///
/// 当角还为空时，紧贴角的 X 位和 C 位通常会把角送给对手。
/// 这不是开局库，但能避免很多业余 AI 常见的“贪翻子送角”。
fn corner_danger_score(board: Board, root_black: bool) -> i32 {
    let patterns = [
        (0u8, [1u8, 8, 9]),
        (7u8, [6u8, 14, 15]),
        (56u8, [48u8, 49, 57]),
        (63u8, [54u8, 55, 62]),
    ];
    let mut score = 0;
    for (corner, near) in patterns {
        if (board.black | board.white) & bit(corner) != 0 {
            continue;
        }
        for idx in near {
            let b = bit(idx);
            if board.black & b != 0 {
                score += if root_black { 1 } else { -1 };
            } else if board.white & b != 0 {
                score += if root_black { -1 } else { 1 };
            }
        }
    }
    score
}

/// 边稳定子近似。
///
/// 完整稳定子计算很复杂；这里先做最稳的部分：从已占角沿边连续延伸的同色棋。
/// 这些棋通常不会再被翻，能显著增强 AI 对角和边的长期价值判断。
fn stable_edge_score(board: Board, root_black: bool) -> i32 {
    let edges = [
        (0u8, 1i8, 7u8),
        (7u8, 8i8, 63u8),
        (56u8, 1i8, 63u8),
        (0u8, 8i8, 56u8),
    ];
    let mut score = 0;
    for (start, step, end) in edges {
        score += stable_from_corner(board, root_black, start, step, end);
        score += stable_from_corner(board, root_black, end, -step, start);
    }
    score
}

/// 从一个角开始沿边统计连续同色稳定子。
fn stable_from_corner(board: Board, root_black: bool, start: u8, step: i8, end: u8) -> i32 {
    let start_bit = bit(start);
    let color = if board.black & start_bit != 0 {
        Some(true)
    } else if board.white & start_bit != 0 {
        Some(false)
    } else {
        None
    };
    let Some(is_black) = color else {
        return 0;
    };

    let mut idx = start as i16;
    let mut score = 0;
    loop {
        let b = bit(idx as u8);
        let same = if is_black { board.black & b != 0 } else { board.white & b != 0 };
        if !same {
            break;
        }
        score += if is_black == root_black { 1 } else { -1 };
        if idx as u8 == end {
            break;
        }
        idx += step as i16;
        if !(0..64).contains(&idx) {
            break;
        }
    }
    score
}

/// 判断某颗棋周围是否有空格，用于前沿子评估。
fn touches_empty(board: Board, idx: u8) -> bool {
    let occupied = board.black | board.white;
    let row = (idx / 8) as i8;
    let col = (idx % 8) as i8;
    for (dr, dc) in DIRECTIONS {
        let r = row + dr;
        let c = col + dc;
        if in_board(r, c) && occupied & bit((r as u8) * 8 + c as u8) == 0 {
            return true;
        }
    }
    false
}

fn empty_count(board: Board) -> u8 {
    64 - (board.black | board.white).count_ones() as u8
}

/// 记录一次 beta cutoff。
///
/// Killer move 记录“在同一搜索层曾经造成剪枝的走法”，history heuristic
/// 则长期奖励经常造成剪枝的走法。二者都只影响搜索顺序，不直接改变评分。
fn remember_cutoff(ctx: &mut SearchCtx, ply: usize, mv: u8, depth: u8) {
    if ply <= MAX_PLY && ctx.killers[ply][0] != mv {
        ctx.killers[ply][1] = ctx.killers[ply][0];
        ctx.killers[ply][0] = mv;
    }
    let bonus = (depth as i32) * (depth as i32);
    ctx.history[mv as usize] = ctx.history[mv as usize].saturating_add(bonus);
}

/// 置换表 key。
///
/// 黑棋、白棋和行动方共同决定一个搜索状态。root 颜色不进 key，
/// 因为置换表只在单次搜索调用内存在，root 颜色在 ctx 中固定不变。
fn tt_key(board: Board, black_turn: bool) -> u128 {
    let turn = if black_turn { 1u128 } else { 0u128 };
    ((board.black as u128) << 65) | ((board.white as u128) << 1) | turn
}

fn is_corner(idx: u8) -> bool {
    matches!(idx, 0 | 7 | 56 | 63)
}

fn bit(idx: u8) -> u64 {
    1u64 << idx
}

fn in_board(r: i8, c: i8) -> bool {
    (0..8).contains(&r) && (0..8).contains(&c)
}

/// 当前时间，单位毫秒。
///
/// `js_sys::Date::now()` 在浏览器和 Node 的 Wasm 运行环境都可用，
/// 比 `std::time::Instant` 更适合这个静态网页项目。
fn now_ms() -> f64 {
    js_sys::Date::now()
}
