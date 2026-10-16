import React, { useState, useEffect, useRef } from 'react';
import { NodeModel, NodeTablesModel, CliResultModel } from '../types/simulation';
import { NodeVendorMeta, resolveNodeVendorMeta } from '../types/devices';
import { Terminal, Network, Table, X, Lock } from 'lucide-react';

interface Props {
  node: NodeModel | null;
  tables: NodeTablesModel | null;
  onClose: () => void;
  onExecuteCli: (nodeId: string, vendor: string, command: string) => CliResultModel | null;
  onGetPrompt: (nodeId: string, vendor: string) => string;
  onToggleInterface: (nodeId: string, ifaceName: string, up: boolean) => void;
  vendorMeta?: NodeVendorMeta;
  preferredVendor?: 'cisco' | 'mikrotik' | 'linux';
}

export const DeviceDrawer: React.FC<Props> = ({
  node,
  tables,
  onClose,
  onExecuteCli,
  onGetPrompt,
  onToggleInterface,
  vendorMeta,
  preferredVendor,
}) => {
  const effectiveVendorMeta = node
    ? resolveNodeVendorMeta(node.id, node.hostname, node.device_type, vendorMeta)
    : undefined;

  const isLocked = effectiveVendorMeta?.isLocked ?? false;
  const lockedCliVendor = effectiveVendorMeta?.cliVendor ?? preferredVendor ?? 'cisco';

  const [activeTab, setActiveTab] = useState<'cli' | 'interfaces' | 'tables'>('cli');
  const [vendor, setVendor] = useState<'cisco' | 'mikrotik' | 'linux'>(
    isLocked ? lockedCliVendor : (preferredVendor || (node?.device_type === 'host' ? 'linux' : 'cisco'))
  );
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [inputVal, setInputVal] = useState('');
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  const [prompt, setPrompt] = useState('> ');
  const terminalBottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Update vendor when selected node or vendor metadata changes
  useEffect(() => {
    if (node && effectiveVendorMeta) {
      if (effectiveVendorMeta.isLocked) {
        setVendor(effectiveVendorMeta.cliVendor);
      } else if (preferredVendor) {
        setVendor(preferredVendor);
      }
    }
  }, [node?.id, effectiveVendorMeta?.cliVendor, effectiveVendorMeta?.isLocked, preferredVendor]);

  // Update prompt and reset state when selected node or vendor changes
  useEffect(() => {
    if (node) {
      const activeVendor = isLocked ? lockedCliVendor : vendor;
      const p = onGetPrompt(node.id, activeVendor);
      setPrompt(p);
      setTerminalOutput([
        `Connected to ${node.hostname} (${node.device_type.toUpperCase()})`,
        effectiveVendorMeta?.modelName ? `Model: ${effectiveVendorMeta.modelName}` : '',
        isLocked
          ? `Hardware vendor: ${effectiveVendorMeta?.vendorName} [LOCKED NATIVE CLI]`
          : `Vendor emulation mode: ${vendor.toUpperCase()} (Multi-Vendor Unlocked)`,
        activeVendor === 'linux'
          ? `Type 'help', 'ip a', 'ip route', or 'hostname' to inspect/configure.`
          : activeVendor === 'cisco'
          ? `Type '?' for help, 'show ip int brief' or 'configure terminal'.`
          : `Type '/ip address print', '/ip route print', or '/export'.`,
        '',
      ].filter(Boolean));
      setHistory([]);
      setHistoryIndex(-1);
      setInputVal('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [node?.id, vendor, isLocked, lockedCliVendor]);

  const handleVendorSelect = (newVendor: 'cisco' | 'mikrotik' | 'linux') => {
    if (isLocked) {
      return; // Disallow switching CLI for vendored devices!
    }
    setVendor(newVendor);
  };

  useEffect(() => {
    terminalBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [terminalOutput]);

  if (!node) return null;

  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = inputVal.trim();
    if (!cmd) {
      setTerminalOutput((prev) => [...prev, `${prompt}`]);
      return;
    }

    const res = onExecuteCli(node.id, vendor, cmd);
    const newPrompt = res?.prompt || onGetPrompt(node.id, vendor);
    setPrompt(newPrompt);

    setTerminalOutput((prev) => [
      ...prev,
      `${prompt}${cmd}`,
      ...(res?.output ? res.output.split('\n') : []),
    ]);

    setHistory((prev) => [...prev, cmd]);
    setHistoryIndex(-1);
    setInputVal('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const nextIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIndex);
      setInputVal(history[nextIndex]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex === -1) return;
      const nextIndex = historyIndex + 1;
      if (nextIndex >= history.length) {
        setHistoryIndex(-1);
        setInputVal('');
      } else {
        setHistoryIndex(nextIndex);
        setInputVal(history[nextIndex]);
      }
    }
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      className="absolute right-0 top-0 bottom-0 w-[540px] bg-[#111827] border-l border-gray-800 shadow-2xl flex flex-col z-40"
    >
      {/* Drawer Header */}
      <div className="h-14 border-b border-gray-800 px-4 flex items-center justify-between bg-[#0F172A]">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2 truncate">
            <span className="truncate">{node.hostname}</span>
            <span className="text-xs px-2 py-0.5 rounded bg-blue-900/60 text-blue-300 uppercase font-mono shrink-0">
              {node.device_type}
            </span>
            {effectiveVendorMeta?.modelName && (
              <span className="hidden md:inline-block text-[11px] px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/60 text-slate-300 font-normal truncate max-w-[150px]">
                {effectiveVendorMeta.modelName}
              </span>
            )}
          </h2>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Vendor Lock Indicator Badge */}
          {isLocked && effectiveVendorMeta && (
            <div
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-950/70 border border-amber-600/50 text-amber-300 text-xs select-none shadow-sm"
              title={`Zařízení ${effectiveVendorMeta.modelName} od výrobce ${effectiveVendorMeta.vendorName} má pevně uzamčené nativní CLI.`}
            >
              <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="font-semibold truncate max-w-[120px]">{effectiveVendorMeta.vendorName}</span>
              <span className="text-[10px] uppercase font-mono px-1 py-0.5 rounded bg-amber-900/80 text-amber-200">
                LOCKED
              </span>
            </div>
          )}

          {/* Vendor Selector */}
          <div className="flex bg-[#1E293B] rounded-lg p-0.5 border border-gray-700">
            {/* Cisco IOS Button */}
            <button
              disabled={isLocked && lockedCliVendor !== 'cisco'}
              onClick={() => handleVendorSelect('cisco')}
              title={
                isLocked && lockedCliVendor !== 'cisco'
                  ? `Přepnutí na Cisco CLI je u zařízení od ${effectiveVendorMeta?.vendorName} zakázáno (použijte nativní CLI)`
                  : 'Cisco IOS CLI'
              }
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
                vendor === 'cisco'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : isLocked
                  ? 'text-slate-500 opacity-35 cursor-not-allowed line-through'
                  : 'text-slate-400 hover:text-slate-200 cursor-pointer'
              }`}
            >
              {isLocked && lockedCliVendor === 'cisco' && <Lock className="w-3 h-3 text-cyan-200" />}
              <span>
                {isLocked && effectiveVendorMeta?.vendorId === 'microsens'
                  ? 'MICROSENS'
                  : isLocked && effectiveVendorMeta?.vendorId === 'edgecore'
                  ? 'Edgecore'
                  : 'Cisco IOS'}
              </span>
            </button>

            {/* MikroTik Button */}
            <button
              disabled={isLocked && lockedCliVendor !== 'mikrotik'}
              onClick={() => handleVendorSelect('mikrotik')}
              title={
                isLocked && lockedCliVendor !== 'mikrotik'
                  ? `Přepnutí na MikroTik CLI je u zařízení od ${effectiveVendorMeta?.vendorName} zakázáno (použijte nativní CLI)`
                  : 'MikroTik RouterOS CLI'
              }
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
                vendor === 'mikrotik'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : isLocked
                  ? 'text-slate-500 opacity-35 cursor-not-allowed line-through'
                  : 'text-slate-400 hover:text-slate-200 cursor-pointer'
              }`}
            >
              {isLocked && lockedCliVendor === 'mikrotik' && <Lock className="w-3 h-3 text-rose-200" />}
              <span>MikroTik</span>
            </button>

            {/* Linux Button */}
            <button
              disabled={isLocked && lockedCliVendor !== 'linux'}
              onClick={() => handleVendorSelect('linux')}
              title={
                isLocked && lockedCliVendor !== 'linux'
                  ? `Přepnutí na Linux CLI je u zařízení od ${effectiveVendorMeta?.vendorName} zakázáno (použijte nativní CLI)`
                  : 'Linux Shell'
              }
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
                vendor === 'linux'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : isLocked
                  ? 'text-slate-500 opacity-35 cursor-not-allowed line-through'
                  : 'text-slate-400 hover:text-slate-200 cursor-pointer'
              }`}
            >
              {isLocked && lockedCliVendor === 'linux' && <Lock className="w-3 h-3 text-amber-200" />}
              <span>
                {isLocked && effectiveVendorMeta?.vendorId === 'edgecore'
                  ? 'SONiC'
                  : 'Linux'}
              </span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-gray-800 cursor-pointer"
            title="Zavřít panel (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-800 bg-[#0D1526] px-4 gap-4">
        <button
          onClick={() => setActiveTab('cli')}
          className={`py-2.5 text-xs font-medium border-b-2 flex items-center gap-1.5 transition-colors ${
            activeTab === 'cli'
              ? 'border-blue-500 text-blue-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          CLI Terminal
        </button>
        <button
          onClick={() => setActiveTab('interfaces')}
          className={`py-2.5 text-xs font-medium border-b-2 flex items-center gap-1.5 transition-colors ${
            activeTab === 'interfaces'
              ? 'border-blue-500 text-blue-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Network className="w-3.5 h-3.5" />
          Interfaces ({node.interfaces.length})
        </button>
        <button
          onClick={() => setActiveTab('tables')}
          className={`py-2.5 text-xs font-medium border-b-2 flex items-center gap-1.5 transition-colors ${
            activeTab === 'tables'
              ? 'border-blue-500 text-blue-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Table className="w-3.5 h-3.5" />
          State Tables (CAM/ARP/RIB)
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* CLI Terminal Tab */}
        {activeTab === 'cli' && (
          <div className="flex-1 bg-[#090D16] p-4 font-mono-code text-xs flex flex-col overflow-hidden">
            {/* Scrollable output area */}
            <div className="flex-1 overflow-y-auto space-y-1 pr-1 text-slate-300">
              {terminalOutput.map((line, idx) => (
                <div key={idx} className="whitespace-pre-wrap leading-relaxed">
                  {line}
                </div>
              ))}
              <div ref={terminalBottomRef} />
            </div>

            {/* Quick command buttons */}
            <div className="pt-2 pb-1 border-t border-gray-800/80 flex flex-wrap gap-1.5">
              {vendor === 'cisco' ? (
                <>
                  <button
                    onClick={() => setInputVal('enable')}
                    className="px-2 py-0.5 text-[10px] bg-gray-800 hover:bg-gray-700 text-slate-300 rounded font-mono"
                  >
                    enable
                  </button>
                  <button
                    onClick={() => setInputVal('conf t')}
                    className="px-2 py-0.5 text-[10px] bg-gray-800 hover:bg-gray-700 text-slate-300 rounded font-mono"
                  >
                    conf t
                  </button>
                  <button
                    onClick={() => setInputVal('sh ip int br')}
                    className="px-2 py-0.5 text-[10px] bg-gray-800 hover:bg-gray-700 text-slate-300 rounded font-mono"
                  >
                    sh ip int br
                  </button>
                  <button
                    onClick={() => setInputVal('show run')}
                    className="px-2 py-0.5 text-[10px] bg-gray-800 hover:bg-gray-700 text-slate-300 rounded font-mono"
                  >
                    show run
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setInputVal('/ip address print')}
                    className="px-2 py-0.5 text-[10px] bg-gray-800 hover:bg-gray-700 text-slate-300 rounded font-mono"
                  >
                    /ip address print
                  </button>
                  <button
                    onClick={() => setInputVal('/ip route print')}
                    className="px-2 py-0.5 text-[10px] bg-gray-800 hover:bg-gray-700 text-slate-300 rounded font-mono"
                  >
                    /ip route print
                  </button>
                  <button
                    onClick={() => setInputVal('/export')}
                    className="px-2 py-0.5 text-[10px] bg-gray-800 hover:bg-gray-700 text-slate-300 rounded font-mono"
                  >
                    /export
                  </button>
                </>
              )}
            </div>

            {/* Command input row */}
            <form onSubmit={handleCommandSubmit} className="flex items-center gap-1 pt-1.5">
              <span className="text-cyan-400 font-bold whitespace-nowrap">{prompt}</span>
              <input
                ref={inputRef}
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 bg-transparent text-slate-100 outline-none font-mono-code text-xs"
                placeholder="type command..."
                autoFocus
              />
            </form>
          </div>
        )}

        {/* Interfaces Tab */}
        {activeTab === 'interfaces' && (
          <div className="flex-1 p-4 overflow-y-auto space-y-3">
            {node.interfaces.map((iface) => {
              const isUp = iface.admin_status === 'up';
              return (
                <div
                  key={iface.name}
                  className="bg-[#1E293B]/70 border border-gray-700/60 rounded-xl p-3.5 flex items-center justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-200">{iface.name}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-medium ${
                          isUp
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-rose-950 text-rose-400 border border-rose-800'
                        }`}
                      >
                        {iface.admin_status}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400 font-mono">
                      <span>IP: </span>
                      <span className="text-slate-200 font-semibold">{iface.ip || 'unassigned'}</span>
                    </div>

                    {iface.switchport_mode && iface.switchport_mode !== 'routed' && (
                      <div className="text-[10px] text-purple-300 font-mono">
                        Mode: <span className="font-semibold">{iface.switchport_mode}</span>
                      </div>
                    )}

                    {iface.encapsulation_vlan && (
                      <div className="text-[10px] text-purple-400 font-mono font-semibold">
                        Encapsulation: 802.1Q (VLAN {iface.encapsulation_vlan})
                      </div>
                    )}

                    <div className="text-[10px] text-slate-500 font-mono">
                      MAC: {iface.mac}
                    </div>
                  </div>

                  <button
                    onClick={() => onToggleInterface(node.id, iface.name, !isUp)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      isUp
                        ? 'bg-rose-600/80 hover:bg-rose-600 text-white'
                        : 'bg-emerald-600/80 hover:bg-emerald-600 text-white'
                    }`}
                  >
                    {isUp ? 'Shutdown' : 'No Shutdown'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* State Tables Tab */}
        {activeTab === 'tables' && (
          <div className="flex-1 p-4 overflow-y-auto space-y-6 text-xs">
            {/* VLAN Database */}
            {tables?.vlans && tables.vlans.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-slate-200 mb-2 flex items-center gap-2">
                  <Table className="w-3.5 h-3.5 text-purple-400" />
                  VLAN Database (802.1Q)
                </h3>
                <div className="bg-[#1E293B]/60 rounded-lg overflow-hidden border border-gray-700/60">
                  <table className="w-full font-mono text-[11px] text-left">
                    <thead className="bg-gray-800/60 text-slate-400">
                      <tr>
                        <th className="p-2">VLAN ID</th>
                        <th className="p-2">Name</th>
                        <th className="p-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {tables.vlans.map((v) => (
                        <tr key={v.id}>
                          <td className="p-2 text-purple-300 font-bold">{v.id}</td>
                          <td className="p-2 text-slate-200">{v.name}</td>
                          <td className="p-2 text-emerald-400">active</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* CAM Table (Switches) */}
            <div>
              <h3 className="text-xs font-semibold text-slate-200 mb-2 flex items-center gap-2">
                <Table className="w-3.5 h-3.5 text-indigo-400" />
                CAM / MAC Address Table (Switching)
              </h3>
              {tables?.mac_table && tables.mac_table.length > 0 ? (
                <div className="bg-[#1E293B]/60 rounded-lg overflow-hidden border border-gray-700/60">
                  <table className="w-full font-mono text-[11px] text-left">
                    <thead className="bg-gray-800/60 text-slate-400">
                      <tr>
                        <th className="p-2">MAC Address</th>
                        <th className="p-2">Port</th>
                        <th className="p-2">VLAN</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {tables.mac_table.map((m, i) => (
                        <tr key={i}>
                          <td className="p-2 text-slate-200">{m.mac}</td>
                          <td className="p-2 text-cyan-400">{m.port}</td>
                          <td className="p-2 text-slate-400">{m.vlan}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-slate-500 text-xs italic">CAM table is currently empty.</p>
              )}
            </div>

            {/* ARP Table */}
            <div>
              <h3 className="text-xs font-semibold text-slate-200 mb-2 flex items-center gap-2">
                <Table className="w-3.5 h-3.5 text-emerald-400" />
                ARP Cache Table (L3 ↔ L2 Resolution)
              </h3>
              {tables?.arp_table && tables.arp_table.length > 0 ? (
                <div className="bg-[#1E293B]/60 rounded-lg overflow-hidden border border-gray-700/60">
                  <table className="w-full font-mono text-[11px] text-left">
                    <thead className="bg-gray-800/60 text-slate-400">
                      <tr>
                        <th className="p-2">IP Address</th>
                        <th className="p-2">MAC Address</th>
                        <th className="p-2">Interface</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {tables.arp_table.map((a, i) => (
                        <tr key={i}>
                          <td className="p-2 text-emerald-400 font-semibold">{a.ip}</td>
                          <td className="p-2 text-slate-200">{a.mac}</td>
                          <td className="p-2 text-slate-400">{a.interface}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-slate-500 text-xs italic">No ARP entries resolved yet.</p>
              )}
            </div>

            {/* Routing Table */}
            <div>
              <h3 className="text-xs font-semibold text-slate-200 mb-2 flex items-center gap-2">
                <Table className="w-3.5 h-3.5 text-cyan-400" />
                Routing Table (FIB / LPM)
              </h3>
              {tables?.routing_table && tables.routing_table.length > 0 ? (
                <div className="bg-[#1E293B]/60 rounded-lg overflow-hidden border border-gray-700/60">
                  <table className="w-full font-mono text-[11px] text-left">
                    <thead className="bg-gray-800/60 text-slate-400">
                      <tr>
                        <th className="p-2">Prefix</th>
                        <th className="p-2">Next Hop</th>
                        <th className="p-2">Interface</th>
                        <th className="p-2">Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {tables.routing_table.map((r, i) => (
                        <tr key={i}>
                          <td className="p-2 text-cyan-400 font-semibold">{r.prefix}</td>
                          <td className="p-2 text-slate-300">{r.next_hop || 'Direct'}</td>
                          <td className="p-2 text-slate-300">{r.interface}</td>
                          <td className="p-2 text-slate-400">{r.route_type}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-slate-500 text-xs italic">No routes present.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
