"use client";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="page">
      <p className="kicker">Something stopped the page</p>
      <h1 className="display">The screen could not finish.</h1>
      <p className="lede">{error.message || "An unexpected error was recorded. Your evidence was not edited."}</p>
      <button className="btn copper" type="button" onClick={() => reset()}>Try again</button>
    </main>
  );
}