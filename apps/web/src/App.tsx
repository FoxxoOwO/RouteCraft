import React, { useEffect, useState, useRef, useCallback } from 'react';
import init, { WasmSimulation } from 'routecraft-wasm';
import {
  TopologyModel,
  SimEventModel,
  NodeTablesModel,
  CliResultModel,
} from './types/simulation';
import { TopologyCanvas } from './components/TopologyCanvas';
import { SimulationControls } from './components/SimulationControls';
import { DecisionLogPanel } from './components/DecisionLogPanel';
import { DeviceDrawer } from './components/DeviceDrawer';

export const App: React.FC = () => {
  const [wasmReady, setWasmReady] = useState(false);
  const simRef = useRef<WasmSimulation | null>(null);

  const [topology, setTopology] = useState<TopologyModel>({ nodes: [], links: [] });
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedTables, setSelectedTables] = useState<NodeTablesModel | null>(null);

  const [events, setEvents] = useState<SimEventModel[]>([]);
  const [activePacket, setActivePacket] = useState<SimEventModel | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Initialize Wasm module
  useEffect(() => {
    init()
      .then(() => {
        setWasmReady(true);
        loadPreset('basic');
      })
      .catch((err) => {
        console.error('Failed to initialize RouteCraft Wasm module:', err);
      });
  }, []);

  const refreshTopology = useCallback(() => {
    if (!simRef.current) return;
    try {
      const topo = simRef.current.get_topology() as TopologyModel;
      setTopology(topo);
      setPendingCount(simRef.current.pending_event_count());

      if (selectedNodeId) {
        try {
          const tables = simRef.current.get_node_tables(selectedNodeId) as NodeTablesModel;
          setSelectedTables(tables);
        } catch {
          setSelectedTables(null);
        }
      }
    } catch (e) {
      console.error('Error refreshing topology:', e);
    }
  }, [selectedNodeId]);

  const loadPreset = (preset: 'basic' | 'routed') => {
    // Reset simulation
    const newSim = new WasmSimulation();
    simRef.current = newSim;
    setEvents([]);
    setActivePacket(null);
    setIsPlaying(false);

    if (preset === 'basic') {
      // 1. PC1
      newSim.add_node('pc1', 'PC-1', 'host');
      newSim.add_interface('pc1', 'eth0', '00:11:22:33:44:01');
      newSim.set_interface_ip('pc1', 'eth0', '192.168.1.10/24');

      // 2. Switch SW1
      newSim.add_node('sw1', 'Switch-1', 'switch');
      newSim.add_interface('sw1', 'Fa0/1', '00:aa:bb:cc:dd:01');
      newSim.add_interface('sw1', 'Fa0/2', '00:aa:bb:cc:dd:02');

      // 3. PC2
      newSim.add_node('pc2', 'PC-2', 'host');
      newSim.add_interface('pc2', 'eth0', '00:11:22:33:44:02');
      newSim.set_interface_ip('pc2', 'eth0', '192.168.1.20/24');

      // Links
      newSim.add_link('link1', 'pc1', 'eth0', 'sw1', 'Fa0/1', 5);
      newSim.add_link('link2', 'sw1', 'Fa0/2', 'pc2', 'eth0', 5);

      setNodePositions({
        pc1: { x: 120, y: 240 },
        sw1: { x: 380, y: 240 },
        pc2: { x: 640, y: 240 },
      });
    } else {
      // Routed 2-Subnet Preset
      // 1. PC1 (Subnet 192.168.1.0/24)
      newSim.add_node('pc1', 'PC-1', 'host');
      newSim.add_interface('pc1', 'eth0', '00:11:22:33:44:10');
      newSim.set_interface_ip('pc1', 'eth0', '192.168.1.10/24');
      newSim.execute_cli('pc1', 'cisco', 'ip route 0.0.0.0 0.0.0.0 192.168.1.1');

      // 2. Router R1
      newSim.add_node('r1', 'Router-1', 'router');
      newSim.add_interface('r1', 'Gi0/0', '00:aa:bb:cc:00:01');
      newSim.add_interface('r1', 'Gi0/1', '00:aa:bb:cc:00:02');
      newSim.set_interface_admin_status('r1', 'Gi0/0', true);
      newSim.set_interface_admin_status('r1', 'Gi0/1', true);
      newSim.set_interface_ip('r1', 'Gi0/0', '192.168.1.1/24');
      newSim.set_interface_ip('r1', 'Gi0/1', '192.168.2.1/24');

      // 3. PC2 (Subnet 192.168.2.0/24)
      newSim.add_node('pc2', 'PC-2', 'host');
      newSim.add_interface('pc2', 'eth0', '00:11:22:33:44:20');
      newSim.set_interface_ip('pc2', 'eth0', '192.168.2.20/24');
      newSim.execute_cli('pc2', 'cisco', 'ip route 0.0.0.0 0.0.0.0 192.168.2.1');

      // Links
      newSim.add_link('link1', 'pc1', 'eth0', 'r1', 'Gi0/0', 5);
      newSim.add_link('link2', 'r1', 'Gi0/1', 'pc2', 'eth0', 5);

      setNodePositions({
        pc1: { x: 120, y: 240 },
        r1: { x: 380, y: 240 },
        pc2: { x: 640, y: 240 },
      });
    }

    const topo = newSim.get_topology() as TopologyModel;
    setTopology(topo);
    setPendingCount(0);
  };

  const handleStep = useCallback(() => {
    if (!simRef.current) return;
    try {
      const ev = simRef.current.step() as SimEventModel | null;
      if (ev) {
        setEvents((prev) => [ev, ...prev]);
        setActivePacket(ev);
        setTimeout(() => setActivePacket(null), 700);
        refreshTopology();
      } else {
        setIsPlaying(false);
      }
    } catch (e) {
      console.error('Error during step:', e);
      setIsPlaying(false);
    }
  }, [refreshTopology]);

  // Auto-play timer
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      if (simRef.current?.has_events()) {
        handleStep();
      } else {
        setIsPlaying(false);
      }
    }, 750);
    return () => clearInterval(interval);
  }, [isPlaying, handleStep]);

  const handleTriggerPing = (srcNodeId: string, targetIp: string) => {
    if (!simRef.current) return;
    try {
      simRef.current.trigger_ping(srcNodeId, targetIp);
      refreshTopology();
      setIsPlaying(true); // Automatically play events when ping starts
    } catch (err) {
      console.error('Failed to trigger ping:', err);
    }
  };

  const handleUpdatePosition = (id: string, x: number, y: number) => {
    setNodePositions((prev) => ({
      ...prev,
      [id]: { x, y },
    }));
  };

  const handleSelectNode = (id: string) => {
    setSelectedNodeId(id || null);
    if (id && simRef.current) {
      try {
        const tables = simRef.current.get_node_tables(id) as NodeTablesModel;
        setSelectedTables(tables);
      } catch {
        setSelectedTables(null);
      }
    } else {
      setSelectedTables(null);
    }
  };

  const handleExecuteCli = (nodeId: string, vendor: string, command: string): CliResultModel | null => {
    if (!simRef.current) return null;
    try {
      const res = simRef.current.execute_cli(nodeId, vendor, command) as CliResultModel;
      refreshTopology();
      return res;
    } catch (err) {
      console.error('CLI execution error:', err);
      return null;
    }
  };

  const handleGetPrompt = (nodeId: string, vendor: string): string => {
    if (!simRef.current) return '> ';
    return simRef.current.get_cli_prompt(nodeId, vendor);
  };

  const handleToggleInterface = (nodeId: string, ifaceName: string, up: boolean) => {
    if (!simRef.current) return;
    try {
      simRef.current.set_interface_admin_status(nodeId, ifaceName, up);
      refreshTopology();
    } catch (err) {
      console.error('Toggle interface error:', err);
    }
  };

  const selectedNode = topology.nodes.find((n) => n.id === selectedNodeId) || null;

  if (!wasmReady) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-[#0B0F19] text-slate-300">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-semibold tracking-wide">Loading RouteCraft Wasm Discrete-Event Engine...</p>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen flex flex-col bg-[#0B0F19] text-slate-100 overflow-hidden">
      {/* Top Controls Bar */}
      <SimulationControls
        isPlaying={isPlaying}
        onTogglePlay={() => setIsPlaying((p) => !p)}
        onStep={handleStep}
        onReset={(preset) => loadPreset(preset)}
        onTriggerPing={handleTriggerPing}
        pendingEventCount={pendingCount}
        nodes={topology.nodes}
      />

      {/* Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Side: Decision Log & PDU Inspector */}
        <DecisionLogPanel
          events={events}
          onClear={() => setEvents([])}
          onSelectEvent={(ev) => console.log('Selected event:', ev)}
          selectedEventId={activePacket?.id || null}
        />

        {/* Center: Topology Canvas */}
        <div className="flex-1 relative overflow-hidden">
          <TopologyCanvas
            nodes={topology.nodes}
            links={topology.links}
            nodePositions={nodePositions}
            onUpdatePosition={handleUpdatePosition}
            selectedNodeId={selectedNodeId}
            onSelectNode={handleSelectNode}
            activePacket={activePacket}
          />
        </div>

        {/* Right Side: Device Drawer (CLI Terminal & Tables) */}
        {selectedNode && (
          <DeviceDrawer
            node={selectedNode}
            tables={selectedTables}
            onClose={() => setSelectedNodeId(null)}
            onExecuteCli={handleExecuteCli}
            onGetPrompt={handleGetPrompt}
            onToggleInterface={handleToggleInterface}
          />
        )}
      </div>
    </div>
  );
};
