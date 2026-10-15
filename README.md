# RouteCraft 🚀
> **Open-Source Discrete-Event Network Simulator & Multi-Vendor CLI Engine**  
> *A high-performance, lightweight, browser-native alternative to Cisco Packet Tracer.*

---

## 🌟 Overview

**RouteCraft** solves the fundamental dilemma of modern networking education:
- **Emulators** (GNS3, EVE-NG, Containerlab) run full virtual machines and containers, consuming dozens of gigabytes of RAM and requiring proprietary OS images.
- **Packet Tracer** is closed-source, limited to Cisco syntax, and historically tied to specific desktop builds.

**RouteCraft** runs a **deterministic discrete-event packet simulation (DES) engine entirely in memory**. It executes via **WebAssembly (Wasm)** in the browser or as a native desktop application via **Tauri**, starting in milliseconds and consuming less than 50 MB of RAM.

---

## ⚡ Key Highlights

- **Discrete-Event Simulation (DES) Core (Rust):**
  - Priority min-heap event scheduler with microsecond/millisecond timestamps.
  - Interactive timeline: **Play (Auto)**, **Pause**, and **Single-Step** execution.
  - **Educational Decision Logs:** Every frame step explains *why* a switch forwarded or dropped a frame (e.g. CAM lookup, VLAN tag mismatch) or *why* a router made a routing decision (Longest Prefix Match / ARP resolution).
- **Multi-Vendor CLI Engine:**
  - **Single Central State Tree:** OpenConfig/YANG-inspired unified data model (`DeviceState`).
  - **Bidirectional CLI Sync:** Configure on **Cisco IOS** (`ip address 192.168.1.1 255.255.255.0`), switch the vendor tab to **MikroTik RouterOS**, and see it reflected immediately in `/ip address print`!
  - Supports Cisco IOS command hierarchies (`UserExec`, `PrivilegedExec`, `GlobalConfig`, `InterfaceConfig`, `VlanConfig`).
- **L2 / L3 Protocol Support:**
  - **Ethernet II** framing with unicast and broadcast handling.
  - **IEEE 802.1Q VLANs:** Access ports, Trunk ports with Native VLANs, Allowed VLAN filtering, and Router-on-a-Stick (RoAS) sub-interfaces (`Gi0/0.10`).
  - **ARP:** Dynamic request/reply, gratuitous ARP, and ARP cache management.
  - **IPv4:** Longest Prefix Match (LPM) routing table (FIB), TTL decrement, subnets, and default gateways.
  - **ICMP:** Echo Request and Echo Reply ping mechanics.
- **Deep PDU Inspector (Wireshark-like View):**
  - Click any packet in the simulation queue to inspect all protocol layers:
    - Layer 1 (Physical timing & byte wire lengths)
    - Layer 2 Ethernet II & 802.1Q VLAN tag
    - Layer 3 ARP / IPv4 headers
    - Layer 4 ICMP control headers
    - Live Hexadecimal & Decoded ASCII Wire Byte Stream
- **Interactive Topology Canvas:**
  - Drag-and-drop device positioning.
  - Real-time animated flying packet envelopes.
  - Dynamic device addition (Routers, Switches, PCs).
  - Cable wiring tool with interface selector.
  - **Fault Injection:** One-click cable severing / reconnection (scissors tool) to test failover and link-down behavior.
- **Open Topology Format (`.onlab`):**
  - One-click JSON export and import for teachers and students.

---

## 🏛️ Architecture

```
┌────────────────────────────────────────────────────────┐
│               RouteCraft Web UI (React 19)             │
│   • Topology Canvas (SVG / Animations)                 │
│   • Interactive Drawer (CLI Terminal & Tables)         │
│   • Timeline & Decision Log                            │
│   • Wireshark PDU Inspector Modal                      │
└───────────────────────────▲────────────────────────────┘
                            │ Wasm Bindgen Bridge
┌───────────────────────────▼────────────────────────────┐
│                 crates/routecraft-wasm                 │
└───────────────────────────▲────────────────────────────┘
                            │
       ┌────────────────────┼────────────────────┐
       ▼                    ▼                    ▼
┌──────────────┐   ┌─────────────────┐   ┌──────────────┐
│routecraft-cli│   │routecraft-engine│   │routecraft-   │
│ • Cisco IOS  │   │ • Event Queue   │   │  protocols   │
│ • MikroTik   │   │ • Decision Logs │   │ • Ethernet   │
│ • Unified    │   │ • VLAN/RoAS     │   │ • 802.1Q     │
│   State Sync │   │ • Link Faults   │   │ • ARP/IPv4   │
└──────┬───────┘   └────────┬────────┘   └──────┬───────┘
       │                    │                   │
       └────────────────────┼───────────────────┘
                            ▼
               ┌──────────────────────────┐
               │     routecraft-core      │
               │  • DeviceState (RIB/CAM) │
               │  • Interface / Sub-Iface │
               │  • Mac & IP Primitives   │
               └──────────────────────────┘
```

---

## 🚀 Getting Started

### Prerequisites

- **Rust:** `1.80+` with `wasm32-unknown-unknown` target:
  ```bash
  rustup target add wasm32-unknown-unknown
  ```
- **wasm-pack:**
  ```bash
  cargo install wasm-pack
  ```
- **Node.js:** `v20+` and `npm`

---

### Building and Running Locally

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-org/RouteCraft.git
   cd RouteCraft
   ```

2. **Run Rust Workspace Unit Tests:**
   ```bash
   cargo test
   ```

3. **Build the WebAssembly Module:**
   ```bash
   wasm-pack build crates/routecraft-wasm --target web
   ```

4. **Install Web Dependencies & Run Frontend:**
   ```bash
   cd apps/web
   npm install
   npm run dev
   ```
   Open `http://localhost:3000/` in your browser!

---

## 🔬 Built-In Labs

1. **L2 Switch Network:** Two PCs on a local switch learning MAC addresses through ARP broadcast.
2. **L3 Router Network:** Cross-subnet routing between two distinct IP networks through an intermediate router with routing table lookups.
3. **802.1Q Inter-VLAN Routing (Router-on-a-Stick):**
   - Router `r1` with sub-interfaces `Gi0/0.10` and `Gi0/0.20`.
   - Switch `sw1` with `Fa0/1` as 802.1Q trunk, `Fa0/2` access VLAN 10 (Sales), `Fa0/3` access VLAN 20 (Engineering).
   - Test cross-VLAN ICMP pings and inspect tagged frames on the wire!
4. **Import/Export:** Load `labs/sample_enterprise_vlan.onlab` directly into the app using the Import button.

---

## 📄 License

Dual-licensed under MIT or Apache 2.0.
