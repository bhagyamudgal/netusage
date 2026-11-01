export const EN0_LINK_ROW =
  "en0  1500  <Link#15>  aa:bb:cc:dd:ee:ff  177878840  0  207983672357  66677122  0  51621443008  0";

export const UTUN_EMPTY_LINK_ROW = "utun0  1500  <Link#19>  0  0  0  1  0  80  0";

export const IBN_FIXTURE = `Name  Mtu   Network       Address            Ipkts Ierrs     Ibytes    Opkts Oerrs     Obytes  Coll
en0   1500  <Link#15>    aa:bb:cc:dd:ee:ff  177878840  0  207983672357  66677122  0  51621443008  0
en0   1500  192.0.2.0     192.0.2.10  177878840  0  207983672357  66677122  0  51621443008  0
utun0  1500  <Link#19>  0  0  0  1  0  80  0
utun9  1500  <Link#25>  0  0  0  5  0  400  0
utun9  1380  fe80::      fe80::1  0  0  0  3  0  240  0
utun9  1380  100.115.92.48  100.115.92.48  10  0  1000  8  0  800  0
utun5  1500  <Link#27>  0  0  0  7  0  560  0
utun5  1380  198.51.100.23  198.51.100.23  12  0  1200  9  0  900  0`;

export const ROUTES_WIFI_FIXTURE = `Routing tables

Internet:
Destination        Gateway            Flags      Netif Expire
default            192.168.5.1        UGScg      en0
default            192.168.5.1        UCSIg      en0
198.51.100.1       198.51.100.23      UH         utun5
100.115.92.48    100.115.92.48    UH         utun9`;

export const ROUTES_HOTSPOT_FIXTURE = `Routing tables

Internet:
Destination        Gateway            Flags      Netif Expire
default            172.20.10.1        UGScg      en0
default            172.20.10.1        UCSIg      en0`;

export const ROUTES_FULL_TUNNEL_FIXTURE = `Routing tables

Internet:
Destination        Gateway            Flags      Netif Expire
default            link#27            UCSG       utun5
default            192.168.5.1        UCSIg      en0`;

export const ROUTES_OFFLINE_FIXTURE = `Routing tables

Internet:
Destination        Gateway            Flags      Netif Expire
127.0.0.1          127.0.0.1          UH         lo0`;

export const ROUTES_FULL_TUNNEL_LIVE_FIXTURE = `Routing tables

Internet:
Destination        Gateway            Flags      Netif Expire
default            link#37            UCSg       utun10
default            192.168.0.1        UGScIg     en0
192.168.0.0/24     link#15            UCS        en0
192.168.0.10       aa:bb:cc:dd:ee:ff  UHLWi      en0
224.0.0.0/4        link#15            UmCS       en0
192.0.2.1          192.0.2.1          UH         bridge100
198.51.100.0/24    link#20            UCS        bridge100`;
