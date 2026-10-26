import { Tooltip } from '@/ui/components';
import './SourceMarker.css';

interface SourceMarkerProps {
  /** Shown number; numbered in reading order by the panel. */
  number: number;
  quote: string;
  /** e.g. "第 3 页". */
  pageLabel?: string;
  /** False when the quote was not found in the paper: shown, but cannot jump. */
  verified?: boolean;
  onLocate: () => void;
}

/**
 * A small number after a claim. Faint until the reader hovers its sentence;
 * the tooltip shows the quoted passage and a click goes to it in the paper.
 * Never selected or copied with the text.
 */
export function SourceMarker({ number, quote, pageLabel, verified = true, onLocate }: SourceMarkerProps) {
  const label = verified ? `${pageLabel ? `${pageLabel}：` : ''}“${quote}”` : `没有在论文中找到这句引文：“${quote}”`;
  return (
    <Tooltip label={label} labelsChild>
      <button
        type="button"
        className="pp-source-marker"
        data-copy-skip=""
        data-unverified={verified ? undefined : 'true'}
        aria-label={verified ? `出处 ${number}${pageLabel ? `，${pageLabel}` : ''}，跳到原文` : `出处 ${number}，未能核实`}
        onClick={() => verified && onLocate()}
      >
        {number}
      </button>
    </Tooltip>
  );
}
