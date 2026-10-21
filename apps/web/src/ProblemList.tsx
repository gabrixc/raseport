import type { Problem } from "./problems.ts";

const canJump = (p: Problem) => p.offset !== undefined || p.nodeId !== undefined || p.path !== undefined;

export function ProblemList({ problems, onJump }: { problems: Problem[]; onJump: (p: Problem) => void }) {
  return (
    <ul className="problem-list">
      {problems.map((p, i) => (
        <li key={i}>
          {canJump(p) ? (
            <button className="link" onClick={() => onJump(p)} title="Jump to this spot in the JSON">
              {p.message}
            </button>
          ) : (
            <span>{p.message}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
