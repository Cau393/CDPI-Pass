/**
 * Replaces dynamic variable tags in an HTML email template.
 *
 * Supported tags (single curly braces, case-sensitive):
 *   {nome}    → recipient's full name
 *   {evento}  → event name
 *   {data}    → event date (e.g. DD/MM/YYYY as provided in variables)
 *   {link}    → courtesy link URL
 *
 * Tags not present in the variables object are left unchanged.
 */
export function renderTemplate(
  html: string,
  variables: Record<string, string>,
): string {
  return Object.entries(variables).reduce((result, [key, value]) => {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return result.replace(new RegExp(`\\{${escaped}\\}`, "g"), value);
  }, html);
}
