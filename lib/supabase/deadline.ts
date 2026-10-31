import 'server-only';

export async function withDeadline<T>(work: PromiseLike<T>, milliseconds = 3000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(work),
      new Promise<never>((_, reject) => {timer = setTimeout(() => reject(new Error('Supabase deadline exceeded')), milliseconds);})
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
