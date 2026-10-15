import React, { useState, useRef } from 'react';
import { Play, Pause, StepForward, Send, Zap, Download, Upload, Trophy } from 'lucide-react';
import { NodeModel } from '../types/simulation';

interface Props {
  isPlaying: boolean;
  onTogglePlay: () => void;
  onStep: () => void;
  onReset: (preset: 'basic' | 'routed' | 'vlan') => void;
  onTriggerPing: (srcNodeId: string, targetIp: string) => void;
  onExportTopology: () => void;
  onImportTopology: (jsonStr: string) => void;
  onOpenChallenges: () => void;
  challengeProgress: { completed: number; total: number; percentage: number };
  pendingEventCount: number;
  nodes: NodeModel[];
}

export const SimulationControls: React.FC<Props> = ({
  isPlaying,
  onTogglePlay,
  onStep,
  onReset,
  onTriggerPing,
  onExportTopology,
  onImportTopology,
  onOpenChallenges,
  challengeProgress,
  pendingEventCount,
  nodes,
}) => {
  const [selectedSrc, setSelectedSrc] = useState(nodes[0]?.id || 'pc1');
  const [targetIp, setTargetIp] = useState('192.168.1.20');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedSrc && targetIp) {
      onTriggerPing(selectedSrc, targetIp);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        onImportTopology(content);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  return (
    <div className="h-14 bg-[#0F172A] border-b border-gray-800 px-4 flex items-center justify-between z-10 gap-3">
      {/* Brand & Preset Loader */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-cyan-400 flex items-center justify-center font-bold text-white shadow-md shadow-blue-500/20">
            RC
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
              RouteCraft
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/60 text-blue-300 font-mono">
                Wasm DES v0.1
              </span>
            </h1>
          </div>
        </div>

        {/* Presets */}
        <div className="h-6 w-px bg-gray-800 mx-1" />
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-slate-400 font-medium">Labs:</span>
          <button
            onClick={() => onReset('basic')}
            className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-slate-200 rounded-md font-medium text-xs transition-colors"
          >
            L2 Switch
          </button>
          <button
            onClick={() => onReset('routed')}
            className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-slate-200 rounded-md font-medium text-xs transition-colors"
          >
            L3 Router
          </button>
          <button
            onClick={() => onReset('vlan')}
            className="px-2.5 py-1 bg-purple-950/60 hover:bg-purple-900 text-purple-200 border border-purple-800/60 rounded-md font-medium text-xs transition-colors"
          >
            802.1Q Inter-VLAN
          </button>
        </div>

        {/* Export / Import */}
        <div className="h-6 w-px bg-gray-800 mx-1" />
        <div className="flex items-center gap-1">
          <button
            onClick={onExportTopology}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-gray-800 rounded-lg transition-colors"
            title="Export Topology (.onlab / JSON)"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-gray-800 rounded-lg transition-colors"
            title="Import Topology (.onlab / JSON)"
          >
            <Upload className="w-4 h-4" />
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".onlab,.json"
            className="hidden"
          />
        </div>

        {/* Lab Challenges & Auto-Grader Button */}
        <div className="h-6 w-px bg-gray-800 mx-1" />
        <button
          onClick={onOpenChallenges}
          className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-amber-950/80 to-amber-900/60 hover:from-amber-900 hover:to-amber-800 text-amber-200 border border-amber-700/60 rounded-lg text-xs font-semibold shadow-sm transition-all"
        >
          <Trophy className="w-3.5 h-3.5 text-amber-400" />
          <span>Challenges</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-800/80 text-amber-100 font-mono">
            {challengeProgress.completed}/{challengeProgress.total} ({challengeProgress.percentage}%)
          </span>
        </button>
      </div>

      {/* Discrete Event Engine Controls */}
      <div className="flex items-center gap-3">
        {/* Play / Pause / Step */}
        <div className="flex items-center bg-[#1E293B] rounded-lg p-1 border border-gray-700 gap-1">
          <button
            onClick={onTogglePlay}
            className={`px-3 py-1 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-colors ${
              isPlaying
                ? 'bg-amber-600 text-white'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {isPlaying ? 'Pause' : 'Play (Auto)'}
          </button>

          <button
            onClick={onStep}
            disabled={pendingEventCount === 0}
            className="px-3 py-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:pointer-events-none text-slate-200 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-colors"
          >
            <StepForward className="w-3.5 h-3.5 text-cyan-400" />
            Step
          </button>
        </div>

        {/* Pending Events Badge */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-gray-800/80 border border-gray-700 text-xs font-mono">
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-slate-400">Queue:</span>
          <span className={`font-bold ${pendingEventCount > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
            {pendingEventCount} events
          </span>
        </div>
      </div>

      {/* Quick Ping Tool */}
      <form onSubmit={handlePingSubmit} className="flex items-center gap-2 text-xs">
        <span className="text-slate-400 font-medium">Ping:</span>
        <select
          value={selectedSrc}
          onChange={(e) => setSelectedSrc(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-slate-200 rounded-lg px-2 py-1 text-xs outline-none"
        >
          {nodes
            .filter((n) => n.device_type === 'host' || n.device_type === 'router')
            .map((n) => (
              <option key={n.id} value={n.id}>
                {n.hostname}
              </option>
            ))}
        </select>

        <span className="text-slate-400">→</span>

        <input
          type="text"
          value={targetIp}
          onChange={(e) => setTargetIp(e.target.value)}
          placeholder="IP Address"
          className="bg-gray-800 border border-gray-700 text-slate-200 rounded-lg px-2.5 py-1 text-xs w-28 font-mono outline-none"
        />

        <button
          type="submit"
          className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold flex items-center gap-1.5 transition-colors"
        >
          <Send className="w-3.5 h-3.5" />
          Send Ping
        </button>
      </form>
    </div>
  );
};
