import { useEffect, useState, type ReactNode } from 'react';

export type PaneKey = 'list' | 'detail' | 'action';
type Mode = 'wide' | 'mid' | 'narrow';

function readMode(): Mode {
  const w = window.innerWidth;
  if (w >= 1200) return 'wide';
  if (w >= 900) return 'mid';
  return 'narrow';
}

export function useWorkspaceMode(): Mode {
  const [mode, setMode] = useState<Mode>(readMode);
  useEffect(() => {
    const on = () => setMode(readMode());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return mode;
}

export default function Workspace({
  list, detail, action, focus, onFocus,
}: {
  list: ReactNode;
  detail: ReactNode;
  action: ReactNode;
  focus: PaneKey;                    // which pane the user is on in narrow mode
  onFocus: (p: PaneKey) => void;
}) {
  const mode = useWorkspaceMode();

  if (mode === 'narrow') {
    const back: Record<PaneKey, PaneKey | null> = { list: null, detail: 'list', action: 'detail' };
    const prev = back[focus];
    return (
      <div className="ws ws-narrow">
        {prev && (
          <button className="ws-back" onClick={() => onFocus(prev)}>
            ← {prev === 'list' ? 'Markets' : 'Detail'}
          </button>
        )}
        <div className="ws-pane ws-pane-solo">
          {focus === 'list' ? list : focus === 'detail' ? detail : action}
        </div>
      </div>
    );
  }

  return (
    <div className={`ws ws-${mode}`}>
      <div className="ws-pane ws-list">{list}</div>
      <div className="ws-pane ws-detail">{detail}</div>
      <div className="ws-pane ws-action">{action}</div>
    </div>
  );
}
