// Phase 14 — Pipeline.
//
// `dag`     — node/edge model, topological sort, cycle detection.
// `executor`— async runner that drives one pipeline over a list of inputs.
// `nodes`   — placeholder for future per-node helper splits.
pub mod dag;
pub mod executor;
pub mod nodes;
pub mod preservation;
