/**
 * The design token system.
 *
 * The values themselves live in the stylesheets beside this file, in four
 * layers: the scales, the palette, what follows from those two, and the
 * workbench density. Nothing here restates a value; anything TypeScript needs
 * is derived from the same source the stylesheets read, because two answers to
 * one question drift.
 *
 * Filled by issue "Move the token system into packages/tokens".
 */
export const TOKENS_PACKAGE = "@layered/tokens" as const;
