import React, { useState } from 'react';
import { SimEventModel } from '../types/simulation';
import { Layers, ChevronDown, ChevronRight, Clock, Trash2 } from 'lucide-react';

interface Props {
  events: SimEventModel[];
  onClear: () => void;
  onSelectEvent: (event: SimEventModel) => void;
  selectedEventId: number | null;
}

export const DecisionLogPanel: React.FC<Props> = ({
  events,
  onClear,
  onSelectEvent,
  selectedEventId,
}) => {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const toggleExpand = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const getProtocolBadge = (proto: string) => {
    switch (proto) {
      case 'ARP':
        return 'bg-emerald-950 text-emerald-400 border-emerald-800';
      case 'ICMP':
        return 'bg-cyan-950 text-cyan-400 border-cyan-800';
      default:
        return 'bg-amber-950 text-amber-400 border-amber-800';
    }
  };

  return (
    <div className="w-[360px] bg-[#0E1524] border-r border-gray-800 flex flex-col h-full z-10">
      {/* Panel Header */}
      <div className="h-14 border-b border-gray-800 px-4 flex items-center justify-between bg-[#0F172A]">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-blue-400" />
          <h2 className="text-xs font-semibold text-slate-100 uppercase tracking-wider">
            Decision Log & PDU
          </h2>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-900/60 text-blue-300 font-mono">
            {events.length}
          </span>
        </div>

        {events.length > 0 && (
          <button
            onClick={onClear}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-gray-800 rounded-lg transition-colors"
            title="Clear Event Log"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Events List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {events.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
            <Clock className="w-8 h-8 mb-2 opacity-40 text-blue-400" />
            <p className="text-xs font-medium text-slate-400">Simulation Queue Idle</p>
            <p className="text-[11px] text-slate-600 mt-1">
              Trigger a Ping or send a packet to observe discrete-event decisions step-by-step.
            </p>
          </div>
        ) : (
          events.map((ev) => {
            const isExpanded = expandedId === ev.id;
            const isSelected = selectedEventId === ev.id;

            return (
              <div
                key={ev.id}
                onClick={() => onSelectEvent(ev)}
                className={`rounded-xl border p-3 cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-[#1E293B] border-blue-500 shadow-md shadow-blue-500/10'
                    : 'bg-[#131B2E] border-gray-800/80 hover:border-gray-700'
                }`}
              >
                {/* Event Header */}
                <div className="flex items-center justify-between text-[11px] mb-1.5">
                  <div className="flex items-center gap-1.5 font-mono">
                    <span className="text-slate-400 font-medium">{ev.time} ms</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded border font-semibold ${getProtocolBadge(
                        ev.protocol
                      )}`}
                    >
                      {ev.protocol}
                    </span>
                  </div>

                  <button
                    onClick={(e) => toggleExpand(ev.id, e)}
                    className="p-0.5 text-slate-400 hover:text-white"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {/* Path */}
                <div className="text-[11px] text-slate-300 font-mono font-medium flex items-center gap-1.5 mb-1 truncate">
                  <span className="text-cyan-400">{ev.source_node}</span>
                  <span className="text-slate-500">:</span>
                  <span className="text-slate-400 text-[10px]">{ev.source_port}</span>
                  <span className="text-slate-500">➔</span>
                  <span className="text-indigo-400">{ev.target_node}</span>
                  <span className="text-slate-500">:</span>
                  <span className="text-slate-400 text-[10px]">{ev.target_port}</span>
                </div>

                {/* Summary */}
                <p className="text-[11px] text-slate-400 font-sans line-clamp-2 leading-relaxed">
                  {ev.summary}
                </p>

                {/* Expanded Decision Trace */}
                {isExpanded && ev.decision_log.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-gray-800/80 space-y-1.5">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                      Decision Trace:
                    </span>
                    <div className="space-y-1 text-[10px] font-mono text-slate-300 bg-[#0A0E1A] p-2 rounded-lg border border-gray-800">
                      {ev.decision_log.map((logLine, idx) => (
                        <div key={idx} className="flex items-start gap-1.5 leading-normal">
                          <span className="text-blue-500 select-none">›</span>
                          <span>{logLine}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
