export function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

let tunnelHostname: string | null = null;

export function setTunnelHostname(hostname: string | null): void {
  tunnelHostname = hostname && hostname.trim() ? hostname.trim().toLowerCase() : null;
}

export function getTunnelHostname(): string | null {
  return tunnelHostname;
}

function listenHost(): string {
  return process.env.HOST || '127.0.0.1';
}

export function isExposed(): boolean {
  return !isLoopbackHostname(listenHost()) || tunnelHostname !== null;
}

export function isAllowedHostHeader(hostname: string): boolean {
  if (isLoopbackHostname(hostname)) return true;
  return tunnelHostname !== null && hostname.toLowerCase() === tunnelHostname;
}
