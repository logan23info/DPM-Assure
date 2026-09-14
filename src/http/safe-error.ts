const DATABASE_WRAPPER_PREFIXES = ["Failed query:", "Query failed:"];

function errorChain(error: unknown): Error[] {
  const chain: Error[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (current instanceof Error && !seen.has(current)) {
    chain.push(current);
    seen.add(current);
    current = (current as Error & { cause?: unknown }).cause;
  }

  return chain;
}

export function safeFinalizationErrorMessage(error: unknown): string {
  const chain = errorChain(error);

  for (const item of chain) {
    if (/Frozen engagement .* cannot be mutated/i.test(item.message)) {
      return "Frozen engagement cannot be mutated after audit freeze";
    }
  }

  const top = chain[0]?.message;
  if (top && !DATABASE_WRAPPER_PREFIXES.some((prefix) => top.startsWith(prefix))) {
    return top;
  }

  return "Finalization action rejected";
}
