import React, { useEffect, useState, useRef, useCallback } from 'react';
import init, { WasmSimulation } from 'routecraft-wasm';
import {
  TopologyModel,
  SimEventModel,
  NodeTablesModel,
  CliResultModel,
} from './types/simulation';
import { LAB_CHALLENGES, ChallengeDefinition } from './types/challenges';
import { TopologyCanvas } from './components/TopologyCanvas';
import { SimulationControls } from './components/SimulationControls';
import { DecisionLogPanel } from './components/DecisionLogPanel';
import { DeviceDrawer } from './components/DeviceDrawer';
import { PduInspectorModal } from './components/PduInspectorModal';
import { AutoGraderModal } from './components/AutoGraderModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DeviceCatalogDrawer } from './components/DeviceCatalogDrawer';
import { DeviceModel, NodeVendorMeta, resolveNodeVendorMeta } from './types/devices';
import {
  isTauriApp,
  desktopOpenLab,
  desktopSaveLab,
  desktopSaveLabFile,
  desktopGetCliStartupFile,
  desktopToggleFullscreen,
  listenDesktopMenuEvents,
} from './utils/desktop';

export const App: React.FC = () => {
  const [wasmReady, setWasmReady] = useState(false);
  const simRef = useRef<WasmSimulation | null>(null);

  const [topology, setTopology] = useState<TopologyModel>({ nodes: [], links: [] });
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedTables, setSelectedTables] = useState<NodeTablesModel | null>(null);

  const [events, setEvents] = useState<SimEventModel[]>([]);
  const [activePacket, setActivePacket] = useState<SimEventModel | null>(null);
  const [selectedEventForPdu, setSelectedEventForPdu] = useState<SimEventModel | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [isCatalogOpen, setIsCatalogOpen] = useState(true);
  const [nodeVendorMap, setNodeVendorMap] = useState<Record<string, NodeVendorMeta>>({});

  // Desktop specific state
  const [isDesktop, setIsDesktop] = useState(false);
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [currentFileName, setCurrentFileName] = useState<string | null>(null);

  // Challenges & Auto-Grader state
  const [activeChallenge, setActiveChallenge] = useState<ChallengeDefinition>(LAB_CHALLENGES[0]);
  const [isGraderModalOpen, setIsGraderModalOpen] = useState(false);
  const [objectiveResults, setObjectiveResults] = useState<Record<string, boolean>>({});

  const hasInitializedRef = useRef(false);

  // Initialize Wasm module
  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    const startWasm = async () => {
      try {
        await init();
      } catch {
        // Fallback to public asset if needed
        await init('/routecraft_wasm_bg.wasm');
      }
      setWasmReady(true);

      if (isTauriApp()) {
        setIsDesktop(true);
        try {
          const startup = await desktopGetCliStartupFile();
          if (startup) {
            setCurrentFilePath(startup.filePath);
            setCurrentFileName(startup.fileName);
            handleImportTopology(startup.content);
            return;
          }
        } catch (e) {
          console.warn('CLI startup file error:', e);
        }
      }

      loadPreset('vlan');
    };

    startWasm().catch((err) => {
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

  const loadPreset = (preset: 'basic' | 'routed' | 'vlan') => {
    const newSim = new WasmSimulation();
    simRef.current = newSim;
    setEvents([]);
    setActivePacket(null);
    setSelectedEventForPdu(null);
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
        pc1: { x: 140, y: 260 },
        sw1: { x: 400, y: 260 },
        pc2: { x: 660, y: 260 },
      });
    } else if (preset === 'routed') {
      // Routed 2-Subnet Preset
      // 1. PC1 (Subnet 192.168.1.0/24)
      newSim.add_node('pc1', 'PC-1', 'host');
      newSim.add_interface('pc1', 'eth0', '00:11:22:33:44:10');
      newSim.set_interface_ip('pc1', 'eth0', '192.168.1.10/24');
      newSim.execute_cli('pc1', 'cisco', 'enable');
      newSim.execute_cli('pc1', 'cisco', 'conf t');
      newSim.execute_cli('pc1', 'cisco', 'ip route 0.0.0.0 0.0.0.0 192.168.1.1');
      newSim.execute_cli('pc1', 'cisco', 'exit');
      newSim.execute_cli('pc1', 'cisco', 'exit');
      newSim.add_static_route('pc1', '0.0.0.0/0', '192.168.1.1');

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
      newSim.execute_cli('pc2', 'cisco', 'enable');
      newSim.execute_cli('pc2', 'cisco', 'conf t');
      newSim.execute_cli('pc2', 'cisco', 'ip route 0.0.0.0 0.0.0.0 192.168.2.1');
      newSim.execute_cli('pc2', 'cisco', 'exit');
      newSim.execute_cli('pc2', 'cisco', 'exit');
      newSim.add_static_route('pc2', '0.0.0.0/0', '192.168.2.1');

      // Links
      newSim.add_link('link1', 'pc1', 'eth0', 'r1', 'Gi0/0', 5);
      newSim.add_link('link2', 'r1', 'Gi0/1', 'pc2', 'eth0', 5);

      setNodePositions({
        pc1: { x: 140, y: 260 },
        r1: { x: 400, y: 260 },
        pc2: { x: 660, y: 260 },
      });
    } else {
      // Preset 3: Inter-VLAN Routing (Router-on-a-Stick + 802.1Q)
      // 1. Router R1
      newSim.add_node('r1', 'Router-1', 'router');
      newSim.add_interface('r1', 'Gi0/0', '00:aa:bb:cc:00:01');
      newSim.set_interface_admin_status('r1', 'Gi0/0', true);

      // Sub-interface Gi0/0.10 (VLAN 10)
      newSim.add_interface('r1', 'Gi0/0.10', '00:aa:bb:cc:00:10');
      newSim.set_interface_admin_status('r1', 'Gi0/0.10', true);
      newSim.execute_cli('r1', 'cisco', 'enable');
      newSim.execute_cli('r1', 'cisco', 'conf t');
      newSim.execute_cli('r1', 'cisco', 'interface Gi0/0.10');
      newSim.execute_cli('r1', 'cisco', 'encapsulation dot1q 10');
      newSim.execute_cli('r1', 'cisco', 'ip address 192.168.10.1 255.255.255.0');
      newSim.execute_cli('r1', 'cisco', 'exit');

      // Sub-interface Gi0/0.20 (VLAN 20)
      newSim.add_interface('r1', 'Gi0/0.20', '00:aa:bb:cc:00:20');
      newSim.set_interface_admin_status('r1', 'Gi0/0.20', true);
      newSim.execute_cli('r1', 'cisco', 'interface Gi0/0.20');
      newSim.execute_cli('r1', 'cisco', 'encapsulation dot1q 20');
      newSim.execute_cli('r1', 'cisco', 'ip address 192.168.20.1 255.255.255.0');
      newSim.execute_cli('r1', 'cisco', 'exit');
      newSim.execute_cli('r1', 'cisco', 'exit');

      // 2. Switch SW1
      newSim.add_node('sw1', 'Switch-1', 'switch');
      newSim.add_interface('sw1', 'Fa0/1', '00:aa:bb:cc:dd:01');
      newSim.add_interface('sw1', 'Fa0/2', '00:aa:bb:cc:dd:02');
      newSim.add_interface('sw1', 'Fa0/3', '00:aa:bb:cc:dd:03');

      newSim.execute_cli('sw1', 'cisco', 'enable');
      newSim.execute_cli('sw1', 'cisco', 'conf t');
      newSim.execute_cli('sw1', 'cisco', 'vlan 10');
      newSim.execute_cli('sw1', 'cisco', 'name Sales');
      newSim.execute_cli('sw1', 'cisco', 'exit');
      newSim.execute_cli('sw1', 'cisco', 'vlan 20');
      newSim.execute_cli('sw1', 'cisco', 'name Engineering');
      newSim.execute_cli('sw1', 'cisco', 'exit');
      newSim.execute_cli('sw1', 'cisco', 'interface Fa0/1');
      newSim.execute_cli('sw1', 'cisco', 'switchport mode trunk');
      newSim.execute_cli('sw1', 'cisco', 'exit');
      newSim.execute_cli('sw1', 'cisco', 'interface Fa0/2');
      newSim.execute_cli('sw1', 'cisco', 'switchport mode access');
      newSim.execute_cli('sw1', 'cisco', 'switchport access vlan 10');
      newSim.execute_cli('sw1', 'cisco', 'exit');
      newSim.execute_cli('sw1', 'cisco', 'interface Fa0/3');
      newSim.execute_cli('sw1', 'cisco', 'switchport mode access');
      newSim.execute_cli('sw1', 'cisco', 'switchport access vlan 20');
      newSim.execute_cli('sw1', 'cisco', 'exit');
      newSim.execute_cli('sw1', 'cisco', 'exit');

      // 3. PC1 (VLAN 10 Sales)
      newSim.add_node('pc1', 'PC-Sales-1', 'host');
      newSim.add_interface('pc1', 'eth0', '00:11:22:33:44:10');
      newSim.set_interface_ip('pc1', 'eth0', '192.168.10.10/24');
      newSim.execute_cli('pc1', 'cisco', 'enable');
      newSim.execute_cli('pc1', 'cisco', 'conf t');
      newSim.execute_cli('pc1', 'cisco', 'ip route 0.0.0.0 0.0.0.0 192.168.10.1');
      newSim.execute_cli('pc1', 'cisco', 'exit');
      newSim.execute_cli('pc1', 'cisco', 'exit');
      newSim.add_static_route('pc1', '0.0.0.0/0', '192.168.10.1');

      // 4. PC2 (VLAN 20 Engineering)
      newSim.add_node('pc2', 'PC-Eng-2', 'host');
      newSim.add_interface('pc2', 'eth0', '00:11:22:33:44:20');
      newSim.set_interface_ip('pc2', 'eth0', '192.168.20.20/24');
      newSim.execute_cli('pc2', 'cisco', 'enable');
      newSim.execute_cli('pc2', 'cisco', 'conf t');
      newSim.execute_cli('pc2', 'cisco', 'ip route 0.0.0.0 0.0.0.0 192.168.20.1');
      newSim.execute_cli('pc2', 'cisco', 'exit');
      newSim.execute_cli('pc2', 'cisco', 'exit');
      newSim.add_static_route('pc2', '0.0.0.0/0', '192.168.20.1');

      // Links
      newSim.add_link('link_trunk', 'r1', 'Gi0/0', 'sw1', 'Fa0/1', 5);
      newSim.add_link('link_vlan10', 'sw1', 'Fa0/2', 'pc1', 'eth0', 5);
      newSim.add_link('link_vlan20', 'sw1', 'Fa0/3', 'pc2', 'eth0', 5);

      setNodePositions({
        r1: { x: 400, y: 80 },
        sw1: { x: 400, y: 250 },
        pc1: { x: 160, y: 390 },
        pc2: { x: 640, y: 390 },
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
      setIsPlaying(true);
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
      const meta = nodeVendorMap[nodeId];
      // For vendor-locked devices, strictly enforce their native CLI vendor
      const targetVendor = meta?.isLocked ? meta.cliVendor : vendor;
      const res = simRef.current.execute_cli(nodeId, targetVendor, command) as CliResultModel;
      refreshTopology();
      return res;
    } catch (err) {
      console.error('CLI execution error:', err);
      return null;
    }
  };

  const handleGetPrompt = (nodeId: string, vendor: string): string => {
    if (!simRef.current) return '> ';
    const meta = nodeVendorMap[nodeId];
    const targetVendor = meta?.isLocked ? meta.cliVendor : vendor;
    return simRef.current.get_cli_prompt(nodeId, targetVendor);
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

  // Dynamic Topology Add Device from Hardware Catalog

  const handleAddDevice = (model: DeviceModel, x?: number, y?: number) => {
    if (!simRef.current) return;
    const sameTypeCount =
      topology.nodes.filter((n) => n.device_type === model.deviceType).length + 1;
    const shortPrefix = model.name.split(' ')[0];
    const id = `${model.id.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now().toString(36).slice(-3)}`;
    const hostname = `${shortPrefix}-${sameTypeCount}`;

    try {
      simRef.current.add_node(id, hostname, model.deviceType);

      // Add all model interfaces
      for (const iface of model.interfaces) {
        simRef.current.add_interface(id, iface, undefined);
      }

      const posX = x !== undefined ? x : 320 + Math.random() * 80;
      const posY = y !== undefined ? y : 140 + Math.random() * 80;

      setNodePositions((prev) => ({
        ...prev,
        [id]: { x: posX, y: posY },
      }));

      const isLocked = model.vendor !== 'generic';
      const meta: NodeVendorMeta = {
        vendorId: model.vendor,
        vendorName: model.vendorName,
        modelName: model.name,
        cliVendor: model.defaultCliVendor,
        isLocked,
      };

      setNodeVendorMap((prev) => ({
        ...prev,
        [id]: meta,
      }));

      refreshTopology();
    } catch (err) {
      console.error('Failed to add device from catalog:', err);
    }
  };

  const handleDeleteNode = (id: string) => {
    if (!simRef.current) return;
    simRef.current.remove_node(id);
    if (selectedNodeId === id) setSelectedNodeId(null);
    refreshTopology();
  };

  const handleConnectLink = (nodeA: string, portA: string, nodeB: string, portB: string) => {
    if (!simRef.current) return;
    const linkId = `link_${Date.now()}`;
    try {
      simRef.current.add_link(linkId, nodeA, portA, nodeB, portB, 5);
      refreshTopology();
    } catch (err) {
      console.error('Failed to add link:', err);
    }
  };

  const handleToggleLink = (linkId: string, connected: boolean) => {
    if (!simRef.current) return;
    try {
      simRef.current.toggle_link(linkId, connected);
      refreshTopology();
    } catch (err) {
      console.error('Failed to toggle link:', err);
    }
  };

  const handleDeleteLink = (linkId: string) => {
    if (!simRef.current) return;
    try {
      simRef.current.remove_link(linkId);
      refreshTopology();
    } catch (err) {
      console.error('Failed to delete link:', err);
    }
  };

  // Export / Import
  const handleExportTopology = useCallback(async () => {
    if (!simRef.current) return;
    try {
      const json = simRef.current.export_topology_json();
      if (isTauriApp()) {
        const defaultName = currentFileName || `routecraft_lab_${Date.now()}.onlab`;
        const savedPath = await desktopSaveLab(json, defaultName);
        if (savedPath) {
          setCurrentFilePath(savedPath);
          const name = savedPath.split(/[/\\]/).pop() || 'lab.onlab';
          setCurrentFileName(name);
        }
        return;
      }

      // Web fallback
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `routecraft_lab_${Date.now()}.onlab`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    }
  }, [currentFileName]);

  const handleQuickSave = useCallback(async () => {
    if (!simRef.current) return;
    try {
      const json = simRef.current.export_topology_json();
      if (isTauriApp() && currentFilePath) {
        await desktopSaveLabFile(currentFilePath, json);
        return;
      }
      await handleExportTopology();
    } catch (err) {
      console.error('Quick save failed:', err);
    }
  }, [currentFilePath, handleExportTopology]);

  const handleImportTopology = useCallback((jsonStr: string) => {
    if (!simRef.current) return;
    try {
      simRef.current.import_topology_json(jsonStr);
      setEvents([]);
      setActivePacket(null);
      setSelectedEventForPdu(null);
      setSelectedNodeId(null);

      // Auto position nodes if empty and resolve vendor metadata
      const topo = simRef.current.get_topology() as TopologyModel;
      const positions: Record<string, { x: number; y: number }> = {};
      const newMap: Record<string, NodeVendorMeta> = {};
      topo.nodes.forEach((n, idx) => {
        positions[n.id] = {
          x: 120 + (idx % 4) * 220,
          y: 180 + Math.floor(idx / 4) * 160,
        };
        newMap[n.id] = resolveNodeVendorMeta(n.id, n.hostname, n.device_type);
      });
      setNodePositions(positions);
      setNodeVendorMap(newMap);
      setTopology(topo);
      setPendingCount(0);
    } catch (err) {
      alert(`Import error: ${err}`);
      console.error('Import failed:', err);
    }
  }, []);

  const handleNativeOpenLab = useCallback(async () => {
    if (!simRef.current) return;
    try {
      const file = await desktopOpenLab();
      if (file) {
        setCurrentFilePath(file.filePath);
        setCurrentFileName(file.fileName);
        handleImportTopology(file.content);
      }
    } catch (err) {
      console.error('Native open failed:', err);
    }
  }, [handleImportTopology]);

  // Desktop keyboard shortcuts (Ctrl+S, Ctrl+O, F11)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleQuickSave();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        if (isTauriApp()) {
          handleNativeOpenLab();
        } else {
          const fileInput = document.getElementById('routecraft-file-input') as HTMLInputElement | null;
          fileInput?.click();
        }
      } else if (e.key === 'F11') {
        e.preventDefault();
        if (isTauriApp()) {
          desktopToggleFullscreen();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleQuickSave, handleNativeOpenLab]);

  // Desktop native menu events
  useEffect(() => {
    if (!isTauriApp()) return;
    const unlisten = listenDesktopMenuEvents((eventId) => {
      switch (eventId) {
        case 'new_lab':
          loadPreset('basic');
          setCurrentFilePath(null);
          setCurrentFileName(null);
          break;
        case 'open_lab':
          handleNativeOpenLab();
          break;
        case 'save_lab':
          handleQuickSave();
          break;
        case 'save_lab_as':
          handleExportTopology();
          break;
        case 'toggle_fullscreen':
          desktopToggleFullscreen();
          break;
        case 'challenges':
          setIsGraderModalOpen(true);
          break;
        case 'about_routecraft':
          alert(
            'RouteCraft Desktop v0.1.0\n\nNativní desktopová aplikace pro síťové simulace s multi-vendor CLI (Cisco, MikroTik, Linux).\n\nBěží na jádře Tauri v2 a Rust Discrete-Event Engine.'
          );
          break;
      }
    });

    return () => unlisten();
  }, [handleQuickSave, handleNativeOpenLab, handleExportTopology]);

  // Live auto-grader evaluation on topology or events change
  useEffect(() => {
    if (!topology || topology.nodes.length === 0) return;
    try {
      const results = activeChallenge.evaluator(topology, events);
      setObjectiveResults(results);
    } catch (err) {
      console.error('Error evaluating challenge:', err);
    }
  }, [topology, events, activeChallenge]);

  const completedObjectives = activeChallenge.objectives.filter(
    (o) => objectiveResults[o.id]
  ).length;
  const totalObjectives = activeChallenge.objectives.length;
  const challengePercentage =
    totalObjectives > 0 ? Math.round((completedObjectives / totalObjectives) * 100) : 0;

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
    <ErrorBoundary>
      <div className="w-screen h-screen flex flex-col bg-[#0B0F19] text-slate-100 overflow-hidden">
        {/* Top Controls Bar */}
      <SimulationControls
        isPlaying={isPlaying}
        onTogglePlay={() => setIsPlaying((p) => !p)}
        onStep={handleStep}
        onReset={(preset) => {
          loadPreset(preset);
          setCurrentFilePath(null);
          setCurrentFileName(null);
        }}
        onTriggerPing={handleTriggerPing}
        onExportTopology={handleExportTopology}
        onImportTopology={handleImportTopology}
        onNativeImport={isDesktop ? handleNativeOpenLab : undefined}
        isDesktop={isDesktop}
        currentFileName={currentFileName}
        onOpenChallenges={() => setIsGraderModalOpen(true)}
        challengeProgress={{
          completed: completedObjectives,
          total: totalObjectives,
          percentage: challengePercentage,
        }}
        pendingEventCount={pendingCount}
        nodes={topology.nodes}
      />

      {/* Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Side: Decision Log & PDU Inspector Trigger */}
        <DecisionLogPanel
          events={events}
          onClear={() => setEvents([])}
          onSelectEvent={(ev) => setSelectedEventForPdu(ev)}
          selectedEventId={activePacket?.id || selectedEventForPdu?.id || null}
        />

        {/* Center: Interactive Topology Canvas & Hardware Catalog Drawer */}
        <div className="flex-1 relative overflow-hidden">
          <TopologyCanvas
            nodes={topology.nodes}
            links={topology.links}
            nodePositions={nodePositions}
            onUpdatePosition={handleUpdatePosition}
            selectedNodeId={selectedNodeId}
            onSelectNode={handleSelectNode}
            activePacket={activePacket}
            onAddDevice={handleAddDevice}
            onDeleteNode={handleDeleteNode}
            onConnectLink={handleConnectLink}
            onToggleLink={handleToggleLink}
            onDeleteLink={handleDeleteLink}
            isCatalogOpen={isCatalogOpen}
            onToggleCatalog={() => setIsCatalogOpen((p) => !p)}
          />

          {/* Hardware Catalog Drawer (Šuplík se zařízeními) */}
          <DeviceCatalogDrawer
            isOpen={isCatalogOpen}
            onToggleOpen={() => setIsCatalogOpen((p) => !p)}
            onAddDevice={handleAddDevice}
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
            vendorMeta={nodeVendorMap[selectedNode.id]}
          />
        )}
      </div>

      {/* Wireshark-like Deep PDU Inspector Modal */}
      {selectedEventForPdu && (
        <PduInspectorModal
          event={selectedEventForPdu}
          onClose={() => setSelectedEventForPdu(null)}
        />
      )}

      {/* Auto-Grader Lab Challenge Modal */}
      <AutoGraderModal
        isOpen={isGraderModalOpen}
        onClose={() => setIsGraderModalOpen(false)}
        activeChallengeId={activeChallenge.id}
        onSelectChallenge={(ch) => {
          setActiveChallenge(ch);
          loadPreset(ch.preset);
        }}
        objectiveResults={objectiveResults}
        onResetPreset={(preset) => loadPreset(preset)}
      />
    </div>
    </ErrorBoundary>
  );
};
