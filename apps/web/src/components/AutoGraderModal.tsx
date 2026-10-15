import React, { useState } from 'react';
import {
  LAB_CHALLENGES,
  ChallengeDefinition,
} from '../types/challenges';
import {
  CheckCircle2,
  Circle,
  HelpCircle,
  Trophy,
  X,
  RotateCcw,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Terminal,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  activeChallengeId: string;
  onSelectChallenge: (challenge: ChallengeDefinition) => void;
  objectiveResults: Record<string, boolean>;
  onResetPreset: (preset: 'basic' | 'routed' | 'vlan') => void;
}

export const AutoGraderModal: React.FC<Props> = ({
  isOpen,
  onClose,
  activeChallengeId,
  onSelectChallenge,
  objectiveResults,
  onResetPreset,
}) => {
  const [expandedHints, setExpandedHints] = useState<Record<string, boolean>>({});

  if (!isOpen) return null;

  const currentChallenge =
    LAB_CHALLENGES.find((c) => c.id === activeChallengeId) || LAB_CHALLENGES[0];

  const toggleHint = (objId: string) => {
    setExpandedHints((prev) => ({ ...prev, [objId]: !prev[objId] }));
  };

  // Calculate score
  let totalScore = 0;
  let maxScore = 0;
  currentChallenge.objectives.forEach((obj) => {
    maxScore += obj.points;
    if (objectiveResults[obj.id]) {
      totalScore += obj.points;
    }
  });

  const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  const isComplete = percentage === 100;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-[840px] max-w-[95vw] max-h-[90vh] bg-[#0E1524] border border-gray-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="h-16 px-6 border-b border-gray-800 bg-[#0F172A] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-900/40 border border-amber-700/50 rounded-xl text-amber-400">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-100">Lab Challenges & Auto-Grader</h2>
                <span className="text-xs px-2 py-0.5 rounded bg-blue-900/60 text-blue-300 font-mono font-medium">
                  Live Grading
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Interactive real-time task verification for CCNA, MTCNA, and Linux administration.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-gray-800 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Challenge Selection Tabs */}
        <div className="flex border-b border-gray-800 bg-[#131B2E] px-6 gap-2 pt-2">
          {LAB_CHALLENGES.map((ch) => {
            const isSelected = ch.id === currentChallenge.id;
            return (
              <button
                key={ch.id}
                onClick={() => onSelectChallenge(ch)}
                className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors border-b-2 flex items-center gap-2 ${
                  isSelected
                    ? 'border-blue-500 bg-[#0E1524] text-white shadow-sm'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-gray-800/40'
                }`}
              >
                <span>{ch.title.split(':')[0]}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-gray-800 text-slate-400 font-mono">
                  {ch.difficulty}
                </span>
              </button>
            );
          })}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Active Challenge Summary Card */}
          <div className="bg-[#131B2E] border border-gray-800 rounded-xl p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-base font-bold text-slate-100">{currentChallenge.title}</h3>
                  <span className="text-xs px-2 py-0.5 rounded bg-indigo-900/60 text-indigo-300 font-medium">
                    {currentChallenge.category}
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {currentChallenge.description}
                </p>
              </div>

              <button
                onClick={() => onResetPreset(currentChallenge.preset)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-slate-300 text-xs font-semibold rounded-lg transition-colors border border-gray-700 shrink-0 ml-4"
                title="Reset simulation to initial topology for this lab"
              >
                <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
                <span>Load Lab Preset</span>
              </button>
            </div>

            {/* Score Progress Bar */}
            <div className="space-y-2 mt-4 pt-4 border-t border-gray-800/80">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  Mastery Score:
                </span>
                <span className="font-mono font-bold text-sm text-cyan-400">
                  {totalScore} / {maxScore} pts ({percentage}%)
                </span>
              </div>

              <div className="w-full h-3 bg-gray-800 rounded-full overflow-hidden p-0.5 border border-gray-700/60">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isComplete
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                      : 'bg-gradient-to-r from-blue-600 to-cyan-400'
                  }`}
                  style={{ width: `${percentage}%` }}
                />
              </div>

              {isComplete && (
                <div className="mt-3 p-3 bg-emerald-950/60 border border-emerald-800/80 rounded-xl flex items-center gap-3 text-emerald-200 text-xs animate-in fade-in duration-300">
                  <Sparkles className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <span className="font-bold">Lab Challenge 100% Complete!</span>
                    <p className="text-emerald-300/80 text-[11px] mt-0.5">
                      All criteria verified by the discrete-event engine. Great job mastering these multi-vendor networking concepts!
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Objectives List */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Required Objectives:
            </h4>

            {currentChallenge.objectives.map((obj, idx) => {
              const isPassed = objectiveResults[obj.id] === true;
              const isHintOpen = expandedHints[obj.id] === true;

              return (
                <div
                  key={obj.id}
                  className={`border rounded-xl p-4 transition-all ${
                    isPassed
                      ? 'bg-[#0F1E24] border-emerald-900/60'
                      : 'bg-[#131B2E] border-gray-800/90'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {isPassed ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        ) : (
                          <Circle className="w-5 h-5 text-slate-500" />
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-200">
                            {idx + 1}. {obj.title}
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold ${
                              isPassed
                                ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-800/60'
                                : 'bg-gray-800 text-slate-400'
                            }`}
                          >
                            +{obj.points} pts
                          </span>
                        </div>

                        <p className="text-xs text-slate-400 leading-relaxed">
                          {obj.description}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => toggleHint(obj.id)}
                      className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-sans shrink-0 ml-4 py-1 px-2 rounded-lg hover:bg-gray-800/60 transition-colors"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>{isHintOpen ? 'Hide Hint' : 'CLI Hint'}</span>
                      {isHintOpen ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                    </button>
                  </div>

                  {/* Expandable CLI Hints */}
                  {isHintOpen && (
                    <div className="mt-3 pt-3 border-t border-gray-800/80 space-y-2 text-xs font-mono">
                      {obj.hint.cisco && (
                        <div className="bg-[#0A0E1A] p-2.5 rounded-lg border border-gray-800">
                          <span className="text-[10px] font-bold text-cyan-400 flex items-center gap-1.5 mb-1 font-sans">
                            <Terminal className="w-3 h-3" /> Cisco IOS Syntax:
                          </span>
                          <pre className="text-slate-300 text-[11px] whitespace-pre-wrap">
                            {obj.hint.cisco}
                          </pre>
                        </div>
                      )}

                      {obj.hint.mikrotik && (
                        <div className="bg-[#0A0E1A] p-2.5 rounded-lg border border-gray-800">
                          <span className="text-[10px] font-bold text-rose-400 flex items-center gap-1.5 mb-1 font-sans">
                            <Terminal className="w-3 h-3" /> MikroTik RouterOS Syntax:
                          </span>
                          <pre className="text-slate-300 text-[11px] whitespace-pre-wrap">
                            {obj.hint.mikrotik}
                          </pre>
                        </div>
                      )}

                      {obj.hint.linux && (
                        <div className="bg-[#0A0E1A] p-2.5 rounded-lg border border-gray-800">
                          <span className="text-[10px] font-bold text-amber-400 flex items-center gap-1.5 mb-1 font-sans">
                            <Terminal className="w-3 h-3" /> Linux IPRoute2 Syntax:
                          </span>
                          <pre className="text-slate-300 text-[11px] whitespace-pre-wrap">
                            {obj.hint.linux}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="h-14 px-6 border-t border-gray-800 bg-[#0F172A] flex items-center justify-between">
          <p className="text-xs text-slate-400 font-sans">
            Objectives automatically evaluate as you configure devices in the CLI or perform pings.
          </p>

          <button
            onClick={onClose}
            className="px-5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-colors"
          >
            Back to Simulation
          </button>
        </div>
      </div>
    </div>
  );
};
