import React, { useState, useRef } from 'react';
import { NodeModel, LinkModel, SimEventModel } from '../types/simulation';
import { Network, Server, Monitor, Activity } from 'lucide-react';

interface Props {
  nodes: NodeModel[];
  links: LinkModel[];
  nodePositions: Record<string, { x: number; y: number }>;
  onUpdatePosition: (id: string, x: number, y: number) => void;
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  activePacket: SimEventModel | null;
}

export const TopologyCanvas: React.FC<Props> = ({
  nodes,
  links,
  nodePositions,
  onUpdatePosition,
  selectedNodeId,
  onSelectNode,
  activePacket,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleMouseDown = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const pos = nodePositions[id] || { x: 100, y: 100 };
    setDraggingId(id);
    setDragOffset({
      x: e.clientX - pos.x,
      y: e.clientY - pos.y,
    });
    onSelectNode(id);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggingId || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const newX = Math.max(50, Math.min(rect.width - 100, e.clientX - dragOffset.x));
    const newY = Math.max(50, Math.min(rect.height - 100, e.clientY - dragOffset.y));
    onUpdatePosition(draggingId, newX, newY);
  };

  const handleMouseUp = () => {
    setDraggingId(null);
  };

  const getNodeIcon = (type: string) => {
    switch (type) {
      case 'router':
        return <Network className="w-8 h-8 text-cyan-400" />;
      case 'switch':
        return <Server className="w-8 h-8 text-indigo-400" />;
      case 'host':
      default:
        return <Monitor className="w-8 h-8 text-emerald-400" />;
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-[#0B0F19] overflow-hidden select-none cursor-default"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onClick={() => onSelectNode('')}
      style={{
        backgroundImage: `radial-gradient(circle, #1F2937 1px, transparent 1px)`,
        backgroundSize: '24px 24px',
      }}
    >
      {/* SVG Link Layer */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        {links.map((link) => {
          const posA = nodePositions[link.node_a] || { x: 100, y: 100 };
          const posB = nodePositions[link.node_b] || { x: 300, y: 100 };

          // Offset to center of node (node is 80x80)
          const x1 = posA.x + 40;
          const y1 = posA.y + 40;
          const x2 = posB.x + 40;
          const y2 = posB.y + 40;

          // Compute midpoint for port labels
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;

          return (
            <g key={link.id}>
              {/* Cable line */}
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={link.is_connected ? '#374151' : '#EF4444'}
                strokeWidth={link.is_connected ? 3 : 2}
                strokeDasharray={link.is_connected ? undefined : '5,5'}
              />

              {/* Status glow if active */}
              {link.is_connected && (
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#10B981"
                  strokeWidth={1}
                  strokeOpacity={0.6}
                />
              )}

              {/* Link ports label */}
              <text
                x={midX}
                y={midY - 8}
                fill="#9CA3AF"
                fontSize={10}
                textAnchor="middle"
                className="font-mono select-none"
              >
                {link.port_a} ↔ {link.port_b}
              </text>
            </g>
          );
        })}

        {/* Animated Flying Packet */}
        {activePacket && (() => {
          const srcPos = nodePositions[activePacket.source_node];
          const dstPos = nodePositions[activePacket.target_node];
          if (!srcPos || !dstPos) return null;

          const x1 = srcPos.x + 40;
          const y1 = srcPos.y + 40;
          const x2 = dstPos.x + 40;
          const y2 = dstPos.y + 40;

          const color =
            activePacket.protocol === 'ARP'
              ? '#10B981'
              : activePacket.protocol === 'ICMP'
              ? '#06B6D4'
              : '#F59E0B';

          return (
            <g>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={color}
                strokeWidth={4}
                strokeDasharray="8 8"
                className="animate-pulse"
              />
              <circle cx={x2} cy={y2} r={12} fill={color} fillOpacity={0.4} />
              <circle cx={x2} cy={y2} r={6} fill={color} />
            </g>
          );
        })()}
      </svg>

      {/* Nodes Layer */}
      {nodes.map((node) => {
        const pos = nodePositions[node.id] || { x: 100, y: 100 };
        const isSelected = selectedNodeId === node.id;

        return (
          <div
            key={node.id}
            onMouseDown={(e) => handleMouseDown(node.id, e)}
            style={{
              transform: `translate(${pos.x}px, ${pos.y}px)`,
            }}
            className={`absolute w-20 h-20 rounded-xl flex flex-col items-center justify-center cursor-move transition-shadow duration-150 ${
              isSelected
                ? 'bg-[#1E293B] border-2 border-blue-500 shadow-lg shadow-blue-500/20'
                : 'bg-[#111827] border border-gray-700/80 hover:border-gray-500'
            }`}
          >
            <div className="relative">
              {getNodeIcon(node.device_type)}
              {/* Online indicator dot */}
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-[#111827]" />
            </div>

            <span className="mt-1 text-xs font-semibold text-slate-200 tracking-wide truncate max-w-[70px]">
              {node.hostname}
            </span>

            {/* Sub-label for primary IP or type */}
            <span className="text-[9px] text-slate-400 font-mono truncate max-w-[70px]">
              {node.interfaces[0]?.ip ? node.interfaces[0].ip.split('/')[0] : node.device_type}
            </span>
          </div>
        );
      })}

      {/* Canvas Watermark / Hint */}
      <div className="absolute bottom-4 left-4 pointer-events-none text-xs text-slate-500 font-mono">
        <p className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-blue-400" />
          RouteCraft Wasm DES Engine • Click device to open CLI / Tables
        </p>
      </div>
    </div>
  );
};
