import React, { useState, useRef } from 'react';
import { NodeModel, LinkModel, SimEventModel } from '../types/simulation';
import { DeviceModel } from '../types/devices';
import {
  Network,
  Server,
  Monitor,
  Activity,
  Plus,
  Cable,
  Scissors,
  Trash2,
  AlertTriangle,
  Boxes,
} from 'lucide-react';

interface Props {
  nodes: NodeModel[];
  links: LinkModel[];
  nodePositions: Record<string, { x: number; y: number }>;
  onUpdatePosition: (id: string, x: number, y: number) => void;
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  activePacket: SimEventModel | null;
  onAddDevice: (model: DeviceModel, x?: number, y?: number) => void;
  onDeleteNode: (id: string) => void;
  onConnectLink: (nodeA: string, portA: string, nodeB: string, portB: string) => void;
  onToggleLink: (linkId: string, connected: boolean) => void;
  onDeleteLink: (linkId: string) => void;
  isCatalogOpen: boolean;
  onToggleCatalog: () => void;
}

export const TopologyCanvas: React.FC<Props> = ({
  nodes,
  links,
  nodePositions,
  onUpdatePosition,
  selectedNodeId,
  onSelectNode,
  activePacket,
  onAddDevice,
  onDeleteNode,
  onConnectLink,
  onToggleLink,
  onDeleteLink,
  isCatalogOpen,
  onToggleCatalog,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragOverCanvas, setIsDragOverCanvas] = useState(false);

  // Cable creation state
  const [isCableToolActive, setIsCableToolActive] = useState(false);
  const [cableSource, setCableSource] = useState<{ nodeId: string; port: string } | null>(null);
  const [portSelectNode, setPortSelectNode] = useState<NodeModel | null>(null);

  const handleMouseDown = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (isCableToolActive) {
      const node = nodes.find((n) => n.id === id);
      if (node) {
        setPortSelectNode(node);
      }
      return;
    }

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
    const newX = Math.max(40, Math.min(rect.width - 120, e.clientX - dragOffset.x));
    const newY = Math.max(40, Math.min(rect.height - 120, e.clientY - dragOffset.y));
    onUpdatePosition(draggingId, newX, newY);
  };

  const handleMouseUp = () => {
    setDraggingId(null);
  };

  React.useEffect(() => {
    if (!draggingId) return;
    const handleGlobalMouseUp = () => {
      setDraggingId(null);
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [draggingId]);

  const handlePortSelect = (portName: string) => {
    if (!portSelectNode) return;

    if (!cableSource) {
      // First endpoint selected
      setCableSource({ nodeId: portSelectNode.id, port: portName });
      setPortSelectNode(null);
    } else {
      // Second endpoint selected -> connect!
      if (cableSource.nodeId === portSelectNode.id) {
        // Can't connect to same node
        alert('Cannot connect a cable to the same device!');
        setPortSelectNode(null);
        return;
      }

      onConnectLink(cableSource.nodeId, cableSource.port, portSelectNode.id, portName);
      setCableSource(null);
      setPortSelectNode(null);
      setIsCableToolActive(false);
    }
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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!isDragOverCanvas) {
      setIsDragOverCanvas(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragOverCanvas(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOverCanvas(false);

    try {
      const rawData = e.dataTransfer.getData('application/routecraft-device');
      if (!rawData || !containerRef.current) return;

      const model: DeviceModel = JSON.parse(rawData);
      const rect = containerRef.current.getBoundingClientRect();
      const dropX = Math.max(50, Math.min(rect.width - 150, e.clientX - rect.left - 40));
      const dropY = Math.max(50, Math.min(rect.height - 150, e.clientY - rect.top - 40));

      onAddDevice(model, dropX, dropY);
    } catch (err) {
      console.error('Error dropping device on canvas:', err);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full bg-[#0B0F19] overflow-hidden select-none cursor-default ${
        isCableToolActive ? 'cursor-crosshair' : ''
      }`}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={(e) => {
        // Only deselect if user clicked directly on the canvas background, not on any child element
        if (e.target === e.currentTarget && !isCableToolActive) {
          onSelectNode('');
        }
      }}
      style={{
        backgroundImage: `radial-gradient(circle, #1F2937 1px, transparent 1px)`,
        backgroundSize: '24px 24px',
      }}
    >
      {/* Drop Zone Visual Overlay during Drag */}
      {isDragOverCanvas && (
        <div className="absolute inset-0 z-20 border-2 border-dashed border-cyan-400 bg-cyan-950/25 backdrop-blur-[2px] flex items-center justify-center pointer-events-none transition-all">
          <div className="px-5 py-3 rounded-2xl bg-[#0F172A]/90 border border-cyan-500/80 text-cyan-300 font-bold text-sm shadow-2xl flex items-center gap-3 animate-pulse">
            <Plus className="w-5 h-5 text-cyan-400" />
            <span>Pusťte zařízení sem pro umístění do workspace</span>
          </div>
        </div>
      )}

      {/* Floating Canvas Toolbar */}
      <div
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-[#111827]/90 backdrop-blur-md p-1.5 rounded-xl border border-gray-800 shadow-xl"
      >
        {/* Toggle Hardware Catalog Drawer */}
        <button
          onClick={onToggleCatalog}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all border cursor-pointer ${
            isCatalogOpen
              ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-600/30'
              : 'bg-[#1E293B] hover:bg-cyan-950/60 hover:text-cyan-300 text-slate-200 border-gray-700/60'
          }`}
          title="Otevřít / zavřít šuplík s modely zařízení"
        >
          <Boxes className="w-3.5 h-3.5 text-cyan-400" />
          <span>Katalog zařízení (Šuplík)</span>
        </button>

        <div className="h-4 w-px bg-gray-800" />

        {/* Cable Connection Tool */}
        <button
          onClick={() => {
            setIsCableToolActive(!isCableToolActive);
            setCableSource(null);
            setPortSelectNode(null);
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors border cursor-pointer ${
            isCableToolActive
              ? 'bg-amber-600 text-white border-amber-500 shadow-md shadow-amber-600/20'
              : 'bg-[#1E293B] hover:bg-gray-800 text-slate-200 border-gray-700/60'
          }`}
          title="Connect Cable between devices"
        >
          <Cable className="w-3.5 h-3.5" />
          <span>{isCableToolActive ? (cableSource ? 'Select 2nd Device' : 'Select 1st Device') : 'Add Cable'}</span>
        </button>

        {/* Delete Selected Node */}
        {selectedNodeId && (
          <button
            onClick={() => onDeleteNode(selectedNodeId)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-rose-950/50 hover:bg-rose-900 text-rose-300 text-xs font-semibold rounded-lg transition-colors border border-rose-800/60 cursor-pointer"
            title="Delete Selected Device"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Device</span>
          </button>
        )}
      </div>

      {/* Cable Tool Instruction Banner */}
      {isCableToolActive && (
        <div className="absolute top-16 left-4 z-20 bg-amber-950/80 border border-amber-700/60 text-amber-200 text-xs px-3 py-1.5 rounded-lg flex items-center gap-2 backdrop-blur-md">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <span>
            {cableSource
              ? `Cable source set to ${cableSource.nodeId}:${cableSource.port}. Click destination device.`
              : 'Cable Tool Active: Click first device to choose port.'}
          </span>
          <button
            onClick={() => {
              setIsCableToolActive(false);
              setCableSource(null);
              setPortSelectNode(null);
            }}
            className="ml-2 text-xs underline hover:text-white"
          >
            Cancel
          </button>
        </div>
      )}

      {/* SVG Link Layer */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        {links.map((link) => {
          const posA = nodePositions[link.node_a] || { x: 100, y: 100 };
          const posB = nodePositions[link.node_b] || { x: 300, y: 100 };

          const x1 = posA.x + 40;
          const y1 = posA.y + 40;
          const x2 = posB.x + 40;
          const y2 = posB.y + 40;

          return (
            <g key={link.id}>
              {/* Invisible clickable hit area */}
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="transparent"
                strokeWidth={20}
                className="cursor-pointer pointer-events-auto"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleLink(link.id, !link.is_connected);
                }}
              />

              {/* Cable line */}
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={link.is_connected ? '#374151' : '#EF4444'}
                strokeWidth={link.is_connected ? 3 : 2}
                strokeDasharray={link.is_connected ? undefined : '6,6'}
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
              <circle cx={x2} cy={y2} r={14} fill={color} fillOpacity={0.4} />
              <circle cx={x2} cy={y2} r={6} fill={color} />
            </g>
          );
        })()}
      </svg>

      {/* Link Badges & Interactive Controls Layer */}
      {links.map((link) => {
        const posA = nodePositions[link.node_a] || { x: 100, y: 100 };
        const posB = nodePositions[link.node_b] || { x: 300, y: 100 };
        const midX = (posA.x + 40 + posB.x + 40) / 2;
        const midY = (posA.y + 40 + posB.y + 40) / 2;

        return (
          <div
            key={link.id}
            style={{
              transform: `translate(${midX - 60}px, ${midY - 14}px)`,
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="absolute z-10 flex items-center gap-1 bg-[#0F172A]/90 border border-gray-800 rounded-lg px-2 py-0.5 shadow-md text-[10px] font-mono text-slate-300"
          >
            <span className={link.is_connected ? 'text-slate-300' : 'text-rose-400 line-through'}>
              {link.port_a} ↔ {link.port_b}
            </span>

            {/* Toggle / Sever Cable (Fault Injection) Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleLink(link.id, !link.is_connected);
              }}
              className={`p-0.5 rounded transition-colors ${
                link.is_connected
                  ? 'text-slate-400 hover:text-rose-400 hover:bg-rose-950/50'
                  : 'text-rose-400 hover:text-emerald-400 hover:bg-emerald-950/50'
              }`}
              title={link.is_connected ? 'Sever / Cut Cable (Fault Injection)' : 'Reconnect Cable'}
            >
              <Scissors className="w-3 h-3" />
            </button>

            {/* Delete Link Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteLink(link.id);
              }}
              className="p-0.5 rounded text-slate-500 hover:text-rose-400 hover:bg-gray-800"
              title="Delete Link"
            >
              <Trash2 className="w-2.5 h-2.5" />
            </button>
          </div>
        );
      })}

      {/* Nodes Layer */}
      {nodes.map((node) => {
        const pos = nodePositions[node.id] || { x: 100, y: 100 };
        const isSelected = selectedNodeId === node.id;
        const isCableSource = cableSource?.nodeId === node.id;

        return (
          <div
            key={node.id}
            onMouseDown={(e) => handleMouseDown(node.id, e)}
            onClick={(e) => {
              e.stopPropagation();
              if (!isCableToolActive) {
                onSelectNode(node.id);
              }
            }}
            style={{
              transform: `translate(${pos.x}px, ${pos.y}px)`,
            }}
            className={`absolute w-20 h-20 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all duration-150 ${
              isCableSource
                ? 'bg-amber-950/80 border-2 border-amber-400 shadow-xl shadow-amber-500/30'
                : isSelected
                ? 'bg-[#1E293B] border-2 border-blue-500 shadow-lg shadow-blue-500/20 ring-2 ring-blue-400/40'
                : 'bg-[#111827] border border-gray-700/80 hover:border-gray-500 hover:bg-[#162032]'
            }`}
          >
            <div className="relative">
              {getNodeIcon(node.device_type)}
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-[#111827]" />
            </div>

            <span className="mt-1 text-xs font-semibold text-slate-200 tracking-wide truncate max-w-[70px]">
              {node.hostname}
            </span>

            <span className="text-[9px] text-slate-400 font-mono truncate max-w-[70px]">
              {node.interfaces[0]?.ip ? node.interfaces[0].ip.split('/')[0] : node.device_type}
            </span>
          </div>
        );
      })}

      {/* Port Selection Dialog for Cable Connection */}
      {portSelectNode && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-gray-700 rounded-xl p-5 shadow-2xl max-w-sm w-full">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2 mb-1">
              <Cable className="w-4 h-4 text-amber-400" />
              Select Port on {portSelectNode.hostname}
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Choose the interface to attach the cable to:
            </p>

            <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
              {portSelectNode.interfaces.map((iface) => {
                // Check if already used by another link
                const isUsed = links.some(
                  (l) =>
                    (l.node_a === portSelectNode.id && l.port_a === iface.name) ||
                    (l.node_b === portSelectNode.id && l.port_b === iface.name)
                );

                return (
                  <button
                    key={iface.name}
                    disabled={isUsed}
                    onClick={() => handlePortSelect(iface.name)}
                    className={`w-full px-3 py-2 rounded-lg text-left text-xs font-mono flex items-center justify-between border transition-colors ${
                      isUsed
                        ? 'opacity-40 bg-gray-900 border-gray-800 text-slate-500 cursor-not-allowed'
                        : 'bg-[#1E293B] hover:bg-blue-900/40 hover:border-blue-500 border-gray-700 text-slate-200'
                    }`}
                  >
                    <span className="font-semibold">{iface.name}</span>
                    <span className="text-[10px] text-slate-400">
                      {isUsed ? 'Connected' : iface.ip || 'Available'}
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setPortSelectNode(null)}
              className="w-full py-1.5 bg-gray-800 hover:bg-gray-700 text-slate-300 text-xs font-semibold rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Canvas Watermark / Hint */}
      <div className="absolute bottom-4 left-4 pointer-events-none text-xs text-slate-500 font-mono">
        <p className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-blue-400" />
          RouteCraft Wasm Engine • Click cable scissors to inject fault • Click node to open CLI
        </p>
      </div>
    </div>
  );
};
