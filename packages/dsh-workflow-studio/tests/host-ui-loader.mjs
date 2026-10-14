// Host atoms are tested in the real browser. Component tests replace this external dependency.
export async function resolve(specifier, context, next) {
  if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return { url: new URL('./host-ui-mock.mjs', import.meta.url).href, shortCircuit: true }
  return next(specifier, context)
}
