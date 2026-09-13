/**
 * The shared components.
 *
 * Every one of them is a compound: the caller composes the parts it needs
 * rather than switching them on with flags, which is what stops the set growing
 * a boolean per variation. A component names a semantic token and never a
 * colour, a step of a ramp or a literal.
 *
 * Filled by issue "Move the component set into packages/ui".
 */
export const UI_PACKAGE = "@layered/ui" as const;
