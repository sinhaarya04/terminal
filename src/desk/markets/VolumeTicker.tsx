import { useEffect, useState } from 'react';
import { useDesk, money, round2 } from '../deskStore';
import { fetchTotalVolume, type TotalVolume } from '../terminalDb';
import { useNow } from '../../lib/useNow';
import PopNumber from '../../components/PopNumber';

// The board's headline number: every dollar traded through the engine since
// the first market, across every market. Live in two senses — it re-asks the
// server on the shared 30s tick, so other people's orders show up on their
// own, and it re-asks the moment this browser fills an order, so your own
// trade lands in the total before the ticket has finished animating. Guest
// mode has no server to ask, so it sums the local ledger instead.
export default function VolumeTicker() {
  const { live, trades } = useDesk();
  const now = useNow();
  const [server, setServer] = useState<TotalVolume | null>(null);
  const ownTrades = trades.length;

  useEffect(() => {
    if (!live) return;
    let on = true;
    void fetchTotalVolume().then((v) => { if (on && v) setServer(v); });
    return () => { on = false; };
  }, [live, now, ownTrades]);

  const v: TotalVolume | null = live
    ? server
    : { volume: round2(trades.reduce((a, t) => a + t.dollars, 0)), trades: trades.length };
  // first fetch still in flight: no figure beats a zero that then jumps
  if (!v) return null;

  const count = v.trades.toLocaleString('en-US');
  return (
    <div className="vol-ticker">
      <div className="vol-ticker-body">
        <em>All-time volume</em>
        <PopNumber text={money(v.volume)} className="vol-ticker-v num" />
        <span className="vol-ticker-sub">{count} trade{v.trades === 1 ? '' : 's'} across every market</span>
      </div>
    </div>
  );
}
