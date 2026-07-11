use super::*;

const TEST_DIRECTIONS: [(i8, i8); 8] = [
    (-1, -1),
    (-1, 0),
    (-1, 1),
    (0, 1),
    (1, 1),
    (1, 0),
    (1, -1),
    (0, -1),
];

#[test]
fn bitboard_move_generation_matches_reference_positions() {
    let positions = [
        board_from_indices(&[28, 35], &[27, 36]),
        board_from_indices(&[0, 1, 8, 18, 27, 36], &[2, 9, 10, 17, 26, 35]),
        board_from_indices(
            &[3, 4, 5, 12, 19, 20, 28, 37, 46, 55],
            &[10, 11, 13, 18, 21, 27, 29, 36, 44, 45],
        ),
        board_from_indices(
            &[7, 14, 21, 28, 35, 42, 49, 56],
            &[6, 13, 20, 27, 34, 41, 48, 57],
        ),
    ];

    for board in positions {
        for black_turn in [true, false] {
            assert_eq!(
                move_mask_from_vec(legal_moves(board, black_turn)),
                reference_legal_mask(board, black_turn)
            );
            for idx in 0..64u8 {
                assert_eq!(
                    flips_for_move(board, idx, black_turn),
                    reference_flips_for_move(board, idx, black_turn),
                    "idx={idx}, black_turn={black_turn}"
                );
            }
        }
    }
}

#[test]
fn initial_position_has_standard_legal_moves() {
    let board = board_from_indices(&[28, 35], &[27, 36]);

    assert_eq!(
        move_mask_from_vec(legal_moves(board, true)),
        mask(&[19, 26, 37, 44])
    );
    assert_eq!(
        move_mask_from_vec(legal_moves(board, false)),
        mask(&[20, 29, 34, 43])
    );
}

#[test]
fn apply_move_flips_expected_discs() {
    let board = board_from_indices(&[28, 35], &[27, 36]);
    let next = apply_move(board, 19, true);

    assert_eq!(next.black, mask(&[19, 27, 28, 35]));
    assert_eq!(next.white, mask(&[36]));
}

#[test]
fn edge_shifts_do_not_wrap_between_rows() {
    let board = board_from_indices(&[7], &[6]);

    assert_eq!(flips_for_move(board, 5, true), bit(6));
    assert_eq!(flips_for_move(board, 0, true), 0);
    assert_eq!(move_mask_from_vec(legal_moves(board, true)), bit(5));
}

#[test]
fn no_legal_moves_returns_empty_vector() {
    let board = board_from_indices(&[0, 1, 2, 3, 4, 5, 6, 7], &[]);

    assert!(legal_moves(board, true).is_empty());
    assert!(legal_moves(board, false).is_empty());
}

fn board_from_indices(black_indices: &[u8], white_indices: &[u8]) -> Board {
    let mut black = 0u64;
    let mut white = 0u64;
    for &idx in black_indices {
        black |= bit(idx);
    }
    for &idx in white_indices {
        white |= bit(idx);
    }
    Board { black, white }
}

fn move_mask_from_vec(moves: Vec<u8>) -> u64 {
    moves.into_iter().fold(0u64, |mask, idx| mask | bit(idx))
}

fn mask(indices: &[u8]) -> u64 {
    indices.iter().fold(0u64, |out, &idx| out | bit(idx))
}

fn reference_legal_mask(board: Board, black_turn: bool) -> u64 {
    let occupied = board.black | board.white;
    let mut moves = 0u64;
    for idx in 0..64u8 {
        if occupied & bit(idx) == 0 && reference_flips_for_move(board, idx, black_turn) != 0 {
            moves |= bit(idx);
        }
    }
    moves
}

fn reference_flips_for_move(board: Board, idx: u8, black_turn: bool) -> u64 {
    let own = if black_turn { board.black } else { board.white };
    let opp = if black_turn { board.white } else { board.black };
    let occupied = own | opp;
    if occupied & bit(idx) != 0 {
        return 0;
    }

    let row = (idx / 8) as i8;
    let col = (idx % 8) as i8;
    let mut flips = 0u64;

    for (dr, dc) in TEST_DIRECTIONS {
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
