export function detectBlockedShellSyntax(command: string): string | null {
  if (/[\r\n]/.test(command)) {
    return "multi-line commands are not allowed";
  }
  if (/\$\(/.test(command)) {
    return "command substitution '$()' is not allowed";
  }
  if (/`/.test(command)) {
    return "backtick command substitution is not allowed";
  }
  if (/\|\|/.test(command)) {
    return "logical OR '||' is not allowed";
  }
  if (/&&/.test(command)) {
    return "logical AND '&&' is not allowed";
  }
  if (/(^|[^\\])\|/.test(command)) {
    return "pipes '|' are not allowed";
  }
  if (/(^|[^\\]);/.test(command)) {
    return "command separators ';' are not allowed";
  }
  if (/(^|[^\\])[<>]/.test(command)) {
    return "redirection '<' or '>' is not allowed";
  }
  return null;
}
