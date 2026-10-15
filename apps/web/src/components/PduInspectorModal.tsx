import React, { useState } from 'react';
import { SimEventModel } from '../types/simulation';
import {
  X,
  ChevronDown,
  ChevronRight,
  Binary,
  Layers,
  ArrowRight,
  Shield,
  HelpCircle,
  Tag,
} from 'lucide-react';

interface Props {
  event: SimEventModel | null;
  onClose: () => void;
}

export const PduInspectorModal: React.FC<Props> = ({ event, onClose }) => {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    frame: true,
    ethernet: true,
    vlan: true,
    network: true,
    transport: true,
    decision: true,
    hexdump: true,
  });

  if (!event) return null;

  const toggleSection = (sec: string) => {
    setOpenSections((prev) => ({ ...prev, [sec]: !prev[sec] }));
  };

  const pdu = event.pdu;
  const eth = pdu?.ethernet;
  const arp = pdu?.arp;
  const ip = pdu?.ipv4;
  const icmp = pdu?.icmp;

  // Generate pseudo hex dump from the packet details for educational visual inspection
  const generateHexDump = () => {
    const bytes: number[] = [];

    // Destination MAC (6 bytes)
    if (eth) {
      const dst = eth.dst_mac.split(':').map((h) => parseInt(h, 16) || 0);
      bytes.push(...dst);
      const src = eth.src_mac.split(':').map((h) => parseInt(h, 16) || 0);
      bytes.push(...src);

      // Optional 802.1Q tag
      if (eth.vlan_tag) {
        bytes.push(0x81, 0x00);
        const tci = ((eth.vlan_tag.priority & 0x07) << 13) | (eth.vlan_tag.vlan_id & 0x0fff);
        bytes.push((tci >> 8) & 0xff, tci & 0xff);
      }

      if (arp) {
        bytes.push(0x08, 0x06); // ARP EtherType
        bytes.push(0x00, 0x01, 0x08, 0x00, 0x06, 0x04);
        bytes.push(0x00, arp.operation === 'Request' ? 0x01 : 0x02);
        const sMac = arp.sender_mac.split(':').map((h) => parseInt(h, 16) || 0);
        bytes.push(...sMac);
        const sIp = arp.sender_ip.split('.').map((d) => parseInt(d, 10) || 0);
        bytes.push(...sIp);
        const tMac = arp.target_mac.split(':').map((h) => parseInt(h, 16) || 0);
        bytes.push(...tMac);
        const tIp = arp.target_ip.split('.').map((d) => parseInt(d, 10) || 0);
        bytes.push(...tIp);
      } else if (ip) {
        bytes.push(0x08, 0x00); // IPv4 EtherType
        bytes.push(0x45, 0x00, 0x00, 0x3c); // Ver, IHL, DiffServ, Total Length
        bytes.push(0x1a, 0x2b, 0x00, 0x00); // Ident, Flags, Fragment offset
        bytes.push(ip.ttl, 0x01, 0xfa, 0x10); // TTL, Protocol (ICMP), Checksum
        const sIp = ip.src_ip.split('.').map((d) => parseInt(d, 10) || 0);
        bytes.push(...sIp);
        const dIp = ip.dst_ip.split('.').map((d) => parseInt(d, 10) || 0);
        bytes.push(...dIp);

        if (icmp) {
          const typeCode = icmp.icmp_type.includes('Request') ? 0x08 : 0x00;
          bytes.push(typeCode, icmp.code, 0x4d, 0x5a); // Type, Code, Checksum
          bytes.push((icmp.identifier >> 8) & 0xff, icmp.identifier & 0xff);
          bytes.push((icmp.sequence_number >> 8) & 0xff, icmp.sequence_number & 0xff);
          // 16 bytes of ping payload data
          for (let i = 0; i < Math.min(icmp.data_len || 16, 24); i++) {
            bytes.push(0x61 + (i % 26)); // 'a', 'b', 'c'...
          }
        }
      }
    }

    const rows: { offset: string; hex: string; ascii: string }[] = [];
    for (let i = 0; i < bytes.length; i += 16) {
      const slice = bytes.slice(i, i + 16);
      const offset = i.toString(16).padStart(4, '0');
      const hexParts = slice.map((b) => b.toString(16).padStart(2, '0'));
      const hex = hexParts.join(' ');
      const ascii = slice
        .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.'))
        .join('');
      rows.push({
        offset,
        hex: hex.padEnd(48, ' '),
        ascii,
      });
    }

    return { totalBytes: bytes.length, rows };
  };

  const hexData = generateHexDump();

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-[880px] max-w-[95vw] max-h-[90vh] bg-[#0E1524] border border-gray-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="h-16 px-6 border-b border-gray-800 bg-[#0F172A] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-900/40 border border-blue-700/50 rounded-xl text-blue-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-100">PDU Inspector (Wireshark View)</h2>
                <span className="text-xs px-2 py-0.5 rounded bg-blue-900/60 text-blue-300 font-mono font-medium">
                  Packet #{event.id}
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-gray-800 text-slate-300 font-mono">
                  {event.time} ms
                </span>
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5 font-mono">
                <span>{event.source_node}</span>
                <span className="text-slate-500">({event.source_port})</span>
                <ArrowRight className="w-3.5 h-3.5 text-blue-400 inline" />
                <span>{event.target_node}</span>
                <span className="text-slate-500">({event.target_port})</span>
                <span className="text-slate-600">•</span>
                <span className="text-cyan-400 font-semibold">{event.protocol}</span>
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

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs font-mono">
          {/* Protocol Tree Section */}
          <div className="space-y-3">
            {/* 1. Frame Summary */}
            <div className="border border-gray-800 rounded-xl bg-[#131B2E] overflow-hidden">
              <button
                onClick={() => toggleSection('frame')}
                className="w-full px-4 py-2.5 flex items-center justify-between bg-[#172138] hover:bg-[#1C2844] text-slate-200 transition-colors text-left"
              >
                <div className="flex items-center gap-2 font-semibold">
                  {openSections.frame ? <ChevronDown className="w-4 h-4 text-blue-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  <span>Frame Details ({hexData.totalBytes} bytes on wire)</span>
                </div>
                <span className="text-[11px] text-slate-400">Layer 1 Physical Simulation</span>
              </button>

              {openSections.frame && (
                <div className="p-3.5 space-y-1.5 text-slate-300 text-[11px] bg-[#0A0F1D]/70 divide-y divide-gray-800/50">
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Arrival Time:</span>
                    <span className="text-slate-200 font-medium">{event.time} ms</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Ingress / Egress Port:</span>
                    <span className="text-slate-200 font-medium">
                      {event.source_node}:{event.source_port} ➔ {event.target_node}:{event.target_port}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Frame Length:</span>
                    <span className="text-slate-200 font-medium">{hexData.totalBytes} bytes ({hexData.totalBytes * 8} bits)</span>
                  </div>
                </div>
              )}
            </div>

            {/* 2. Ethernet II (L2) */}
            {eth && (
              <div className="border border-gray-800 rounded-xl bg-[#131B2E] overflow-hidden">
                <button
                  onClick={() => toggleSection('ethernet')}
                  className="w-full px-4 py-2.5 flex items-center justify-between bg-[#172138] hover:bg-[#1C2844] text-slate-200 transition-colors text-left"
                >
                  <div className="flex items-center gap-2 font-semibold">
                    {openSections.ethernet ? <ChevronDown className="w-4 h-4 text-indigo-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                    <span>Ethernet II, Src: {eth.src_mac}, Dst: {eth.dst_mac}</span>
                  </div>
                  <span className="text-[11px] text-indigo-400 font-medium">Layer 2 Data Link</span>
                </button>

                {openSections.ethernet && (
                  <div className="p-3.5 space-y-1.5 text-slate-300 text-[11px] bg-[#0A0F1D]/70 divide-y divide-gray-800/50">
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">Destination MAC:</span>
                      <span className="text-indigo-300 font-bold">{eth.dst_mac}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">Source MAC:</span>
                      <span className="text-cyan-300 font-bold">{eth.src_mac}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">EtherType:</span>
                      <span className="text-slate-200 font-medium">{eth.ethertype}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 802.1Q VLAN Tag (if present) */}
            {eth?.vlan_tag && (
              <div className="border border-purple-900/50 rounded-xl bg-[#16122C] overflow-hidden">
                <button
                  onClick={() => toggleSection('vlan')}
                  className="w-full px-4 py-2.5 flex items-center justify-between bg-[#211A42] hover:bg-[#282050] text-purple-200 transition-colors text-left"
                >
                  <div className="flex items-center gap-2 font-semibold">
                    {openSections.vlan ? <ChevronDown className="w-4 h-4 text-purple-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                    <span className="flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-purple-400" />
                      802.1Q Virtual LAN, Pri: {eth.vlan_tag.priority}, VLAN ID: {eth.vlan_tag.vlan_id}
                    </span>
                  </div>
                  <span className="text-[11px] text-purple-400 font-medium">IEEE 802.1Q Trunk Tag</span>
                </button>

                {openSections.vlan && (
                  <div className="p-3.5 space-y-1.5 text-slate-300 text-[11px] bg-[#0F0B1E]/70 divide-y divide-purple-900/30">
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">TPID (Tag Protocol Identifier):</span>
                      <span className="text-purple-300 font-mono">0x8100</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">Priority Code Point (PCP / CoS):</span>
                      <span className="text-slate-200 font-mono">{eth.vlan_tag.priority} (Best Effort)</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">VLAN Identifier (VID):</span>
                      <span className="text-purple-400 font-bold font-mono text-xs">
                        {eth.vlan_tag.vlan_id}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 3. ARP Protocol (L3) */}
            {arp && (
              <div className="border border-emerald-900/50 rounded-xl bg-[#0D1F1C] overflow-hidden">
                <button
                  onClick={() => toggleSection('network')}
                  className="w-full px-4 py-2.5 flex items-center justify-between bg-[#122A26] hover:bg-[#183631] text-emerald-200 transition-colors text-left"
                >
                  <div className="flex items-center gap-2 font-semibold">
                    {openSections.network ? <ChevronDown className="w-4 h-4 text-emerald-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                    <span>Address Resolution Protocol ({arp.operation})</span>
                  </div>
                  <span className="text-[11px] text-emerald-400 font-medium">Layer 3 ARP</span>
                </button>

                {openSections.network && (
                  <div className="p-3.5 space-y-1.5 text-slate-300 text-[11px] bg-[#071311]/70 divide-y divide-emerald-900/30">
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">Opcode:</span>
                      <span className="text-emerald-300 font-bold">
                        {arp.operation} ({arp.operation === 'Request' ? '1' : '2'})
                      </span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">Sender MAC Address:</span>
                      <span className="text-slate-200 font-mono">{arp.sender_mac}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">Sender IPv4 Address:</span>
                      <span className="text-emerald-400 font-bold font-mono">{arp.sender_ip}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">Target MAC Address:</span>
                      <span className="text-slate-200 font-mono">{arp.target_mac}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">Target IPv4 Address:</span>
                      <span className="text-emerald-400 font-bold font-mono">{arp.target_ip}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 4. IPv4 Protocol (L3) */}
            {ip && (
              <div className="border border-cyan-900/50 rounded-xl bg-[#0D1E2A] overflow-hidden">
                <button
                  onClick={() => toggleSection('network')}
                  className="w-full px-4 py-2.5 flex items-center justify-between bg-[#122A3A] hover:bg-[#183549] text-cyan-200 transition-colors text-left"
                >
                  <div className="flex items-center gap-2 font-semibold">
                    {openSections.network ? <ChevronDown className="w-4 h-4 text-cyan-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                    <span>Internet Protocol Version 4, Src: {ip.src_ip}, Dst: {ip.dst_ip}</span>
                  </div>
                  <span className="text-[11px] text-cyan-400 font-medium">Layer 3 Network</span>
                </button>

                {openSections.network && (
                  <div className="p-3.5 space-y-1.5 text-slate-300 text-[11px] bg-[#07131B]/70 divide-y divide-cyan-900/30">
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">Source IP Address:</span>
                      <span className="text-cyan-300 font-bold font-mono">{ip.src_ip}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">Destination IP Address:</span>
                      <span className="text-indigo-300 font-bold font-mono">{ip.dst_ip}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">Protocol:</span>
                      <span className="text-slate-200 font-mono">{ip.protocol}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">Time to Live (TTL):</span>
                      <span className="text-amber-400 font-bold font-mono">{ip.ttl}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 5. ICMP Protocol (L4) */}
            {icmp && (
              <div className="border border-amber-900/50 rounded-xl bg-[#261C0E] overflow-hidden">
                <button
                  onClick={() => toggleSection('transport')}
                  className="w-full px-4 py-2.5 flex items-center justify-between bg-[#362714] hover:bg-[#45321A] text-amber-200 transition-colors text-left"
                >
                  <div className="flex items-center gap-2 font-semibold">
                    {openSections.transport ? <ChevronDown className="w-4 h-4 text-amber-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                    <span>Internet Control Message Protocol ({icmp.icmp_type})</span>
                  </div>
                  <span className="text-[11px] text-amber-400 font-medium">Layer 4 Control</span>
                </button>

                {openSections.transport && (
                  <div className="p-3.5 space-y-1.5 text-slate-300 text-[11px] bg-[#140E07]/70 divide-y divide-amber-900/30">
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">Type / Message:</span>
                      <span className="text-amber-300 font-bold">{icmp.icmp_type}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">Code:</span>
                      <span className="text-slate-200 font-mono">{icmp.code}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">Identifier (BE / LE):</span>
                      <span className="text-slate-200 font-mono">0x{icmp.identifier.toString(16).padStart(4, '0')} ({icmp.identifier})</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">Sequence Number:</span>
                      <span className="text-cyan-400 font-bold font-mono">{icmp.sequence_number}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">Payload Data Length:</span>
                      <span className="text-slate-200 font-mono">{icmp.data_len} bytes</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 6. Discrete-Event Decision Traces */}
            {event.decision_log.length > 0 && (
              <div className="border border-blue-900/50 rounded-xl bg-[#0F172A] overflow-hidden">
                <button
                  onClick={() => toggleSection('decision')}
                  className="w-full px-4 py-2.5 flex items-center justify-between bg-[#1E293B] hover:bg-[#25334A] text-blue-200 transition-colors text-left"
                >
                  <div className="flex items-center gap-2 font-semibold">
                    {openSections.decision ? <ChevronDown className="w-4 h-4 text-blue-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                    <span className="flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-blue-400" />
                      Discrete Decision Trace ({event.decision_log.length} steps)
                    </span>
                  </div>
                  <span className="text-[11px] text-blue-400 font-medium">Educational Simulation Log</span>
                </button>

                {openSections.decision && (
                  <div className="p-3.5 space-y-1.5 text-slate-300 text-[11px] bg-[#0A0E1A]/80">
                    {event.decision_log.map((log, i) => (
                      <div key={i} className="flex items-start gap-2 py-0.5">
                        <span className="text-blue-500 font-bold select-none">{i + 1}.</span>
                        <span className="leading-relaxed">{log}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 7. Hex Dump View */}
            <div className="border border-gray-800 rounded-xl bg-[#111827] overflow-hidden">
              <button
                onClick={() => toggleSection('hexdump')}
                className="w-full px-4 py-2.5 flex items-center justify-between bg-[#1F2937] hover:bg-[#2A374A] text-slate-200 transition-colors text-left"
              >
                <div className="flex items-center gap-2 font-semibold">
                  {openSections.hexdump ? <ChevronDown className="w-4 h-4 text-slate-300" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  <span className="flex items-center gap-1.5">
                    <Binary className="w-3.5 h-3.5 text-slate-400" />
                    Hexadecimal & ASCII Packet Stream ({hexData.totalBytes} bytes)
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 font-medium">Raw Wire Bytes</span>
              </button>

              {openSections.hexdump && (
                <div className="p-3.5 bg-[#0A0D14] overflow-x-auto text-[11px] font-mono leading-tight">
                  <div className="text-slate-500 mb-2 border-b border-gray-800 pb-1 flex">
                    <span className="w-16">Offset</span>
                    <span className="flex-1">00 01 02 03 04 05 06 07  08 09 0A 0B 0C 0D 0E 0F</span>
                    <span className="w-40 text-right">Decoded ASCII</span>
                  </div>
                  {hexData.rows.map((row, idx) => (
                    <div key={idx} className="flex hover:bg-gray-800/40 py-0.5 rounded px-1">
                      <span className="w-16 text-slate-500">{row.offset}</span>
                      <span className="flex-1 text-slate-300 tracking-wider">{row.hex}</span>
                      <span className="w-40 text-cyan-400/90 text-right font-semibold">{row.ascii}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="h-14 px-6 border-t border-gray-800 bg-[#0F172A] flex items-center justify-between">
          <p className="text-xs text-slate-400 flex items-center gap-1.5 font-sans">
            <HelpCircle className="w-4 h-4 text-blue-400" />
            Click any protocol header above to expand or collapse fields.
          </p>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-colors"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
