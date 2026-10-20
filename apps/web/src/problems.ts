/** Something wrong with the report, with enough information to jump to it in the JSON text. */
export interface Problem {
  message: string;
  /** JSON path (zod issues) */
  path?: (string | number)[] | undefined;
  /** `id` of the definition node (reference checks, server errors) */
  nodeId?: string | undefined;
  /** absolute character offset (JSON syntax errors) */
  offset?: number | undefined;
}
