/**
 * downloadStatus.js — Predicados canônicos para estados de download (R2.5).
 *
 * Histórico do bug R2.5: o backend (downloader.py) sempre usou `done` como estado final
 * de sucesso, enquanto a fila interna da UI usava `completed`/`pending`. Vários pontos
 * do frontend checavam só `completed` (ignorando `done`), o que tratava itens concluídos
 * pelo backend como ainda pendentes (prompt de resume espúrio, badge da fila inflado, etc.).
 *
 * Esta centralização garante que a UI aceite AMBOS (`done` e `completed`) de forma
 * consistente. Sempre que surgir um novo sítio que precisa saber "este download acabou?",
 * use estes predicados em vez de comparar strings literais.
 */

// Estados de sucesso final. `done` = backend (canônico); `completed` = legado da UI.
export const SUCCESS_STATES = ['done', 'completed'];

// Estados de erro final. `timeout` é tratado como erro terminal (UI já faz isso).
export const ERROR_STATES = ['error', 'timeout'];

// Sucessos + erros: tudo o que não deve mais ser retomado/recontado como pendente.
export const TERMINAL_STATES = [...SUCCESS_STATES, ...ERROR_STATES];

export const isCompleted = (status) => SUCCESS_STATES.includes(status);

export const isError = (status) => ERROR_STATES.includes(status);

export const isTerminal = (status) => TERMINAL_STATES.includes(status);
