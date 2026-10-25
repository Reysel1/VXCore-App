import { io, type ManagerOptions, type Socket, type SocketOptions } from "socket.io-client";

import { AGENT_SOCKET_URL } from "@/lib/agent";
import { getSessionToken } from "@/lib/auth";

export function connectAgentSocket(options: Partial<ManagerOptions & SocketOptions> = {}): Socket {
  return io(AGENT_SOCKET_URL, {
    ...options,
    auth: (callback) => callback({ token: getSessionToken() }),
  });
}
