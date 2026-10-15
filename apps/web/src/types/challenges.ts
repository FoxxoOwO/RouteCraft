import { TopologyModel, SimEventModel } from './simulation';

export interface ChallengeObjective {
  id: string;
  title: string;
  description: string;
  points: number;
  hint: {
    cisco?: string;
    mikrotik?: string;
    linux?: string;
  };
}

export interface ChallengeDefinition {
  id: string;
  title: string;
  category: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  description: string;
  preset: 'basic' | 'routed' | 'vlan';
  objectives: ChallengeObjective[];
  evaluator: (topology: TopologyModel, events: SimEventModel[]) => Record<string, boolean>;
}

export const LAB_CHALLENGES: ChallengeDefinition[] = [
  {
    id: 'ccna_static_routing',
    title: 'Lab 1: Cross-Subnet Gateway & Static Routing',
    category: 'CCNA Routing',
    difficulty: 'Beginner',
    description:
      'Configure Router-1 to bridge traffic between Subnet A (192.168.1.0/24) and Subnet B (192.168.2.0/24). Bring interfaces up and establish end-to-end ping connectivity.',
    preset: 'routed',
    objectives: [
      {
        id: 'r1_gi0_ip',
        title: 'Configure R1 Gi0/0 Gateway',
        description: 'Assign IP 192.168.1.1/24 to interface Gi0/0 on Router-1 and bring it up.',
        points: 25,
        hint: {
          cisco: 'interface Gi0/0\nip address 192.168.1.1 255.255.255.0\nno shutdown',
          mikrotik: '/ip address add address=192.168.1.1/24 interface=Gi0/0',
          linux: 'ip addr add 192.168.1.1/24 dev Gi0/0\nip link set Gi0/0 up',
        },
      },
      {
        id: 'r1_gi1_ip',
        title: 'Configure R1 Gi0/1 Gateway',
        description: 'Assign IP 192.168.2.1/24 to interface Gi0/1 on Router-1 and bring it up.',
        points: 25,
        hint: {
          cisco: 'interface Gi0/1\nip address 192.168.2.1 255.255.255.0\nno shutdown',
          mikrotik: '/ip address add address=192.168.2.1/24 interface=Gi0/1',
          linux: 'ip addr add 192.168.2.1/24 dev Gi0/1\nip link set Gi0/1 up',
        },
      },
      {
        id: 'pc_default_routes',
        title: 'Configure PC Default Gateways',
        description: 'Ensure PC-1 has default gateway 192.168.1.1 and PC-2 has default gateway 192.168.2.1.',
        points: 25,
        hint: {
          cisco: 'ip route 0.0.0.0 0.0.0.0 192.168.1.1',
          mikrotik: '/ip route add dst-address=0.0.0.0/0 gateway=192.168.1.1',
          linux: 'ip route add default via 192.168.1.1',
        },
      },
      {
        id: 'ping_success',
        title: 'Verify End-to-End ICMP Reachability',
        description: 'Send a ping from PC-1 to PC-2 (192.168.2.20) and achieve successful ICMP reply.',
        points: 25,
        hint: {
          cisco: 'Use Quick Ping in top bar or ping 192.168.2.20 from PC-1 CLI',
        },
      },
    ],
    evaluator: (topology, events) => {
      const results: Record<string, boolean> = {};

      const r1 = topology.nodes.find((n) => n.id === 'r1');
      const gi0 = r1?.interfaces.find((i) => i.name.toLowerCase() === 'gi0/0');
      const gi1 = r1?.interfaces.find((i) => i.name.toLowerCase() === 'gi0/1');

      results['r1_gi0_ip'] =
        gi0?.ip?.startsWith('192.168.1.1') === true && gi0?.admin_status === 'up';

      results['r1_gi1_ip'] =
        gi1?.ip?.startsWith('192.168.2.1') === true && gi1?.admin_status === 'up';

      const pc1 = topology.nodes.find((n) => n.id === 'pc1');
      const pc2 = topology.nodes.find((n) => n.id === 'pc2');
      results['pc_default_routes'] =
        (pc1?.interfaces[0]?.ip !== null) && (pc2?.interfaces[0]?.ip !== null);

      results['ping_success'] = events.some(
        (ev) =>
          ev.protocol === 'ICMP' &&
          ev.source_node === 'r1' &&
          (ev.target_node === 'pc2' || ev.target_node === 'pc1')
      );

      return results;
    },
  },
  {
    id: 'vlan_trunking_challenge',
    title: 'Lab 2: 802.1Q Inter-VLAN Routing (RoAS)',
    category: 'CCNA Switching',
    difficulty: 'Intermediate',
    description:
      'Segment your network into Sales (VLAN 10) and Engineering (VLAN 20). Configure an 802.1Q trunk link and sub-interfaces on Router-1 to route traffic between isolated VLANs.',
    preset: 'vlan',
    objectives: [
      {
        id: 'trunk_configured',
        title: 'Configure Switch Trunk Port',
        description: 'Set Switch-1 port Fa0/1 to 802.1Q Trunk mode.',
        points: 25,
        hint: {
          cisco: 'interface Fa0/1\nswitchport mode trunk',
          mikrotik: '/interface ethernet set Fa0/1 mode=trunk',
        },
      },
      {
        id: 'access_ports_assigned',
        title: 'Assign Access Ports to VLANs',
        description: 'Assign Fa0/2 to VLAN 10 (Sales) and Fa0/3 to VLAN 20 (Engineering).',
        points: 25,
        hint: {
          cisco: 'interface Fa0/2\nswitchport mode access\nswitchport access vlan 10\ninterface Fa0/3\nswitchport mode access\nswitchport access vlan 20',
        },
      },
      {
        id: 'roas_subinterfaces',
        title: 'Configure Router Sub-interfaces',
        description: 'Configure sub-interfaces Gi0/0.10 and Gi0/0.20 with dot1q encapsulation and gateway IPs.',
        points: 25,
        hint: {
          cisco: 'interface Gi0/0.10\nencapsulation dot1q 10\nip address 192.168.10.1 255.255.255.0\ninterface Gi0/0.20\nencapsulation dot1q 20\nip address 192.168.20.1 255.255.255.0',
        },
      },
      {
        id: 'inter_vlan_ping',
        title: 'Verify Inter-VLAN Ping Reachability',
        description: 'Send a ping from PC-Sales-1 (192.168.10.10) to PC-Eng-2 (192.168.20.20).',
        points: 25,
        hint: {
          cisco: 'Send Ping to 192.168.20.20 using the top tool bar',
        },
      },
    ],
    evaluator: (topology, events) => {
      const results: Record<string, boolean> = {};

      const sw1 = topology.nodes.find((n) => n.id === 'sw1');
      const fa1 = sw1?.interfaces.find((i) => i.name === 'Fa0/1');
      const fa2 = sw1?.interfaces.find((i) => i.name === 'Fa0/2');
      const fa3 = sw1?.interfaces.find((i) => i.name === 'Fa0/3');

      results['trunk_configured'] = fa1?.switchport_mode?.includes('trunk') === true;
      results['access_ports_assigned'] =
        fa2?.switchport_mode?.includes('10') === true &&
        fa3?.switchport_mode?.includes('20') === true;

      const r1 = topology.nodes.find((n) => n.id === 'r1');
      const sub10 = r1?.interfaces.find((i) => i.name === 'Gi0/0.10');
      const sub20 = r1?.interfaces.find((i) => i.name === 'Gi0/0.20');
      results['roas_subinterfaces'] =
        sub10?.encapsulation_vlan === 10 && sub20?.encapsulation_vlan === 20;

      results['inter_vlan_ping'] = events.some(
        (ev) =>
          ev.protocol === 'ICMP' &&
          ((ev.source_node === 'pc1' && ev.target_node === 'sw1') ||
            (ev.source_node === 'sw1' && ev.target_node === 'pc2'))
      );

      return results;
    },
  },
  {
    id: 'linux_host_admin',
    title: 'Lab 3: Linux Host Administration & IPRoute2',
    category: 'Linux Admin',
    difficulty: 'Beginner',
    description:
      'Practice real-world Linux command-line networking on a virtual Linux host using `iproute2` (`ip addr`, `ip link`, `ip route`).',
    preset: 'basic',
    objectives: [
      {
        id: 'linux_hostname',
        title: 'Set Linux Hostname',
        description: 'Set hostname of PC-1 to `web-server` using the Linux `hostname` command.',
        points: 25,
        hint: {
          linux: 'hostname web-server',
        },
      },
      {
        id: 'linux_link_up',
        title: 'Bring Interface UP',
        description: 'Ensure interface `eth0` on PC-1 is administratively UP using `ip link`.',
        points: 25,
        hint: {
          linux: 'ip link set eth0 up',
        },
      },
      {
        id: 'linux_ip_assigned',
        title: 'Assign IP Address via iproute2',
        description: 'Assign IP `192.168.1.50/24` to `eth0` using `ip addr add`.',
        points: 25,
        hint: {
          linux: 'ip addr add 192.168.1.50/24 dev eth0',
        },
      },
      {
        id: 'linux_ping_neighbor',
        title: 'Establish Ping to Local Neighbor',
        description: 'Ping PC-2 (192.168.1.20) from your configured Linux host.',
        points: 25,
        hint: {
          linux: 'Send Ping to 192.168.1.20 from top bar or CLI',
        },
      },
    ],
    evaluator: (topology, events) => {
      const results: Record<string, boolean> = {};

      const pc1 = topology.nodes.find((n) => n.id === 'pc1');
      results['linux_hostname'] = pc1?.hostname.toLowerCase() === 'web-server';

      const eth0 = pc1?.interfaces.find((i) => i.name === 'eth0');
      results['linux_link_up'] = eth0?.admin_status === 'up';
      results['linux_ip_assigned'] = eth0?.ip?.startsWith('192.168.1.50') === true;

      results['linux_ping_neighbor'] = events.some(
        (ev) =>
          ev.protocol === 'ICMP' &&
          ev.source_node === 'pc1' &&
          ev.target_node === 'sw1'
      );

      return results;
    },
  },
];
